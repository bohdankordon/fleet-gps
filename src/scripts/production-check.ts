import { createRequire } from "node:module";
import { parseWebConfig, WebConfigurationError } from "../../apps/web/src/lib/web-config.ts";

const require = createRequire(import.meta.url);
const { ApiConfigurationError, parseApiConfig } = require("../../apps/api/dist/config/api-config.js") as typeof import("../../apps/api/src/config/api-config.ts");

try {
  const productionEnvironment = { ...process.env, NODE_ENV: "production" };
  parseApiConfig(productionEnvironment);
  parseWebConfig(productionEnvironment);
  process.stdout.write("production configuration valid: true\n");
} catch (error) {
  const fields = error instanceof ApiConfigurationError || error instanceof WebConfigurationError ? error.issues : [];
  process.stderr.write(`production configuration valid: false${fields.length > 0 ? `; invalid fields: ${[...new Set(fields)].sort().join(",")}` : ""}\n`);
  process.exitCode = 1;
}
