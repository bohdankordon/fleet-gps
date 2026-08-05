const fs = require("node:fs");
const path = require("node:path");
const target = process.argv[2];
if (!target) process.exitCode = 1;
else fs.rmSync(path.resolve(process.cwd(), target), { recursive: true, force: true });
