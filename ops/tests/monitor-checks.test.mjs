import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECK_IDS,
  SEVERITY,
  diskFreePercentFromStatfs,
  diskSeverityForFreePercent,
} from "../lib/monitor-config.mjs";
import {
  backupTimestampMs,
  decideIntegrityVerification,
  evaluateContainerService,
  overallSeverity,
  parseComposePsLines,
  runAllChecks,
  selectLatestDailyBackup,
} from "../lib/monitor-checks.mjs";

const config = Object.freeze({ siteHostname: "taxi.example.test", backupDir: "/backups", appImageTag: "v1.0.0", alertsEnabled: false, botToken: null, chatId: null });
const NOW = Date.UTC(2026, 7, 14, 12, 0, 0);

function fakeRuntime(overrides = {}) {
  return {
    dockerEngineOk: async () => true,
    composeServiceStates: async () =>
      new Map([
        ["caddy", { state: "running", health: "healthy" }],
        ["web", { state: "running", health: "healthy" }],
        ["api", { state: "running", health: "healthy" }],
        ["postgres", { state: "running", health: "healthy" }],
      ]),
    requestLocalHttps: async () => ({ ok: true, status: 200 }),
    execApiReadiness: async () => true,
    execPostgresReadiness: async () => true,
    discoverPostgresDataDir: async () => "/var/lib/docker/volumes/postgres/_data",
    statfs: async () => ({ blocks: 1000, bavail: 500 }),
    listDirectory: async () => [],
    statFile: async () => ({ size: 100, mtimeMs: NOW - 60_000 }),
    verifyBackup: async () => true,
    ...overrides,
  };
}

function statusFor(results, checkId) {
  const found = results.find((result) => result.checkId === checkId);
  return found ? found.status : undefined;
}

function entry(name, isFile = true, isSymlink = false) {
  return { name, isFile, isSymlink };
}

test("container evaluation detects unhealthy, exited, and restarting states", () => {
  assert.equal(evaluateContainerService({ state: "running", health: "healthy" }), SEVERITY.HEALTHY);
  assert.equal(evaluateContainerService({ state: "running", health: "unhealthy" }), SEVERITY.CRITICAL);
  assert.equal(evaluateContainerService({ state: "exited", health: "" }), SEVERITY.CRITICAL);
  assert.equal(evaluateContainerService({ state: "restarting", health: "" }), SEVERITY.CRITICAL);
  assert.equal(evaluateContainerService(null), SEVERITY.CRITICAL);
});

test("compose ps JSON parses service state and health", () => {
  const lines = [
    JSON.stringify({ Service: "web", State: "running", Health: "healthy" }),
    JSON.stringify({ Service: "api", State: "exited", Health: "" }),
    "not-json",
  ].join("\n");
  const states = parseComposePsLines(lines);
  assert.deepEqual(states.get("web"), { state: "running", health: "healthy" });
  assert.deepEqual(states.get("api"), { state: "exited", health: "" });
});

test("disk free percentage boundaries are exact at 15% and 5%", () => {
  assert.equal(diskFreePercentFromStatfs({ blocks: 1000, bavail: 150 }), 15);
  assert.equal(diskSeverityForFreePercent(15), SEVERITY.HEALTHY);
  assert.equal(diskSeverityForFreePercent(14.999), SEVERITY.WARNING);
  assert.equal(diskSeverityForFreePercent(5), SEVERITY.WARNING);
  assert.equal(diskSeverityForFreePercent(4.999), SEVERITY.CRITICAL);
  assert.equal(diskSeverityForFreePercent(0), SEVERITY.CRITICAL);
  assert.equal(diskFreePercentFromStatfs(null), null);
  assert.equal(diskFreePercentFromStatfs({ blocks: 0, bavail: 0 }), null);
});

test("selectLatestDailyBackup accepts only exact managed non-symlink pairs", () => {
  const latest = "taxi-gps-2026-08-14T110000Z.dump";
  const entries = [
    entry(latest),
    entry(latest + ".sha256"),
    entry("taxi-gps-2026-08-13T110000Z.dump"),
    entry("taxi-gps-2026-08-13T110000Z.dump.sha256"),
    entry("unrelated.txt"),
    entry("taxi-gps-bad.dump"),
    entry("taxi-gps-2026-08-14T110000Z.dump.bak"),
  ];
  assert.deepEqual(selectLatestDailyBackup(entries), { dump: latest, sha: latest + ".sha256" });
});

