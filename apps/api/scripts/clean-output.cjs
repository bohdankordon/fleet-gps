const fs = require("node:fs");
const path = require("node:path");
const target = process.argv[2];
if (typeof target !== "string" || !/^(dist|\.test-dist)$/.test(target)) throw new Error("Unsupported output directory.");
fs.rmSync(path.join(process.cwd(), target), { recursive: true, force: true });
