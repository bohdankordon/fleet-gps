const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("../dist/generated/prisma/client");
const { AuthRole } = require("../dist/generated/prisma/enums");
const { ADMIN_CARDINALITY_ADVISORY_LOCK_KEY, AdminUsersError, AdminUsersService } = require("../dist/modules/auth/admin-users.service");

const prefix = "acceptance-real-db-";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const database = { getClient: () => prisma };
const security = { generatePassword: () => "A".repeat(24), hashPassword: async () => ({ version: 1, salt: new Uint8Array(16), hash: new Uint8Array(32) }) };
const service = new AdminUsersService(database, security);

function user(login, role) {
  return { login, normalizedLogin: login, role, disabled: false, mustChangePassword: false, passwordHashVersion: 1, passwordSalt: new Uint8Array(16), passwordHash: new Uint8Array(32) };
}

async function cleanup() {
  const ids = (await prisma.authUser.findMany({ where: { normalizedLogin: { startsWith: prefix } }, select: { id: true } })).map(({ id }) => id);
  if (ids.length === 0) return;
  await prisma.$transaction([
    prisma.authSession.deleteMany({ where: { userId: { in: ids } } }),
    prisma.authUserPermission.deleteMany({ where: { userId: { in: ids } } }),
    prisma.authUser.deleteMany({ where: { id: { in: ids } } }),
  ]);
}

test("real PostgreSQL admin cardinality and user-state transactions", async () => {
  assert.equal(await prisma.authUser.count(), 0, "real-DB auth test requires an empty disposable auth state");
  try {
    const lockProof = await prisma.$transaction(async (transaction) => {
      const executed = await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_CARDINALITY_ADVISORY_LOCK_KEY})`;
      const rows = await transaction.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted) AS held`;
      return { executed, held: rows[0]?.held };
    });
    assert.deepEqual(lockProof, { executed: 1, held: true });

    const [adminA, adminB, target] = await prisma.$transaction([
      prisma.authUser.create({ data: user(`${prefix}admin-a`, AuthRole.ADMIN) }),
      prisma.authUser.create({ data: user(`${prefix}admin-b`, AuthRole.ADMIN) }),
      prisma.authUser.create({ data: user(`${prefix}target`, AuthRole.USER) }),
    ]);
    await prisma.authUserPermission.create({ data: { userId: target.id, key: "reports.view" } });
    await prisma.authSession.create({ data: { userId: target.id, tokenHash: crypto.randomBytes(32), expiresAt: new Date(Date.now() + 60_000) } });

    const replaced = await service.updateAccess(adminA.id, target.id, { role: "USER", permissions: ["historyAdmin.populate"] });
    assert.deepEqual(replaced.permissions, ["historyAdmin.view", "historyAdmin.populate"]);
    assert.equal((await service.disable(adminA.id, target.id)).disabled, true);
    assert.equal(await prisma.authSession.count({ where: { userId: target.id } }), 0);
    assert.equal((await service.enable(target.id)).disabled, false);
    assert.equal(await prisma.authSession.count({ where: { userId: target.id } }), 0);

    const promoted = await service.updateAccess(adminA.id, target.id, { role: "ADMIN", permissions: [] });
    assert.equal(promoted.role, AuthRole.ADMIN);
    assert.equal(await prisma.authUserPermission.count({ where: { userId: target.id } }), 0);
    const demoted = await service.updateAccess(adminA.id, target.id, { role: "USER", permissions: ["trips.view"] });
    assert.deepEqual(demoted.permissions, ["vehicles.view", "trips.view"]);

    await service.disable(adminA.id, adminB.id);
    await assert.rejects(service.disable(adminB.id, adminA.id), (error) => error instanceof AdminUsersError && error.code === "LAST_ENABLED_ADMIN");
    await assert.rejects(service.updateAccess(adminB.id, adminA.id, { role: "USER", permissions: ["reports.view"] }), (error) => error instanceof AdminUsersError && error.code === "LAST_ENABLED_ADMIN");

    await service.enable(adminB.id);
    const outcomes = await Promise.allSettled([service.disable(adminB.id, adminA.id), service.disable(adminA.id, adminB.id)]);
    assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(outcomes.filter((outcome) => outcome.status === "rejected" && outcome.reason instanceof AdminUsersError && outcome.reason.code === "LAST_ENABLED_ADMIN").length, 1);
    assert.equal(await prisma.authUser.count({ where: { role: AuthRole.ADMIN, disabled: false } }), 1);
  } finally {
    await cleanup();
  }
});

test.after(async () => { await cleanup(); await prisma.$disconnect(); });
