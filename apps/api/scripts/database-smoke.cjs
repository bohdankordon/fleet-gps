const allowedErrors = new Set(["PrismaClientInitializationError", "PrismaClientKnownRequestError", "PrismaClientUnknownRequestError", "PrismaClientValidationError"]);
function errorType(error) { return error instanceof Error && allowedErrors.has(error.name) ? error.name : "unknown"; }
function validateStoredSettings(settings, validators) {
  if (settings?.id !== 1) throw new Error("database smoke assertion");
  const speed = validators.validateSpeedSettings(settings);
  const inactivity = validators.validateInactivitySettings(settings);
  const timezone = validators.validateTimezone(settings.timezone);
  const speedRuleEnabled = validators.validateRuleEnabled(settings.speedRuleEnabled);
  const inactivityRuleEnabled = validators.validateRuleEnabled(settings.inactivityRuleEnabled);
  const polygon = validators.validateGeoJsonPolygon(settings.cityGeofenceGeoJson);
  return Object.freeze({ speed, inactivity, timezone, speedRuleEnabled, inactivityRuleEnabled, polygon });
}
async function main() {
  let prisma;
  let result;
  let validated;
  let failed = false;
  try {
    if (typeof process.env.DATABASE_URL !== "string" || process.env.DATABASE_URL.trim() === "") { console.log("errorType: configuration"); process.exitCode = 1; return; }
    const { PrismaPg } = require("@prisma/adapter-pg");
    const { PrismaClient } = require("../dist/generated/prisma/client");
    const validators = require("../dist/modules/alert-settings/alert-settings.validation");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    await prisma.$queryRaw`SELECT 1`;
    const [vehicleCount, currentStateCount, dailyStatCount, settingsCount, settings, migrations] = await Promise.all([
      prisma.vehicle.count(), prisma.vehicleCurrentState.count(), prisma.dailyVehicleStat.count(), prisma.applicationSettings.count(), prisma.applicationSettings.findUnique({ where: { id: 1 }, select: { id: true, timezone: true, speedRuleEnabled: true, inactivityRuleEnabled: true, citySpeedLimitKph: true, outsideCitySpeedLimitKph: true, speedToleranceKph: true, speedingConfirmationUpdates: true, inactivityDistanceMeters: true, inactivityDurationMinutes: true, cityGeofenceGeoJson: true } }), prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
    ]);
    result = { vehicleCount, currentStateCount, dailyStatCount, settingsCount, settings, migrationApplied: Array.isArray(migrations) && migrations.some((item) => typeof item === "object" && item !== null && item.migration_name === "20260806112815_alert_rule_settings") };
    if (settingsCount !== 1 || !result.migrationApplied) throw new Error("database smoke assertion");
    validated = validateStoredSettings(settings, validators);
  } catch (error) {
    console.log(`errorType: ${errorType(error)}`); process.exitCode = 1; failed = true;
  } finally {
    if (prisma !== undefined) {
      try { await prisma.$disconnect(); }
      catch (error) { if (!failed) { console.log(`errorType: ${errorType(error)}`); process.exitCode = 1; failed = true; } }
    }
  }
  if (!failed && result !== undefined && validated !== undefined) { console.log("database reachable: true"); console.log(`migration applied: ${result.migrationApplied}`); console.log(`vehicle count: ${result.vehicleCount}`); console.log(`current state count: ${result.currentStateCount}`); console.log(`daily stat count: ${result.dailyStatCount}`); console.log(`settings count: ${result.settingsCount}`); console.log(`speed rule enabled: ${validated.speedRuleEnabled}`); console.log(`inactivity rule enabled: ${validated.inactivityRuleEnabled}`); console.log(`city speed limit: ${validated.speed.citySpeedLimitKph}`); console.log(`outside city speed limit: ${validated.speed.outsideCitySpeedLimitKph}`); console.log(`speed tolerance: ${validated.speed.speedToleranceKph}`); console.log(`speed confirmation updates: ${validated.speed.speedingConfirmationUpdates}`); console.log(`inactivity distance meters: ${validated.inactivity.inactivityDistanceMeters}`); console.log(`inactivity duration minutes: ${validated.inactivity.inactivityDurationMinutes}`); console.log(`city geofence configured: ${validated.polygon !== null}`); }
}
if (require.main === module) void main().catch(() => { console.log("errorType: unknown"); process.exitCode = 1; });

module.exports = { validateStoredSettings };
