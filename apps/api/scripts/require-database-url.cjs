const { config } = require("dotenv");
const path = require("node:path");
config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });
if (typeof process.env.DATABASE_URL !== "string" || process.env.DATABASE_URL.trim() === "") { console.log("errorType: configuration"); process.exitCode = 1; }
