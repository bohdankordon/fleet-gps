const { loadRootEnv } = require("./load-root-env.cjs");

const allowedFields = new Set([
  "EQUGPS_BASE_URL", "EQUGPS_WEB_BASE_URL", "EQUGPS_EMAIL", "EQUGPS_PASSWORD", "EQUGPS_REQUEST_TIMEOUT_MS", "EQUGPS_RUNS_TIMEOUT_MS",
  "DATABASE_URL", "DATABASE_POOL_MAX", "DATABASE_CONNECTION_TIMEOUT_MS", "DATABASE_IDLE_TIMEOUT_MS", "HOST", "PORT",
  "SYNC_SCHEDULER_ENABLED", "FLEET_SYNC_INTERVAL_SECONDS", "RUNS_SYNC_INTERVAL_SECONDS", "SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS",
]);

function safeFields(error) {
  if (!error || !Array.isArray(error.issues)) return [];
  return [...new Set(error.issues.filter((field) => typeof field === "string" && allowedFields.has(field)))].sort();
}

try {
  loadRootEnv();
  const { parseApiConfig } = require("../dist/config/api-config");
  parseApiConfig(process.env);
  console.log("api configuration valid: true");
} catch (error) {
  console.log("errorType: configuration");
  console.log(`invalid fields: ${safeFields(error).join(",")}`);
  process.exitCode = 1;
}
