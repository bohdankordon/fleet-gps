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

test("default NestFactory path preserves the NestFactory receiver and writes once", async () => {
  const output: string[] = [];
  let writes = 0;
  let closed = 0;
  class CityGeofenceModule {}
  class ManagementService {}
  const app = {
    get: (service: unknown) => {
      assert.equal(service, ManagementService);
      return { replaceCityGeofence: async () => { writes += 1; } };
    },
    close: async () => { closed += 1; },
  };
  const NestFactory = {
    async createApplicationContext(this: unknown, module: unknown, options: unknown) {
      assert.equal(this, NestFactory);
      assert.equal(module, CityGeofenceModule);
      assert.deepEqual(options, { logger: false, abortOnError: false });
      return app;
    },
  };
  const code = await cli.run(["--file", "fixture.json", "--apply"], {
    fs: { statSync: () => ({ isFile: () => true, size: 100 }), readFileSync: () => Buffer.from(JSON.stringify(polygon)) },
    validatePolygon,
    loadRootEnv: () => undefined,
    NestFactory,
    CityGeofenceModule,
    ManagementService,
    output: (line: string) => output.push(line),
  });
  assert.equal(code, 0);
  assert.equal(writes, 1);
  assert.equal(closed, 1);
  assert.ok(output.includes("database write performed: true"));
  assert.ok(output.includes("geofence configured after operation: true"));
  assert.ok(output.includes("application closed: true"));
});

