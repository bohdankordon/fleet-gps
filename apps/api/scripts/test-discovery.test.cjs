const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { discoverCompiledTests, discoverCurrentSourceTests, inventoryHash, isRealDatabaseTest } = require("./test-discovery.cjs");

test("compiled test discovery is recursive, deterministic, and explicitly excludes real-DB files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-gps-api-test-discovery-"));
  try {
    fs.mkdirSync(path.join(root, "nested"));
    fs.writeFileSync(path.join(root, "z.test.js"), "");
    fs.writeFileSync(path.join(root, "nested", "a.test.js"), "");
    fs.writeFileSync(path.join(root, "nested", "operator-real-db.test.js"), "");
    fs.writeFileSync(path.join(root, "nested", "ignored.js"), "");
    const first = discoverCompiledTests(root);
    const second = discoverCompiledTests(root);
    assert.deepEqual(first, second);
    assert.deepEqual(first.tests.map((file) => path.relative(root, file)), [path.join("nested", "a.test.js"), "z.test.js"]);
    assert.deepEqual(first.excluded.map((file) => path.relative(root, file)), [path.join("nested", "operator-real-db.test.js")]);
    assert.equal(isRealDatabaseTest(path.join(root, "operator-real-db.test.js")), true);
    assert.equal(isRealDatabaseTest(path.join(root, "ordinary.test.js")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("repository discovery includes every representative formerly omitted unit area and no real-DB script", () => {
  const root = path.resolve(__dirname, "../.test-dist");
  const sourceRoot = path.resolve(__dirname, "../src");
  const { tests, excluded, sources } = discoverCurrentSourceTests(sourceRoot, root);
  const relative = tests.map((file) => path.relative(root, file).replaceAll("\\", "/"));
  for (const expected of [
    "modules/admin-settings/admin-settings.service.test.js",
    "modules/alert-notification-scheduler/alert-notification-scheduler.service.test.js",
    "modules/alert-notifications/alert-notification-dispatcher.service.test.js",
    "modules/telegram-linking/telegram-linking.service.test.js",
    "modules/position-history-retention/position-history-retention-execution.service.test.js",
    "modules/position-history-horizon-execution/position-history-horizon-execution.service.test.js",
  ]) assert.equal(relative.includes(expected), true, expected);
  assert.deepEqual([...tests].sort(), tests);
  assert.equal(new Set(tests).size, tests.length);
  assert.equal(sources.length, tests.length + excluded.length);
  assert.equal(excluded.length, 0);
  assert.equal(tests.some((file) => file.endsWith(".test.cjs")), false);
  assert.equal(tests.some((file) => file.includes("real-db")), false);
  assert.match(inventoryHash(root, tests), /^[0-9a-f]{64}$/);
});

test("current-source enforcement rejects both stale compiled output and missing compilation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-gps-api-source-inventory-"));
  const sourceRoot = path.join(root, "src");
  const compiledRoot = path.join(root, ".test-dist");
  try {
    fs.mkdirSync(path.join(sourceRoot, "nested"), { recursive: true });
    fs.mkdirSync(path.join(compiledRoot, "nested"), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, "nested", "current.test.ts"), "");
    fs.writeFileSync(path.join(compiledRoot, "nested", "current.test.js"), "");
    assert.equal(discoverCurrentSourceTests(sourceRoot, compiledRoot).tests.length, 1);

    fs.writeFileSync(path.join(compiledRoot, "nested", "stale.test.js"), "");
    assert.throws(() => discoverCurrentSourceTests(sourceRoot, compiledRoot), /Stale: nested[\\/]stale\.test\.js/);
    fs.rmSync(path.join(compiledRoot, "nested", "stale.test.js"));

    fs.writeFileSync(path.join(sourceRoot, "nested", "missing.test.ts"), "");
    assert.throws(() => discoverCurrentSourceTests(sourceRoot, compiledRoot), /Missing: nested[\\/]missing\.test\.js/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("standard test lifecycle cleans the dedicated output before compiling and discovering", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
  const command = packageJson.scripts.test;
  const clean = command.indexOf("node scripts/clean-output.cjs .test-dist");
  const compile = command.indexOf("tsc -p tsconfig.test.json");
  const discover = command.indexOf("node scripts/run-tests.cjs");
  assert.ok(clean >= 0 && clean < compile && compile < discover, command);
  assert.doesNotMatch(command, /rm -rf|find |xargs|globstar|powershell/i);
});

test("discovery fails closed when no compiled unit tests exist", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-gps-api-empty-tests-"));
  try {
    assert.throws(() => discoverCompiledTests(root), /No compiled unit tests found/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
