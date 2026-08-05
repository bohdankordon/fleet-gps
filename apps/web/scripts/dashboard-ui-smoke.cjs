const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { config } = require("dotenv");

function safeErrorType(error) { if (error && error.name === "WebConfigurationError") return "configuration"; if (error && error.name === "ApiConfigurationError") return "api"; if (error && typeof error.name === "string" && error.name.startsWith("Prisma")) return "database"; return "unknown"; }
function freePort() { return new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); const port = typeof address === "object" && address ? address.port : 0; server.close((error) => error ? reject(error) : resolve(port)); }); }); }
async function waitFor(url) { for (let attempt = 0; attempt < 40; attempt += 1) { try { const response = await fetch(url); if (response.ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error("service unavailable"); }
function stop(child) { return new Promise((resolve) => { if (!child || child.exitCode !== null) return resolve(); const timer = setTimeout(() => { child.kill("SIGKILL"); }, 2_000); child.once("exit", () => { clearTimeout(timer); resolve(); }); child.kill("SIGTERM"); }); }

async function main() {
  let api; let web; let apiClosed = false; let webClosed = false; let pageStatus = 0; let filteredPageStatus = 0; let title = false; let routeStatus = 0; let total = 0; let filtered = 0; let safeContract = false;
  config({ path: path.resolve(__dirname, "../../..", ".env"), quiet: true, override: false });
  try {
    if (!process.env.DATABASE_URL) { const error = new Error(); error.name = "WebConfigurationError"; throw error; }
    const apiPort = await freePort(); const webPort = await freePort();
    const apiEnv = { ...process.env, HOST: "127.0.0.1", PORT: String(apiPort), EQUGPS_BASE_URL: "https://trace.invalid", EQUGPS_WEB_BASE_URL: "https://web.invalid", EQUGPS_EMAIL: "smoke@example.test", EQUGPS_PASSWORD: "smoke-password", EQUGPS_REQUEST_TIMEOUT_MS: "15000", EQUGPS_RUNS_TIMEOUT_MS: "45000" };
    api = spawn(process.execPath, [path.resolve(__dirname, "../../api/dist/main.js")], { env: apiEnv, stdio: "ignore" });
    await waitFor(`http://127.0.0.1:${apiPort}/api/health`);
    web = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(webPort), "-H", "127.0.0.1"], { cwd: path.resolve(__dirname, ".."), env: { ...process.env, API_INTERNAL_BASE_URL: `http://127.0.0.1:${apiPort}` }, stdio: "ignore" });
    await waitFor(`http://127.0.0.1:${webPort}/`);
    const page = await fetch(`http://127.0.0.1:${webPort}/`); pageStatus = page.status; title = (await page.text()).includes("Автопарк");
    const route = await fetch(`http://127.0.0.1:${webPort}/api/dashboard/vehicles`); routeStatus = route.status; const body = await route.json();
    const filteredResponse = await fetch(`http://127.0.0.1:${webPort}/api/dashboard/vehicles?status=online`); const filteredBody = await filteredResponse.json();
    total = Number(body?.summary?.total ?? 0); filtered = Number(filteredBody?.summary?.total ?? 0);
    const filteredPage = await fetch(`http://127.0.0.1:${webPort}/?status=online`); const filteredHtml = await filteredPage.text(); filteredPageStatus = filteredPage.status;
    safeContract = Array.isArray(body?.vehicles) && body.vehicles.every((vehicle) => !Object.prototype.hasOwnProperty.call(vehicle, "externalDeviceId") && !Object.prototype.hasOwnProperty.call(vehicle, "latitude") && !Object.prototype.hasOwnProperty.call(vehicle, "longitude"));
    if (pageStatus !== 200 || filteredPageStatus !== 200 || !title || !filteredHtml.includes("Автопарк") || !filteredHtml.includes(String(filtered)) || routeStatus !== 200 || total !== 58 || filtered > 58 || !safeContract) throw new Error("smoke assertion");
  } catch (error) { console.log(`errorType: ${safeErrorType(error)}`); process.exitCode = 1; }
  finally { await stop(web); webClosed = true; await stop(api); apiClosed = true; console.log(`page status: ${pageStatus}`); console.log(`dashboard title present: ${title}`); console.log(`API route status: ${routeStatus}`); console.log(`total vehicles: ${total}`); console.log(`filtered vehicles: ${filtered}`); console.log(`safe vehicle contract: ${safeContract}`); console.log(`API closed: ${apiClosed}`); console.log(`web closed: ${webClosed}`); }
}
void main().catch(() => { console.log("errorType: unknown"); process.exitCode = 1; });
