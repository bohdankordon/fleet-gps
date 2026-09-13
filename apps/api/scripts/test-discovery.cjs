const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const REAL_DATABASE_TEST_PATTERN = /(?:^|[\\/])[^\\/]*real-db\.test\.js$/;

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRealDatabaseTest(file) {
  return REAL_DATABASE_TEST_PATTERN.test(file);
}

function collect(root, suffix) {
  const files = [];
  function visit(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => compare(left.name, right.name));
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith(suffix)) files.push(file);
    }
  }
  visit(root);
  return files.sort(compare);
}

function discoverCompiledTests(root) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Compiled test directory is missing: ${root}`);
  }
  const candidates = collect(root, ".test.js");
  const tests = [];
  const excluded = [];
  for (const file of candidates) (isRealDatabaseTest(file) ? excluded : tests).push(file);
  if (tests.length === 0) throw new Error(`No compiled unit tests found in: ${root}`);
  return Object.freeze({ tests: Object.freeze(tests), excluded: Object.freeze(excluded) });
}

function discoverCurrentSourceTests(sourceRoot, compiledRoot) {
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    throw new Error(`TypeScript test source directory is missing: ${sourceRoot}`);
  }
  const discovered = discoverCompiledTests(compiledRoot);
  const sources = collect(sourceRoot, ".test.ts");
  const expected = sources.map((file) => path.join(compiledRoot, path.relative(sourceRoot, file).slice(0, -3) + ".js")).sort(compare);
  const compiled = [...discovered.tests, ...discovered.excluded].sort(compare);
  const missing = expected.filter((file) => !compiled.includes(file));
  const stale = compiled.filter((file) => !expected.includes(file));
  if (missing.length > 0 || stale.length > 0) {
    const relative = (file) => path.relative(compiledRoot, file);
    throw new Error(`Compiled test inventory does not match current TypeScript sources. Missing: ${missing.map(relative).join(", ") || "none"}. Stale: ${stale.map(relative).join(", ") || "none"}.`);
  }
  return Object.freeze({ ...discovered, sources: Object.freeze(sources) });
}

function inventoryHash(root, files) {
  const relative = files.map((file) => path.relative(root, file).replaceAll("\\", "/"));
  return crypto.createHash("sha256").update(relative.join("\n")).digest("hex");
}

module.exports = { discoverCompiledTests, discoverCurrentSourceTests, inventoryHash, isRealDatabaseTest };