test("selectLatestDailyBackup ignores lone, malformed, and symlink files", () => {
  const dump = "taxi-gps-2026-08-14T110000Z.dump";
  assert.equal(selectLatestDailyBackup([entry(dump)]), null);
  assert.equal(selectLatestDailyBackup([entry("other.dump"), entry("other.dump.sha256")]), null);
  assert.equal(selectLatestDailyBackup([entry(dump, true, true), entry(dump + ".sha256")]), null);
});

test("backup timestamp parsing is UTC and exact", () => {
  assert.equal(backupTimestampMs("taxi-gps-2026-08-14T110000Z.dump"), Date.UTC(2026, 7, 14, 11, 0, 0));
  assert.equal(backupTimestampMs("not-a-backup"), null);
});

test("integrity cache decision reverifies new, changed, and periodic identities", () => {
  const pair = { dump: { name: "a.dump", size: 10, mtimeMs: 1000 }, sha: { name: "a.dump.sha256", size: 20, mtimeMs: 1000 } };
  const cache = { version: 1, dump: { basename: "a.dump", size: 10, mtimeMs: 1000 }, sha: { basename: "a.dump.sha256", size: 20, mtimeMs: 1000 }, verifiedAt: 5000 };
  assert.equal(decideIntegrityVerification(pair, null, 5000).reason, "new");
  assert.equal(decideIntegrityVerification(pair, cache, 5000).reason, "unchanged");
  assert.equal(decideIntegrityVerification({ ...pair, dump: { ...pair.dump, size: 99 } }, cache, 5000).reason, "changed");
  assert.equal(decideIntegrityVerification(pair, cache, 5000 + 6 * 60 * 60 * 1000).reason, "periodic");
});

test("all healthy services produce a healthy evaluation", async () => {
  const backup = recentBackup();
  const runtime = fakeRuntime({
    listDirectory: async () => backup.entries,
    statFile: backup.statFile,
    verifyBackup: async () => true,
  });
  const { results, cache } = await runAllChecks({ runtime, config, now: NOW, integrityCache: null });
  assert.equal(overallSeverity(results), SEVERITY.HEALTHY);
  assert.equal(statusFor(results, CHECK_IDS.DOCKER_ENGINE), SEVERITY.HEALTHY);
  assert.equal(statusFor(results, CHECK_IDS.CONTAINER_WEB), SEVERITY.HEALTHY);
  assert.equal(statusFor(results, CHECK_IDS.EDGE_HTTPS), SEVERITY.HEALTHY);
  assert.equal(statusFor(results, CHECK_IDS.API_READINESS), SEVERITY.HEALTHY);
  assert.equal(statusFor(results, CHECK_IDS.POSTGRES_READINESS), SEVERITY.HEALTHY);
  assert.equal(statusFor(results, CHECK_IDS.BACKUP_MISSING), SEVERITY.HEALTHY);
  assert.notEqual(cache, null);
});

test("a stopped web container is detected and restored cleanly", async () => {
  const stopped = fakeRuntime({
    composeServiceStates: async () =>
      new Map([
        ["caddy", { state: "running", health: "healthy" }],
        ["web", { state: "exited", health: "" }],
        ["api", { state: "running", health: "healthy" }],
        ["postgres", { state: "running", health: "healthy" }],
      ]),
  });
  const incident = await runAllChecks({ runtime: stopped, config, now: NOW, integrityCache: null });
  assert.equal(statusFor(incident.results, CHECK_IDS.CONTAINER_WEB), SEVERITY.CRITICAL);

  const restored = await runAllChecks({ runtime: fakeRuntime(), config, now: NOW, integrityCache: null });
  assert.equal(statusFor(restored.results, CHECK_IDS.CONTAINER_WEB), SEVERITY.HEALTHY);
});

test("stopped API and Postgres are detected", async () => {
  const stoppedApi = fakeRuntime({
    composeServiceStates: async () =>
      new Map([
        ["caddy", { state: "running", health: "healthy" }],
        ["web", { state: "running", health: "healthy" }],
        ["api", { state: "exited", health: "" }],
        ["postgres", { state: "running", health: "healthy" }],
      ]),
    execApiReadiness: async () => false,
  });
  const apiIncident = await runAllChecks({ runtime: stoppedApi, config, now: NOW, integrityCache: null });
  assert.equal(statusFor(apiIncident.results, CHECK_IDS.CONTAINER_API), SEVERITY.CRITICAL);
  assert.equal(statusFor(apiIncident.results, CHECK_IDS.API_READINESS), SEVERITY.CRITICAL);

  const stoppedPostgres = fakeRuntime({
    composeServiceStates: async () =>
      new Map([
        ["caddy", { state: "running", health: "healthy" }],
        ["web", { state: "running", health: "healthy" }],
        ["api", { state: "running", health: "healthy" }],
        ["postgres", { state: "exited", health: "" }],
      ]),
    execPostgresReadiness: async () => false,
  });
  const postgresIncident = await runAllChecks({ runtime: stoppedPostgres, config, now: NOW, integrityCache: null });
  assert.equal(statusFor(postgresIncident.results, CHECK_IDS.CONTAINER_POSTGRES), SEVERITY.CRITICAL);
  assert.equal(statusFor(postgresIncident.results, CHECK_IDS.POSTGRES_READINESS), SEVERITY.CRITICAL);
});

