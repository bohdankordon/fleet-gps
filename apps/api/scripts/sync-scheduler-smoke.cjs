const assert = require("node:assert/strict");
const { NestFactory } = require("@nestjs/core");
const { loadRootEnv } = require("./load-root-env.cjs");

async function run() {
  let app;
  let closed = false;
  let externalRequests = 0;
  const nativeFetch = globalThis.fetch;
  try {
    loadRootEnv();
    process.env.SYNC_SCHEDULER_ENABLED = "false";
    process.env.EQUGPS_BASE_URL = "https://official.example.invalid/api";
    process.env.EQUGPS_WEB_BASE_URL = "https://web.example.invalid";
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.startsWith("http://127.0.0.1:")) externalRequests += 1;
      return nativeFetch(input, init);
    };
    const { AppModule } = require("../dist/app.module");
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const port = app.getHttpServer().address().port;
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    const statusResponse = await fetch(`http://127.0.0.1:${port}/api/system/sync-status`);
    const status = await statusResponse.json();
    assert.equal(health.status, 200);
    assert.equal(statusResponse.status, 200);
    assert.equal(status.enabled, false);
    assert.equal(status.startedAt, null);
    assert.equal(status.fleet.running, false);
    assert.equal(status.runs.running, false);
    for (const job of [status.fleet, status.runs]) {
      assert.equal(job.consecutiveFailures, 0);
      assert.equal(job.successfulRuns, 0);
      assert.equal(job.failedRuns, 0);
      assert.equal(job.skippedOverlaps, 0);
    }
    assert.equal(Number.isNaN(Date.parse(status.generatedAt)), false);
    assert.equal(externalRequests, 0);
    console.log(`health status: ${health.status}`);
    console.log(`scheduler status: ${statusResponse.status}`);
    console.log(`scheduler enabled: ${status.enabled}`);
    console.log(`scheduler started: ${status.startedAt !== null}`);
    console.log(`fleet running: ${status.fleet.running}`);
    console.log(`runs running: ${status.runs.running}`);
    console.log(`fleet successful runs: ${status.fleet.successfulRuns}`);
    console.log(`fleet failed runs: ${status.fleet.failedRuns}`);
    console.log(`fleet skipped overlaps: ${status.fleet.skippedOverlaps}`);
    console.log(`runs successful runs: ${status.runs.successfulRuns}`);
    console.log(`runs failed runs: ${status.runs.failedRuns}`);
    console.log(`runs skipped overlaps: ${status.runs.skippedOverlaps}`);
    console.log(`external requests: ${externalRequests}`);
  } catch {
    console.log("errorType: unknown");
    process.exitCode = 1;
  } finally {
    if (app !== undefined) {
      try { await app.close(); closed = true; }
      catch { process.exitCode = 1; }
    }
    globalThis.fetch = nativeFetch;
    console.log(`application closed: ${closed}`);
  }
}

void run();
