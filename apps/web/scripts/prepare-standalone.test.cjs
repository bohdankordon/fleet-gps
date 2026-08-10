const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { copyRequiredAssets } = require("./prepare-standalone.cjs");

function write(file, text = file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taxi-gps-standalone-"));
  write(path.join(root, "public", "maplibre", "maplibre-gl-worker.mjs"), "worker");
  write(path.join(root, "public", "maplibre", "maplibre-gl-shared.mjs"), "shared");
  write(path.join(root, "public", "nested", "asset.txt"), "nested");
  write(path.join(root, ".next", "static", "chunks", "app.js"), "static");
  write(path.join(root, ".next", "standalone", "apps", "web", "server.js"), "server");
  write(path.join(root, ".env"), "not copied");
  return root;
}
test("copies required standalone assets recursively and idempotently", (t) => {
  const root = fixture(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = copyRequiredAssets(root); const standalone = first.standaloneWebRoot;
  assert.equal(fs.readFileSync(path.join(standalone, "public", "maplibre", "maplibre-gl-worker.mjs"), "utf8"), "worker");
  assert.equal(fs.readFileSync(path.join(standalone, "public", "maplibre", "maplibre-gl-shared.mjs"), "utf8"), "shared");
  assert.equal(fs.readFileSync(path.join(standalone, "public", "nested", "asset.txt"), "utf8"), "nested");
  assert.equal(fs.readFileSync(path.join(standalone, ".next", "static", "chunks", "app.js"), "utf8"), "static");
  assert.equal(fs.existsSync(path.join(standalone, ".env")), false);
  write(path.join(standalone, "public", "stale.txt")); copyRequiredAssets(root);
  assert.equal(fs.existsSync(path.join(standalone, "public", "stale.txt")), false);
});
test("fails clearly when a required source directory is missing", (t) => {
  const root = fixture(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.rmSync(path.join(root, ".next", "static"), { recursive: true });
  assert.throws(() => copyRequiredAssets(root), /Required Next static assets are missing/);
});