test("Docker Engine unavailability yields one stable engine incident, not four container incidents", async () => {
  const down = fakeRuntime({ dockerEngineOk: async () => false });
  const { results } = await runAllChecks({ runtime: down, config, now: NOW, integrityCache: null });
  assert.equal(statusFor(results, CHECK_IDS.DOCKER_ENGINE), SEVERITY.CRITICAL);
  assert.equal(statusFor(results, CHECK_IDS.CONTAINER_CADDY), undefined);
  assert.equal(statusFor(results, CHECK_IDS.CONTAINER_WEB), undefined);
  assert.equal(statusFor(results, CHECK_IDS.CONTAINER_API), undefined);
  assert.equal(statusFor(results, CHECK_IDS.CONTAINER_POSTGRES), undefined);
  assert.equal(statusFor(results, CHECK_IDS.EDGE_HTTPS), undefined);
  assert.equal(statusFor(results, CHECK_IDS.API_READINESS), undefined);
  assert.equal(statusFor(results, CHECK_IDS.DB_DISK), undefined);
});

test("Docker Engine healthy plus missing PostgreSQL mount discovery emits DB_DISK critical", async () => {
  const runtime = fakeRuntime({ discoverPostgresDataDir: async () => null });
  const { results } = await runAllChecks({ runtime, config, now: NOW, integrityCache: null });
  const dbDisk = results.find((result) => result.checkId === CHECK_IDS.DB_DISK);
  assert.equal(dbDisk.status, SEVERITY.CRITICAL);
  assert.equal(dbDisk.detail, "PostgreSQL data filesystem unavailable");
});

test("Docker Engine healthy plus statfs failure emits DB_DISK critical", async () => {
  const runtime = fakeRuntime({
    statfs: async (target) => (target === "/var/lib/docker/volumes/postgres/_data" ? null : { blocks: 1000, bavail: 500 }),
  });
  const { results } = await runAllChecks({ runtime, config, now: NOW, integrityCache: null });
  assert.equal(statusFor(results, CHECK_IDS.DB_DISK), SEVERITY.CRITICAL);
});

test("DB_DISK integrated thresholds remain healthy at 15%, warning from 5% to below 15%, and critical below 5%", async () => {
  const fixtures = [
    { bavail: 150, expected: SEVERITY.HEALTHY },
    { bavail: 149, expected: SEVERITY.WARNING },
    { bavail: 50, expected: SEVERITY.WARNING },
    { bavail: 49, expected: SEVERITY.CRITICAL },
  ];
  for (const fixture of fixtures) {
    const runtime = fakeRuntime({
      statfs: async (target) =>
        target === "/var/lib/docker/volumes/postgres/_data" ? { blocks: 1000, bavail: fixture.bavail } : { blocks: 1000, bavail: 500 },
    });
    const { results } = await runAllChecks({ runtime, config, now: NOW, integrityCache: null });
    assert.equal(statusFor(results, CHECK_IDS.DB_DISK), fixture.expected);
  }
});

test("DB and backup disk checks map statfs free space to the correct severities", async () => {
  const runtime = fakeRuntime({
    statfs: async (target) => {
      if (target === "/var/lib/docker/volumes/postgres/_data") return { blocks: 1000, bavail: 149 };
      return { blocks: 1000, bavail: 49 };
    },
  });
  const { results } = await runAllChecks({ runtime, config, now: NOW, integrityCache: null });
  assert.equal(statusFor(results, CHECK_IDS.DB_DISK), SEVERITY.WARNING);
  assert.equal(statusFor(results, CHECK_IDS.BACKUP_DISK), SEVERITY.CRITICAL);
});

test("no finalized daily backup is reported as BACKUP_MISSING", async () => {
  const runtime = fakeRuntime({ listDirectory: async () => [] });
  const { results } = await runAllChecks({ runtime, config, now: NOW, integrityCache: null });
  assert.equal(statusFor(results, CHECK_IDS.BACKUP_MISSING), SEVERITY.CRITICAL);
  assert.equal(statusFor(results, CHECK_IDS.BACKUP_STALE), SEVERITY.HEALTHY);
  assert.equal(statusFor(results, CHECK_IDS.BACKUP_INVALID), SEVERITY.HEALTHY);
});

