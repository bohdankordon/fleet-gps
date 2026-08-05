const { loadRootEnv } = require("./load-root-env.cjs");
loadRootEnv();
if (typeof process.env.DATABASE_URL !== "string" || process.env.DATABASE_URL.trim() === "") { console.log("errorType: configuration"); process.exitCode = 1; }
