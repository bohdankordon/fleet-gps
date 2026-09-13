const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { discoverCurrentSourceTests, inventoryHash } = require("./test-discovery.cjs");

const root = path.resolve(__dirname, "../.test-dist");
const sourceRoot = path.resolve(__dirname, "../src");
const { tests, excluded, sources } = discoverCurrentSourceTests(sourceRoot, root);
console.log(`Discovered ${tests.length} compiled API unit-test files from ${sources.length} current TypeScript sources; excluded ${excluded.length} real-DB files.`);
console.log(`Compiled API unit-test inventory SHA-256: ${inventoryHash(root, tests)}`);
for (const file of excluded) console.log(`Excluded real-DB test: ${path.relative(root, file)}`);
const result = spawnSync(process.execPath, ["--test", ...tests], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
