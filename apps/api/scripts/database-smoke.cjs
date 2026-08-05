const allowedErrors = new Set(["PrismaClientInitializationError", "PrismaClientKnownRequestError", "PrismaClientUnknownRequestError", "PrismaClientValidationError"]);
function errorType(error) { return error instanceof Error && allowedErrors.has(error.name) ? error.name : "unknown"; }
async function main() {
  let prisma;
  let result;
  let failed = false;
  try {
    if (typeof process.env.DATABASE_URL !== "string" || process.env.DATABASE_URL.trim() === "") { console.log("errorType: configuration"); process.exitCode = 1; return; }
    const { PrismaPg } = require("@prisma/adapter-pg");
    const { PrismaClient } = require("../dist/generated/prisma/client");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    await prisma.$queryRaw`SELECT 1`;
    const [vehicleCount, currentStateCount, dailyStatCount, settingsCount, settings, migrations] = await Promise.all([
      prisma.vehicle.count(), prisma.vehicleCurrentState.count(), prisma.dailyVehicleStat.count(), prisma.applicationSettings.count(), prisma.applicationSettings.findUnique({ where: { id: 1 }, select: { id: true } }), prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
    ]);
    result = { vehicleCount, currentStateCount, dailyStatCount, settingsCount, defaultSettingsPresent: settings?.id === 1, migrationApplied: Array.isArray(migrations) && migrations.some((item) => typeof item === "object" && item !== null && item.migration_name === "20260805_init_core") };
  } catch (error) {
    console.log(`errorType: ${errorType(error)}`); process.exitCode = 1; failed = true;
  } finally {
    if (prisma !== undefined) {
      try { await prisma.$disconnect(); }
      catch (error) { if (!failed) { console.log(`errorType: ${errorType(error)}`); process.exitCode = 1; failed = true; } }
    }
  }
  if (!failed && result !== undefined) { console.log("database reachable: true"); console.log(`migration applied: ${result.migrationApplied}`); console.log(`vehicle count: ${result.vehicleCount}`); console.log(`current state count: ${result.currentStateCount}`); console.log(`daily stat count: ${result.dailyStatCount}`); console.log(`settings count: ${result.settingsCount}`); console.log(`default settings present: ${result.defaultSettingsPresent}`); }
}
void main().catch(() => { console.log("errorType: unknown"); process.exitCode = 1; });
