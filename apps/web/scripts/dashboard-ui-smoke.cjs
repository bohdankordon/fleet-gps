const net = require("node:net");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { config } = require("dotenv");

function freePort() { return new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); const port = typeof address === "object" && address ? address.port : 0; server.close((error) => error ? reject(error) : resolve(port)); }); }); }
function startTrap(onRequest) { return new Promise((resolve, reject) => { const server = http.createServer((_, response) => { onRequest(); response.statusCode = 503; response.end(); }); server.on("clientError", () => { onRequest(); }); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); resolve({ server, port: typeof address === "object" && address ? address.port : 0 }); }); }); }
function close(server) { return new Promise((resolve) => { if (!server || !server.listening) return resolve(); server.close(() => resolve()); }); }
async function waitFor(url) { for (let attempt = 0; attempt < 40; attempt += 1) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error("service unavailable"); }
function stop(child) { return new Promise((resolve) => { if (!child || child.exitCode !== null) return resolve(); const timer = setTimeout(() => child.kill("SIGKILL"), 2_000); child.once("exit", () => { clearTimeout(timer); resolve(); }); child.kill("SIGTERM"); }); }

async function main() {
  let api; let web; let trap; let apiClosed = false; let webClosed = false; let pageStatus = 0; let title = false; let schedulerSection = false; let dashboardStatus = 0; let schedulerStatus = 0; let schedulerEnabled = false; let schedulerStarted = false; let fleetSuccessfulRuns = 0; let fleetFailedRuns = 0; let runsSuccessfulRuns = 0; let runsFailedRuns = 0; let total = 0; let externalRequests = 0;
  config({ path: path.resolve(__dirname, "../../..", ".env"), quiet: true, override: false });
  try {
    if (!process.env.DATABASE_URL) throw new Error("configuration");
    const apiPort = await freePort(); const webPort = await freePort(); trap = await startTrap(() => { externalRequests += 1; });
    const apiEnv = { ...process.env, HOST: "127.0.0.1", PORT: String(apiPort), SYNC_SCHEDULER_ENABLED: "false", EQUGPS_BASE_URL: `https://127.0.0.1:${trap.port}/api`, EQUGPS_WEB_BASE_URL: `https://127.0.0.1:${trap.port}`, EQUGPS_EMAIL: "smoke@example.test", EQUGPS_PASSWORD: "smoke-password", EQUGPS_REQUEST_TIMEOUT_MS: "15000", EQUGPS_RUNS_TIMEOUT_MS: "45000" };
    api = spawn(process.execPath, [path.resolve(__dirname, "../../api/dist/main.js")], { env: apiEnv, stdio: "ignore" });
    await waitFor(`http://127.0.0.1:${apiPort}/api/health`);
    web = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(webPort), "-H", "127.0.0.1"], { cwd: path.resolve(__dirname, ".."), env: { ...process.env, API_INTERNAL_BASE_URL: `http://127.0.0.1:${apiPort}` }, stdio: "ignore" });
    await waitFor(`http://127.0.0.1:${webPort}/`);
    const page = await fetch(`http://127.0.0.1:${webPort}/`); pageStatus = page.status; const pageHtml = await page.text(); title = pageHtml.includes("Автопарк"); schedulerSection = pageHtml.includes("Автоматическое обновление");
    const dashboard = await fetch(`http://127.0.0.1:${webPort}/api/dashboard/vehicles`); dashboardStatus = dashboard.status; const dashboardBody = await dashboard.json(); total = Number(dashboardBody?.summary?.total ?? 0);
    const scheduler = await fetch(`http://127.0.0.1:${webPort}/api/system/sync-status`); schedulerStatus = scheduler.status; const schedulerBody = await scheduler.json(); schedulerEnabled = schedulerBody?.enabled === true; schedulerStarted = schedulerBody?.startedAt !== null; fleetSuccessfulRuns = Number(schedulerBody?.fleet?.successfulRuns ?? 0); fleetFailedRuns = Number(schedulerBody?.fleet?.failedRuns ?? 0); runsSuccessfulRuns = Number(schedulerBody?.runs?.successfulRuns ?? 0); runsFailedRuns = Number(schedulerBody?.runs?.failedRuns ?? 0);
    const validGeneratedAt = typeof schedulerBody?.generatedAt === "string" && !Number.isNaN(Date.parse(schedulerBody.generatedAt)) && /Z$/.test(schedulerBody.generatedAt);
    const fleetCountersZero = schedulerBody?.fleet?.consecutiveFailures === 0 && schedulerBody?.fleet?.successfulRuns === 0 && schedulerBody?.fleet?.failedRuns === 0 && schedulerBody?.fleet?.skippedOverlaps === 0;
    const runsCountersZero = schedulerBody?.runs?.consecutiveFailures === 0 && schedulerBody?.runs?.successfulRuns === 0 && schedulerBody?.runs?.failedRuns === 0 && schedulerBody?.runs?.skippedOverlaps === 0;
    if (pageStatus !== 200 || !title || !schedulerSection || dashboardStatus !== 200 || schedulerStatus !== 200 || schedulerEnabled || schedulerStarted || schedulerBody?.fleet?.running !== false || schedulerBody?.runs?.running !== false || !validGeneratedAt || !fleetCountersZero || !runsCountersZero || total !== 58 || externalRequests !== 0) throw new Error("smoke assertion");
  } catch { process.exitCode = 1; }
  finally { await stop(web); webClosed = true; await stop(api); apiClosed = true; await close(trap?.server); console.log(`page status: ${pageStatus}`); console.log(`dashboard title present: ${title}`); console.log(`scheduler section present: ${schedulerSection}`); console.log(`dashboard API status: ${dashboardStatus}`); console.log(`scheduler API status: ${schedulerStatus}`); console.log(`scheduler enabled: ${schedulerEnabled}`); console.log(`scheduler started: ${schedulerStarted}`); console.log(`fleet successful runs: ${fleetSuccessfulRuns}`); console.log(`fleet failed runs: ${fleetFailedRuns}`); console.log(`runs successful runs: ${runsSuccessfulRuns}`); console.log(`runs failed runs: ${runsFailedRuns}`); console.log(`total vehicles: ${total}`); console.log(`external requests: ${externalRequests}`); console.log(`API closed: ${apiClosed}`); console.log(`web closed: ${webClosed}`); }
}
void main().catch(() => { process.exitCode = 1; });
