import { loadConfig } from "../config.js";

try {
  const config = loadConfig();
  console.log("eQuGPS configuration is valid.");
  console.log(`Base URL: ${config.baseUrl}`);
  console.log(`Timezone: ${config.timezone}`);
  console.log(`Request timeout: ${config.requestTimeoutMs} ms`);
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : "Configuration validation failed.");
  process.exitCode = 1;
}
