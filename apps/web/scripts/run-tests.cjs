const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const value = path.join(directory, entry.name);
    return entry.isDirectory() ? collect(value) : entry.name.endsWith(".test.js") ? [value] : [];
  });
}

const tests = collect(path.resolve(__dirname, "../.test-dist"));
const result = spawnSync(process.execPath, ["--test", ...tests], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
