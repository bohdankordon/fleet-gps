const assert = require("node:assert/strict");
const test = require("node:test");
const { createTestPgClient, resetTestDatabase, withTestPrisma } = require("../test-support/isolated-postgres.cjs");
const { AuthRole, VehicleAccessMode } = require("../dist/generated/prisma/enums");
const { AdminUsersError, AdminUsersService } = require("../dist/modules/auth/admin-users.service");
const { AuditEventRepository } = require("../dist/modules/audit/audit.repository");
const { applyVehicleScope, VehicleScopeService } = require("../dist/modules/vehicle-access/vehicle-access.service");
const { VehicleGroupsError, VehicleGroupsService } = require("../dist/modules/vehicle-groups/vehicle-groups.service");

const security = { generatePassword: () => "A".repeat(24), hashPassword: async () => ({ version: 1, salt: new Uint8Array(16), hash: new Uint8Array(32) }) };
const userData = (login, role) => ({ login, normalizedLogin: login.toLowerCase(), role, disabled: false, mustChangePassword: false, passwordHashVersion: 1, passwordSalt: new Uint8Array(16), passwordHash: new Uint8Array(32) });
const actor = (user) => ({ actorType: "USER", actorUserId: user.id, actorLoginSnapshot: user.login });

test("Stage A vehicle groups and product vehicle access semantics", async () => {
  const pg = await createTestPgClient();
  try { await resetTestDatabase(pg); } finally { await pg.end(); }
  try {
    return await withTestPrisma(async (prisma) => {
  const database = { getClient: () => prisma };
  const audit = new AuditEventRepository(database);
  const users = new AdminUsersService(database, security, audit);
  const groups = new VehicleGroupsService(database, audit);
  const scopes = new VehicleScopeService(database);

  const admin = await prisma.authUser.create({ data: userData("stage-a-admin", AuthRole.ADMIN) });
  const existingUser = await prisma.authUser.create({ data: userData("stage-a-existing", AuthRole.USER) });
  assert.equal(existingUser.vehicleAccessMode, VehicleAccessMode.ALL, "existing USER rows retain full-fleet access through the database default");
  assert.equal((await scopes.resolve(admin.id)).kind, "UNRESTRICTED");
  assert.equal((await scopes.resolve(existingUser.id)).kind, "UNRESTRICTED");
  await assert.rejects(prisma.authUser.update({ where: { id: admin.id }, data: { vehicleAccessMode: VehicleAccessMode.SELECTED } }));

  const taxi = await groups.create(actor(admin), { name: "  Taxi  ", color: "BLUE" });
  assert.equal(taxi.name, "Taxi");
  assert.equal(taxi.color, "BLUE");
  await assert.rejects(groups.create(actor(admin), { name: "tAXI", color: "CYAN" }), (error) => error instanceof VehicleGroupsError && error.code === "DUPLICATE_NAME");
  await assert.rejects(prisma.vehicleGroup.create({ data: { name: "TAXI" } }), (error) => error && error.code === "P2002");
  await assert.rejects(prisma.$executeRawUnsafe(`INSERT INTO "vehicle_groups" ("id", "name", "updated_at") VALUES (gen_random_uuid(), ' bad ', CURRENT_TIMESTAMP)`));
  const support = await groups.create(actor(admin), { name: "Support", color: "ORANGE" });
  const updatedSupport = await groups.updateDetails(actor(admin), support.id, { name: "Field Support", color: "PURPLE" });
  assert.equal(updatedSupport.name, "Field Support");
  assert.equal(updatedSupport.color, "PURPLE");

  const vehicleA = await prisma.vehicle.create({ data: { externalDeviceId: 910001, name: "Car A" } });
  const vehicleB = await prisma.vehicle.create({ data: { externalDeviceId: 910002, name: "Car B" } });
  const vehicleC = await prisma.vehicle.create({ data: { externalDeviceId: 910003, name: "Car C" } });
  assert.equal(vehicleA.groupId, null, "existing vehicles remain valid and ungrouped");
  await groups.replaceVehicles(actor(admin), taxi.id, { vehicleIds: [vehicleA.id] });
  await groups.replaceVehicles(actor(admin), support.id, { vehicleIds: [vehicleA.id] });
  assert.equal((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleA.id } })).groupId, support.id, "one nullable FK gives one-or-zero membership");
  assert.equal((await groups.detail(taxi.id)).vehicleCount, 0);
  await groups.replaceVehicles(actor(admin), taxi.id, { vehicleIds: [vehicleA.id] });

  await assert.rejects(users.create(actor(admin), { login: "bad-group", role: "USER", permissions: [], vehicleAccess: { mode: "SELECTED", groupIds: ["00000000-0000-4000-8000-000000000099"], vehicleIds: [] } }), (error) => error instanceof AdminUsersError && error.code === "INVALID_GROUP_REFERENCE");
  await assert.rejects(users.create(actor(admin), { login: "bad-vehicle", role: "USER", permissions: [], vehicleAccess: { mode: "SELECTED", groupIds: [], vehicleIds: ["00000000-0000-4000-8000-000000000099"] } }), (error) => error instanceof AdminUsersError && error.code === "INVALID_VEHICLE_REFERENCE");

  const created = await users.create(actor(admin), { login: "stage-a-selected", role: "USER", permissions: ["vehicles.view"], vehicleAccess: { mode: "SELECTED", groupIds: [taxi.id], vehicleIds: [vehicleB.id] } });
  const selectedUser = created.user;
  assert.deepEqual(selectedUser.vehicleAccess, { mode: "SELECTED", groupIds: [taxi.id], vehicleIds: [vehicleB.id] });
  async function authorizedVehicleIds() {
    const scope = await scopes.resolve(selectedUser.id);
    return (await prisma.vehicle.findMany({ where: applyVehicleScope(scope), orderBy: { externalDeviceId: "asc" }, select: { id: true } })).map(({ id }) => id);
  }
  assert.deepEqual(await authorizedVehicleIds(), [vehicleA.id, vehicleB.id], "SELECTED is the union of dynamic group and direct grants");
  await groups.replaceVehicles(actor(admin), taxi.id, { vehicleIds: [vehicleA.id, vehicleC.id] });
  assert.deepEqual(await authorizedVehicleIds(), [vehicleA.id, vehicleB.id, vehicleC.id], "new group members become accessible without direct grant copies");
  await groups.replaceVehicles(actor(admin), taxi.id, { vehicleIds: [vehicleA.id] });
  assert.deepEqual(await authorizedVehicleIds(), [vehicleA.id, vehicleB.id], "group-derived access disappears when membership is lost");

  await users.updateAccess(actor(admin), selectedUser.id, { role: "USER", permissions: ["vehicles.view"], vehicleAccess: { mode: "SELECTED", groupIds: [taxi.id], vehicleIds: [vehicleA.id, vehicleB.id] } });
  await groups.delete(actor(admin), taxi.id);
  assert.equal(await prisma.vehicle.count({ where: { id: { in: [vehicleA.id, vehicleB.id, vehicleC.id] } } }), 3);
  assert.equal((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleA.id } })).groupId, null);
  assert.equal(await prisma.authUserVehicleGroupGrant.count({ where: { userId: selectedUser.id } }), 0);
  assert.equal(await prisma.authUserVehicleGrant.count({ where: { userId: selectedUser.id } }), 2);
  assert.deepEqual(await authorizedVehicleIds(), [vehicleA.id, vehicleB.id], "direct grants survive group deletion and loss of group-derived access");

  const promoted = await users.updateAccess(actor(admin), selectedUser.id, { role: "ADMIN", permissions: [] });
  assert.equal(promoted.role, AuthRole.ADMIN);
  assert.deepEqual(promoted.vehicleAccess, { mode: "ALL", groupIds: [], vehicleIds: [] });
  assert.equal(await prisma.authUserVehicleGrant.count({ where: { userId: selectedUser.id } }), 0, "USER -> ADMIN removes dormant ACL rows");
  await assert.rejects(prisma.authUserVehicleGroupGrant.create({ data: { userId: selectedUser.id, groupId: support.id } }), /USER \+ SELECTED/);
  await assert.rejects(users.updateAccess(actor(admin), selectedUser.id, { role: "USER", permissions: ["vehicles.view"] }), (error) => error instanceof AdminUsersError && error.code === "INVALID_INPUT");
  const demoted = await users.updateAccess(actor(admin), selectedUser.id, { role: "USER", permissions: ["vehicles.view"], vehicleAccess: { mode: "SELECTED", groupIds: [support.id], vehicleIds: [vehicleC.id] } });
  assert.deepEqual(demoted.vehicleAccess, { mode: "SELECTED", groupIds: [support.id], vehicleIds: [vehicleC.id] }, "ADMIN -> USER persists only the complete explicitly supplied state");

  const failingAudit = { append: async () => { throw new Error("controlled audit failure"); } };
  const atomicGroups = new VehicleGroupsService(database, failingAudit);
  const beforeGroupCount = await prisma.vehicleGroup.count();
  await assert.rejects(atomicGroups.create(actor(admin), { name: "Must Roll Back", color: "GRAY" }), /controlled audit failure/);
  assert.equal(await prisma.vehicleGroup.count(), beforeGroupCount, "group mutation rolls back when audit append fails");
  const atomicUsers = new AdminUsersService(database, security, failingAudit);
  const beforeAccess = await users.detail(existingUser.id);
  await assert.rejects(atomicUsers.updateAccess(actor(admin), existingUser.id, { role: "USER", permissions: [], vehicleAccess: { mode: "SELECTED", groupIds: [support.id], vehicleIds: [] } }), /controlled audit failure/);
  assert.deepEqual((await users.detail(existingUser.id)).vehicleAccess, beforeAccess.vehicleAccess, "authorization mutation rolls back when audit append fails");

  const eventTypes = new Set((await prisma.auditEvent.findMany({ select: { eventType: true } })).map(({ eventType }) => eventType));
  for (const required of ["VEHICLE_GROUP_CREATED", "VEHICLE_GROUP_UPDATED", "VEHICLE_GROUP_MEMBERSHIP_CHANGED", "VEHICLE_GROUP_DELETED", "USER_VEHICLE_ACCESS_CHANGED"]) assert.equal(eventTypes.has(required), true, required);
  const accessAudit = await prisma.auditEvent.findFirstOrThrow({ where: { eventType: "USER_VEHICLE_ACCESS_CHANGED", targetId: selectedUser.id }, orderBy: { createdAt: "asc" } });
  assert.equal(JSON.stringify(accessAudit.details).includes(created.temporaryPassword), false);
    });
  } finally {
    const cleanup = await createTestPgClient();
    try { await resetTestDatabase(cleanup); } finally { await cleanup.end(); }
  }
});
