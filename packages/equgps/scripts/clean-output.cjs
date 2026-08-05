const { rmSync } = require("node:fs");
const { resolve } = require("node:path");

const output = process.argv[2];
if (output !== "dist" && output !== ".test-dist") {
  throw new Error("Only dist or .test-dist may be cleaned.");
}

rmSync(resolve(process.cwd(), output), { recursive: true, force: true });