function recentBackup() {
  const dump = "taxi-gps-2026-08-14T110000Z.dump";
  const sha = dump + ".sha256";
  return {
    entries: [entry(dump), entry(sha)],
    statFile: async (file) => ({ size: file.endsWith(".sha256") ? 80 : 1_000_000, mtimeMs: NOW - 60_000 }),
    dump,
  };
}

test("a valid recent backup is healthy and verified", async () => {
  const backup = recentBackup();
  let verifyCalls = 0;
  const runtime = fakeRuntime({
    listDirectory: async () => backup.entries,
    statFile: backup.statFile,
    verifyBackup: async () => {
      verifyCalls += 1;
      return true;
    },
  });
  const { results, cache } = await runAllChecks({ runtime, config, now: NOW, integrityCache: null });
  assert.equal(statusFor(results, CHECK_IDS.BACKUP_MISSING), SEVERITY.HEALTHY);
  assert.equal(statusFor(results, CHECK_IDS.BACKUP_STALE), SEVERITY.HEALTHY);
  assert.equal(statusFor(results, CHECK_IDS.BACKUP_INVALID), SEVERITY.HEALTHY);
  assert.equal(verifyCalls, 1);
  assert.equal(cache.dump.basename, backup.dump);
});

test("a valid but >30h backup is reported as BACKUP_STALE without rehashing", async () => {
  const dump = "taxi-gps-2026-08-12T100000Z.dump";
  let verifyCalls = 0;
  const runtime = fakeRuntime({
    listDirectory: async () => [entry(dump), entry(dump + ".sha256")],
    statFile: async (file) => ({ size: 100, mtimeMs: NOW - 40 * 60 * 60 * 1000 }),
    verifyBackup: async () => {
      verifyCalls += 1;
      return true;
    },
  });
  const { results } = await runAllChecks({ runtime, config, now: NOW, integrityCache: null });
  assert.equal(statusFor(results, CHECK_IDS.BACKUP_STALE), SEVERITY.CRITICAL);
  assert.equal(verifyCalls, 0);
});

test("a corrupt latest backup is reported as BACKUP_INVALID and invalidates the cache", async () => {
  const backup = recentBackup();
  const runtime = fakeRuntime({
    listDirectory: async () => backup.entries,
    statFile: backup.statFile,
    verifyBackup: async () => false,
  });
  const { results, cache } = await runAllChecks({ runtime, config, now: NOW, integrityCache: null });
  assert.equal(statusFor(results, CHECK_IDS.BACKUP_INVALID), SEVERITY.CRITICAL);
  assert.equal(cache, null);
});

test("the integrity cache avoids rehashing an unchanged backup every minute", async () => {
  const backup = recentBackup();
  let verifyCalls = 0;
  const runtime = fakeRuntime({
    listDirectory: async () => backup.entries,
    statFile: backup.statFile,
    verifyBackup: async () => {
      verifyCalls += 1;
      return true;
    },
  });
  const first = await runAllChecks({ runtime, config, now: NOW, integrityCache: null });
  assert.equal(verifyCalls, 1);
  const second = await runAllChecks({ runtime, config, now: NOW + 60_000, integrityCache: first.cache });
  assert.equal(verifyCalls, 1);
  assert.equal(statusFor(second.results, CHECK_IDS.BACKUP_INVALID), SEVERITY.HEALTHY);
});

test("a newly observed or replaced backup is always verified", async () => {
  const backupA = recentBackup();
  let verifyCalls = 0;
  const runtimeA = fakeRuntime({
    listDirectory: async () => backupA.entries,
    statFile: backupA.statFile,
    verifyBackup: async () => {
      verifyCalls += 1;
      return true;
    },
  });
  const first = await runAllChecks({ runtime: runtimeA, config, now: NOW, integrityCache: null });
  assert.equal(verifyCalls, 1);

  const dumpB = "taxi-gps-2026-08-14T113000Z.dump";
  const runtimeB = fakeRuntime({
    listDirectory: async () => [entry(dumpB), entry(dumpB + ".sha256")],
    statFile: async (file) => ({ size: 200, mtimeMs: NOW - 30 * 60_000 }),
    verifyBackup: async () => {
      verifyCalls += 1;
      return true;
    },
  });
  const second = await runAllChecks({ runtime: runtimeB, config, now: NOW, integrityCache: first.cache });
  assert.equal(verifyCalls, 2);
  assert.equal(second.cache.dump.basename, dumpB);
});