test("failure before management write keeps the safe no-write state", async () => {
  const output: string[] = [];
  let writes = 0;
  let closed = 0;
  class CityGeofenceModule {}
  class ManagementService {}
  const app = {
    get: () => {
      throw new Error("management unavailable");
    },
    close: async () => { closed += 1; },
  };
  const NestFactory = {
    async createApplicationContext() {
      return app;
    },
  };
  const code = await cli.run(["--file", "fixture.json", "--apply"], {
    fs: { statSync: () => ({ isFile: () => true, size: 100 }), readFileSync: () => Buffer.from(JSON.stringify(polygon)) },
    validatePolygon,
    loadRootEnv: () => undefined,
    NestFactory,
    CityGeofenceModule,
    ManagementService,
    output: (line: string) => output.push(line),
  });
  assert.equal(code, 1);
  assert.equal(writes, 0);
  assert.equal(closed, 1);
  assert.ok(output.includes("database write performed: false"));
  assert.ok(output.includes("geofence configured after operation: false"));
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

test("explicit env file argument is explicit and order independent", () => {
  const withFile = cli.parseArguments(["--file", "a.geojson", "--apply", "--env-file", ".env.production"]) as { envFile?: string };
  assert.equal(withFile.envFile, ".env.production");
  const reordered = cli.parseArguments(["--env-file", ".env.production", "--file", "a.geojson", "--apply"]) as { envFile?: string };
  assert.equal(reordered.envFile, ".env.production");
  const clearForm = cli.parseArguments(["--clear", "--apply", "--env-file", ".env.production"]) as { envFile?: string };
  assert.equal(clearForm.envFile, ".env.production");
  for (const argv of [
    ["--file", "a", "--dry-run", "--env-file", ".env.production"],
    ["--clear", "--apply", "--env-file", ".env.production", "--dry-run"],
    ["--file", "a", "--apply", "--env-file"],
    ["--file", "a", "--apply", "--env-file", "--apply"],
    ["--file", "a", "--apply", "--env-file", "x", "--env-file", "y"],
    ["--file", "a", "--apply", "--env-file=.env.production"],
  ]) assert.throws(() => cli.parseArguments(argv));
});

test("dry run stays pure and reports no error stage", async () => {
  const output: string[] = [];
  let rootLoads = 0;
  let explicitLoads = 0;
  let initialized = 0;
  const code = await cli.run(["--file", "fixture.json", "--dry-run"], {
    fs: { statSync: () => ({ isFile: () => true, size: 100 }), readFileSync: () => Buffer.from(JSON.stringify(polygon)) },
    validatePolygon,
    loadRootEnv: () => { rootLoads += 1; },
    loadEnvFile: () => { explicitLoads += 1; },
    createApplicationContext: async () => { initialized += 1; throw new Error("must not initialize"); },
    output: (line: string) => output.push(line),
  });
  assert.equal(code, 0);
  assert.equal(rootLoads, 0);
  assert.equal(explicitLoads, 0);
  assert.equal(initialized, 0);
  assert.ok(output.includes("error stage: none"));
  assert.ok(output.includes("error type: none"));
  assert.ok(output.includes("operation result: succeeded"));
});

test("default apply keeps local root env behavior", async () => {
  const output: string[] = [];
  let rootLoads = 0;
  let explicitLoads = 0;
  const app = { get: () => ({ replaceCityGeofence: async () => undefined }), close: async () => undefined };
  class CityGeofenceModule {}
  class ManagementService {}
  const code = await cli.run(["--file", "fixture.json", "--apply"], {
    fs: { statSync: () => ({ isFile: () => true, size: 100 }), readFileSync: () => Buffer.from(JSON.stringify(polygon)) },
    validatePolygon,
    loadRootEnv: () => { rootLoads += 1; },
    loadEnvFile: () => { explicitLoads += 1; },
    createApplicationContext: async () => app,
    CityGeofenceModule,
    ManagementService,
    output: (line: string) => output.push(line),
  });
  assert.equal(code, 0);
  assert.equal(rootLoads, 1);
  assert.equal(explicitLoads, 0);
  assert.ok(output.includes("error stage: none"));
  assert.ok(output.includes("database write performed: true"));
});

test("explicit env file loads before Nest and restores environment", async () => {
  const order: string[] = [];
  const output: string[] = [];
  const previousScheduler = process.env.SYNC_SCHEDULER_ENABLED;
  const previousKeep = process.env.CITY_GEOFENCE_TEST_KEEP;
  process.env.SYNC_SCHEDULER_ENABLED = "previous-value";
  process.env.CITY_GEOFENCE_TEST_KEEP = "keep-me";
  const app = { get: () => ({ replaceCityGeofence: async () => { order.push("write"); } }), close: async () => undefined };
  class CityGeofenceModule {}
  class ManagementService {}
  try {
    const code = await cli.run(["--file", "fixture.json", "--apply", "--env-file", ".env.production"], {
      fs: {
        statSync: (target: string) => {
          if (String(target).endsWith(".env.production")) return { isFile: () => true, size: 100 };
          return { isFile: () => true, size: 100 };
        },
        readFileSync: () => Buffer.from(JSON.stringify(polygon)),
      },
      validatePolygon,
      loadRootEnv: () => { throw new Error("root loader must not run"); },
      loadEnvFile: (resolved: string) => {
        assert.ok(String(resolved).endsWith(".env.production"));
        order.push("loader");
        assert.equal(process.env.SYNC_SCHEDULER_ENABLED, "previous-value");
        process.env.CITY_GEOFENCE_TEST_KEEP = "changed";
        (process.env as Record<string, string>).CITY_GEOFENCE_TEST_ADDED = "added";
      },
      createApplicationContext: async (module: unknown) => {
        assert.equal(module, CityGeofenceModule);
        assert.equal(process.env.SYNC_SCHEDULER_ENABLED, "false");
        order.push("nest");
        return app;
      },
      CityGeofenceModule,
      ManagementService,
      output: (line: string) => output.push(line),
    });
    assert.equal(code, 0);
    assert.deepEqual(order, ["loader", "nest", "write"]);
    assert.ok(output.includes("database write performed: true"));
    assert.ok(output.includes("geofence configured after operation: true"));
    assert.equal(process.env.SYNC_SCHEDULER_ENABLED, "previous-value");
    assert.equal(process.env.CITY_GEOFENCE_TEST_KEEP, "keep-me");
    assert.equal(process.env.CITY_GEOFENCE_TEST_ADDED, undefined);
  } finally {
    if (previousScheduler === undefined) delete process.env.SYNC_SCHEDULER_ENABLED;
    else process.env.SYNC_SCHEDULER_ENABLED = previousScheduler;
    if (previousKeep === undefined) delete process.env.CITY_GEOFENCE_TEST_KEEP;
    else process.env.CITY_GEOFENCE_TEST_KEEP = previousKeep;
    delete process.env.CITY_GEOFENCE_TEST_ADDED;
  }
});

test("explicit env file clear apply works", async () => {
  const output: string[] = [];
  let loads = 0;
  let cleared = 0;
  const app = { get: () => ({ clearCityGeofence: async () => { cleared += 1; } }), close: async () => undefined };
  class CityGeofenceModule {}
  class ManagementService {}
  const code = await cli.run(["--clear", "--apply", "--env-file", ".env.production"], {
    fs: { statSync: () => ({ isFile: () => true, size: 10 }) },
    validatePolygon,
    loadEnvFile: () => { loads += 1; },
    loadRootEnv: () => { throw new Error("root loader must not run"); },
    createApplicationContext: async () => app,
    CityGeofenceModule,
    ManagementService,
    output: (line: string) => output.push(line),
  });
  assert.equal(code, 0);
  assert.equal(loads, 1);
  assert.equal(cleared, 1);
  assert.ok(output.includes("mode: clear"));
  assert.ok(output.includes("database write performed: true"));
  assert.ok(output.includes("geofence configured after operation: false"));
});

test("env file with dry run is rejected safely", async () => {
  const output: string[] = [];
  const code = await cli.run(["--file", "secret-path.json", "--dry-run", "--env-file", ".env.production"], {
    fs: { statSync: () => ({ isFile: () => true, size: 100 }), readFileSync: () => Buffer.from(JSON.stringify(polygon)) },
    validatePolygon,
    loadEnvFile: () => { throw new Error("must not load"); },
    loadRootEnv: () => { throw new Error("must not load"); },
    output: (line: string) => output.push(line),
  });
  assert.equal(code, 1);
  assert.ok(output.includes("error stage: input"));
  assert.ok(output.includes("database write performed: false"));
  assert.equal(output.join(" ").includes("secret-path"), false);
  assert.equal(output.join(" ").includes(".env.production"), false);
});

test("missing duplicate and malformed env file arguments fail safely", async () => {
  for (const argv of [
    ["--file", "x.json", "--apply", "--env-file"],
    ["--file", "x.json", "--apply", "--env-file", "a", "--env-file", "b"],
    ["--file", "x.json", "--apply", "--env-file=.env.production"],
  ]) {
    const output: string[] = [];
    const code = await cli.run(argv, { output: (line: string) => output.push(line) });
    assert.equal(code, 1);
    assert.ok(output.includes("error stage: input"));
    assert.ok(output.includes("database write performed: false"));
  }
  const output: string[] = [];
  const code = await cli.run(["--file", "fixture.json", "--apply", "--env-file", ""], {
    fs: { statSync: () => ({ isFile: () => true, size: 100 }), readFileSync: () => Buffer.from(JSON.stringify(polygon)) },
    validatePolygon,
    loadEnvFile: () => { throw new Error("must not load unsafe"); },
    output: (line: string) => output.push(line),
  });
  assert.equal(code, 1);
  assert.ok(output.includes("error stage: input"));
  assert.equal(output.join(" ").includes("outside"), false);
});

test("unsafe env file paths fail at environment stage without leaking", async () => {
  for (const envFile of ["../../outside.env", "/tmp/outside.env"]) {
    const output: string[] = [];
    const code = await cli.run(["--file", "fixture.json", "--apply", "--env-file", envFile], {
      fs: { statSync: () => ({ isFile: () => true, size: 100 }), readFileSync: () => Buffer.from(JSON.stringify(polygon)) },
      validatePolygon,
      loadEnvFile: () => { throw new Error("must not load unsafe"); },
      output: (line: string) => output.push(line),
    });
    assert.equal(code, 1);
    assert.ok(output.includes("error stage: environment"));
    assert.ok(output.includes("database write performed: false"));
    assert.equal(output.join(" ").includes("outside"), false);
  }
  const oversized: string[] = [];
  const oversizedCode = await cli.run(["--file", "fixture.json", "--apply", "--env-file", ".env.production"], {
    fs: {
      statSync: (target: string) => {
        if (String(target).endsWith(".env.production")) return { isFile: () => true, size: 1024 * 1024 };
        return { isFile: () => true, size: 100 };
      },
      readFileSync: () => Buffer.from(JSON.stringify(polygon)),
    },
    validatePolygon,
    loadEnvFile: () => { throw new Error("must not load oversized"); },
    output: (line: string) => oversized.push(line),
  });
  assert.equal(oversizedCode, 1);
  assert.ok(oversized.includes("error stage: environment"));
});

test("environment failure reports safe stage without secrets", async () => {
  const output: string[] = [];
  const code = await cli.run(["--file", "fixture.json", "--apply", "--env-file", ".env.production"], {
    fs: {
      statSync: (target: string) => {
        if (String(target).endsWith(".env.production")) throw new Error("postgres://user:secret@host/db");
        return { isFile: () => true, size: 100 };
      },
      readFileSync: () => Buffer.from(JSON.stringify(polygon)),
    },
    validatePolygon,
    loadEnvFile: () => { throw new Error("must not reach loader"); },
    output: (line: string) => output.push(line),
  });
  assert.equal(code, 1);
  assert.ok(output.includes("error stage: environment"));
  assert.ok(output.includes("error type: configuration"));
  assert.ok(output.includes("database write performed: false"));
  const joined = output.join(" ");
  assert.equal(joined.includes("postgres"), false);
  assert.equal(joined.includes("secret"), false);
  assert.equal(joined.includes(".env.production"), false);
});

test("application failure reports safe application stage", async () => {
  const output: string[] = [];
  class CityGeofenceModule {}
  class ManagementService {}
  const configError = new Error("postgres://user:secret@host/db");
  configError.name = "ApiConfigurationError";
  const code = await cli.run(["--file", "fixture.json", "--apply"], {
    fs: { statSync: () => ({ isFile: () => true, size: 100 }), readFileSync: () => Buffer.from(JSON.stringify(polygon)) },
    validatePolygon,
    loadRootEnv: () => undefined,
    createApplicationContext: async () => { throw configError; },
    CityGeofenceModule,
    ManagementService,
    output: (line: string) => output.push(line),
  });
  assert.equal(code, 1);
  assert.ok(output.includes("error stage: application"));
  assert.ok(output.includes("error type: ApiConfigurationError"));
  assert.ok(output.includes("database write performed: false"));
  const joined = output.join(" ");
  assert.equal(joined.includes("postgres"), false);
  assert.equal(joined.includes("secret"), false);
});

test("write failure reports safe write stage without secrets", async () => {
  const output: string[] = [];
  let closed = 0;
  class CityGeofenceModule {}
  class ManagementService {}
  const writeError = new Error("secret marker for write stage");
  writeError.name = "AlertSettingsStateError";
  const app = { get: () => ({ replaceCityGeofence: async () => { throw writeError; } }), close: async () => { closed += 1; } };
  const code = await cli.run(["--file", "private-path.json", "--apply"], {
    fs: { statSync: () => ({ isFile: () => true, size: 100 }), readFileSync: () => Buffer.from(JSON.stringify(polygon)) },
    validatePolygon,
    loadRootEnv: () => undefined,
    createApplicationContext: async () => app,
    CityGeofenceModule,
    ManagementService,
    output: (line: string) => output.push(line),
  });
  assert.equal(code, 1);
  assert.equal(closed, 1);
  assert.ok(output.includes("error stage: write"));
  assert.ok(output.includes("error type: AlertSettingsStateError"));
  assert.ok(output.includes("database write performed: false"));
  const joined = output.join(" ");
  assert.equal(joined.includes("secret marker"), false);
  assert.equal(joined.includes("private-path"), false);
});

test("explicit env file success reports full success state", async () => {
  const output: string[] = [];
  const app = { get: () => ({ replaceCityGeofence: async () => undefined }), close: async () => undefined };
  class CityGeofenceModule {}
  class ManagementService {}
  const code = await cli.run(["--file", "fixture.json", "--apply", "--env-file", ".env.production"], {
    fs: { statSync: () => ({ isFile: () => true, size: 100 }), readFileSync: () => Buffer.from(JSON.stringify(polygon)) },
    validatePolygon,
    loadEnvFile: () => undefined,
    createApplicationContext: async () => app,
    CityGeofenceModule,
    ManagementService,
    output: (line: string) => output.push(line),
  });
  assert.equal(code, 0);
  assert.ok(output.includes("database write performed: true"));
  assert.ok(output.includes("geofence configured after operation: true"));
  assert.ok(output.includes("operation result: succeeded"));
  assert.ok(output.includes("application closed: true"));
  assert.ok(output.includes("error stage: none"));
  assert.ok(output.includes("error type: none"));
});

test("shutdown failure reports safe shutdown stage", async () => {
  const output: string[] = [];
  class CityGeofenceModule {}
  class ManagementService {}
  const closeError = new Error("close marker with secret");
  closeError.name = "CloseError";
  const app = { get: () => ({ replaceCityGeofence: async () => undefined }), close: async () => { throw closeError; } };
  const code = await cli.run(["--file", "fixture.json", "--apply"], {
    fs: { statSync: () => ({ isFile: () => true, size: 100 }), readFileSync: () => Buffer.from(JSON.stringify(polygon)) },
    validatePolygon,
    loadRootEnv: () => undefined,
    createApplicationContext: async () => app,
    CityGeofenceModule,
    ManagementService,
    output: (line: string) => output.push(line),
  });
  assert.equal(code, 1);
  assert.ok(output.includes("application closed: false"));
  assert.ok(output.includes("error stage: shutdown"));
  const joined = output.join(" ");
  assert.equal(joined.includes("close marker"), false);
  assert.equal(joined.includes("secret"), false);
});
