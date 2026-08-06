import assert from "node:assert/strict";
import test from "node:test";

const cli = require("../../../scripts/city-geofence-import.cjs") as { MAX_FILE_BYTES: number; parseArguments(argv: string[]): unknown; run(argv: string[], dependencies: Record<string, unknown>): Promise<number> };
const polygon = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
const validatePolygon = (input: unknown) => {
  if ((input as { type?: unknown })?.type !== "Polygon") throw new Error("raw value");
  return polygon;
};

test("rejects absent, unknown, conflicting, and unsafe clear arguments", () => {
  for (const argv of [[], ["--unexpected"], ["--clear"], ["--file", "x", "--clear", "--apply"], ["--file", "x", "--dry-run", "--apply"], ["--clear", "--dry-run"], ["--file", "x", "--file", "y", "--dry-run"], ["--clear", "--clear", "--apply"], ["--file", "x", "--dry-run", "--dry-run"], ["--file", "x", "--apply", "--apply"]]) assert.throws(() => cli.parseArguments(argv));
});

test("dry run validates only a raw Polygon and does not initialize configuration, Nest, or a database", async () => {
  const output: string[] = [];
  let initialized = 0;
  let loadedEnv = 0;
  const code = await cli.run(["--file", "fixture.json", "--dry-run"], { fs: { statSync: () => ({ isFile: () => true, size: 100 }), readFileSync: () => Buffer.from(JSON.stringify(polygon)) }, validatePolygon, loadRootEnv: () => { loadedEnv += 1; }, createApplicationContext: async () => { initialized += 1; throw new Error("must not initialize"); }, output: (line: string) => output.push(line) });
  assert.equal(code, 0);
  assert.equal(initialized, 0);
  assert.equal(loadedEnv, 0);
  assert.ok(output.includes("polygon valid: true"));
  assert.ok(output.includes("database write performed: false"));
  assert.ok(output.includes("geofence configured after operation: false"));
  assert.equal(output.join(" ").includes("[0,0]"), false);
});

test("apply loads root env, forces scheduler disabled, uses CityGeofenceModule, and restores environment", async () => {
  const calls: string[] = [];
  let closed = 0;
  let loadedEnv = 0;
  const previous = process.env.SYNC_SCHEDULER_ENABLED;
  process.env.SYNC_SCHEDULER_ENABLED = "previous";
  const app = { get: () => ({ replaceCityGeofence: async () => { calls.push("replace"); }, clearCityGeofence: async () => { calls.push("clear"); } }), close: async () => { closed += 1; } };
  class CityGeofenceModule {}
  class ManagementService {}
  try {
    const common = { fs: { statSync: () => ({ isFile: () => true, size: 100 }), readFileSync: () => Buffer.from(JSON.stringify(polygon)) }, validatePolygon, loadRootEnv: () => { loadedEnv += 1; process.env.SYNC_SCHEDULER_ENABLED = "from-env"; }, createApplicationContext: async (module: unknown) => { assert.equal(module, CityGeofenceModule); assert.equal(process.env.SYNC_SCHEDULER_ENABLED, "false"); return app; }, CityGeofenceModule, ManagementService, output: () => undefined };
    assert.equal(await cli.run(["--file", "fixture.json", "--apply"], common), 0);
    assert.equal(await cli.run(["--clear", "--apply"], common), 0);
    assert.deepEqual(calls, ["replace", "clear"]);
    assert.equal(closed, 2);
    assert.equal(loadedEnv, 2);
    assert.equal(process.env.SYNC_SCHEDULER_ENABLED, "previous");
  } finally {
    if (previous === undefined) delete process.env.SYNC_SCHEDULER_ENABLED;
    else process.env.SYNC_SCHEDULER_ENABLED = previous;
  }
});

test("fails safely for missing, oversized, invalid UTF-8, malformed, Feature, and oversized-read inputs", async () => {
  for (const dependency of [
    { fs: { statSync: () => { throw new Error("C:/secret.json"); } } },
    { fs: { statSync: () => ({ isFile: () => true, size: cli.MAX_FILE_BYTES + 1 }) } },
    { fs: { statSync: () => ({ isFile: () => true, size: 1 }), readFileSync: () => Buffer.alloc(cli.MAX_FILE_BYTES + 1) } },
    { fs: { statSync: () => ({ isFile: () => true, size: 1 }), readFileSync: () => Buffer.from([0xc3, 0x28]) } },
    { fs: { statSync: () => ({ isFile: () => true, size: 1 }), readFileSync: () => Buffer.from("{") } },
    { fs: { statSync: () => ({ isFile: () => true, size: 1 }), readFileSync: () => Buffer.from(JSON.stringify({ type: "Feature", coordinates: [[1, 2]] })) }, validatePolygon },
  ]) {
    const output: string[] = [];
    const code = await cli.run(["--file", "private-coordinates.json", "--dry-run"], { ...dependency, output: (line: string) => output.push(line) });
    assert.equal(code, 1);
    assert.ok(output.includes("database write performed: false"));
    assert.ok(output.includes("operation result: failed"));
    assert.equal(output.join(" ").includes("private"), false);
    assert.equal(output.join(" ").includes("coordinates"), false);
  }
  const output: string[] = [];
  class CityGeofenceModule {}
  class ManagementService {}
  const app = { get: () => ({ replaceCityGeofence: async () => { throw new Error("[12,34] raw failure"); } }), close: async () => undefined };
  const code = await cli.run(["--file", "private-path.json", "--apply"], { fs: { statSync: () => ({ isFile: () => true, size: 100 }), readFileSync: () => Buffer.from(JSON.stringify(polygon)) }, validatePolygon, loadRootEnv: () => undefined, createApplicationContext: async () => app, CityGeofenceModule, ManagementService, output: (line: string) => output.push(line) });
  assert.equal(code, 1);
  assert.ok(output.includes("geofence configured after operation: false"));
  assert.ok(output.includes("operation result: failed"));
  assert.equal(output.join(" ").includes("private-path"), false);
  assert.equal(output.join(" ").includes("[12,34]"), false);
  assert.equal(output.join(" ").includes("raw failure"), false);
});
