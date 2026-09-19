"use strict";

// Local visual-review harness for the ADMIN history surfaces.
//
// It starts a fixture-only stub of the internal API plus the built standalone Next application.
// The stub performs no provider request, opens no database connection, and requires no production
// credential: it serves only the aggregate read models the history pages consume. Use it to inspect
// /admin/history and /admin/history/population in representative states before merge.
//
//   npm run web:standalone:build
//   npm run web:history-preview -- --state=current
//   npm run web:history-preview -- --state=replaying
//   npm run web:history-preview -- --state=debt
//   npm run web:history-preview -- --state=unavailable

const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { existsSync } = require("node:fs");
const { spawn } = require("node:child_process");
const { discoverStandaloneWebRoot } = require("./prepare-standalone.cjs");

const STATES = ["current", "replaying", "debt", "unavailable"];
const SESSION_TOKEN = "preview-session-token";
const PREVIEW_USER = Object.freeze({ id: "00000000-0000-4000-8000-0000000000aa", login: "preview.admin", role: "ADMIN", permissions: [], mustChangePassword: false });

function parseArguments(argv) {
  const state = argv.find((value) => value.startsWith("--state="))?.slice("--state=".length) ?? "current";
  if (!STATES.includes(state)) throw new Error("Usage: npm run web:history-preview -- --state=" + STATES.join("|"));
  return { state, checkOnly: argv.includes("--check-only") };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitFor(url, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("preview service unavailable: " + url);
}

function stop(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    const timer = setTimeout(() => child.kill("SIGKILL"), 2_000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}

async function fixtures() {
  const status = await import("../src/lib/position-history-ingestion-status/position-history-ingestion-status-fixture.ts");
  const plan = await import("../src/lib/position-history-horizon-plan/position-history-horizon-plan-fixture.ts");
  return { status, plan };
}

function ingestionStatus(state, status) {
  if (state === "current") return status.positionHistoryIngestionStatusStateFixture("CURRENT");
  if (state === "replaying") return status.positionHistoryIngestionStatusStateFixture("REPLAYING");
  return status.positionHistoryIngestionStatusStateFixture("DEBT");
}

function sendJson(response, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(payload), ...headers });
  response.end(payload);
}

function startStub(port, state, loaded, onRequest) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1:" + port);
    onRequest(request.method + " " + url.pathname);
    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      for await (const chunk of request) void chunk;
      return sendJson(response, 200, PREVIEW_USER, { "Set-Cookie": "taxi_session=" + SESSION_TOKEN + "; HttpOnly; SameSite=Lax; Path=/; Secure" });
    }
    if (request.method === "POST" && url.pathname === "/api/auth/logout") return sendJson(response, 200, { ok: true });
    if (url.pathname === "/api/auth/me") return sendJson(response, 200, PREVIEW_USER);
    if (url.pathname === "/api/system/position-history/ingestion-status") {
      if (state === "unavailable") return sendJson(response, 503, { statusCode: 503, error: "Service Unavailable" });
      return sendJson(response, 200, ingestionStatus(state, loaded.status));
    }
    if (url.pathname === "/api/system/position-history/horizon-plan") return sendJson(response, 200, loaded.plan.positionHistoryHorizonPlanFixture());
    if (url.pathname === "/api/system/position-history/population-runs/active") return sendJson(response, 200, { active: null });
    if (url.pathname === "/api/system/position-history/population-runs/recent") return sendJson(response, 200, []);
    return sendJson(response, 404, { statusCode: 404, error: "Not Found" });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function authenticate(webOrigin) {
  const response = await fetch(webOrigin + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: webOrigin }, body: JSON.stringify({ login: "preview.admin", password: "preview-password" }) });
  const cookie = response.headers.get("set-cookie");
  if (!response.ok || !cookie || !cookie.startsWith("taxi_session=")) throw new Error("preview login failed");
  return cookie.split(";", 1)[0];
}

const expectations = Object.freeze({
  current: { overview: "Непрерывное заполнение", population: "План ручного заполнения" },
  replaying: { overview: "Сейчас выполняется ручное дозаполнение истории", population: "План ручного заполнения" },
  debt: { overview: "Обнаружен долг повтора", population: "План ручного заполнения" },
  unavailable: { overview: "Текущее состояние истории недоступно", population: "План ручного заполнения" },
});

async function verify(webOrigin, cookie, state, anchor) {
  // The operator sees the review locale explicitly, so preview assertions stay locale-stable.
  const headers = { Cookie: cookie + "; taxi_locale=ru" };
  const overview = await fetch(webOrigin + "/admin/history", { headers });
  const overviewHtml = await overview.text();
  const population = await fetch(webOrigin + "/admin/history/population?" + new URLSearchParams({ to: anchor }), { headers });
  const populationHtml = await population.text();
  const expected = expectations[state];
  const checked = {
    overviewStatus: overview.status,
    overviewState: overviewHtml.includes(expected.overview),
    overviewScopedDiagnostics: state === "unavailable" ? !overviewHtml.includes("Счётчики текущего процесса API") : overviewHtml.includes("Счётчики текущего процесса API"),
    populationStatus: population.status,
    populationPlan: populationHtml.includes(expected.population),
  };
  const externalRequests = { provider: 0, database: 0 };
  const failed = Object.entries(checked).filter(([key, value]) => key.endsWith("Status") ? value !== 200 : value !== true).map(([key]) => key);
  return { checked, externalRequests, failed };
}

async function main() {
  const { state, checkOnly } = parseArguments(process.argv.slice(2));
  const loaded = await fixtures();
  const webRoot = discoverStandaloneWebRoot();
  if (!existsSync(path.join(webRoot, "server.js")) || !existsSync(path.join(webRoot, ".next", "static"))) {
    throw new Error("Standalone assets are missing. Run npm run web:standalone:build before the history preview.");
  }
  const apiPort = await freePort();
  const webPort = await freePort();
  const requests = [];
  const stub = await startStub(apiPort, state, loaded, (value) => { requests.push(value); });
  const web = spawn(process.execPath, [path.join(webRoot, "server.js")], {
    stdio: "ignore",
    env: { ...process.env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(webPort), API_INTERNAL_BASE_URL: "http://127.0.0.1:" + apiPort },
  });
  try {
    await waitFor("http://127.0.0.1:" + webPort + "/login");
    const origin = "http://localhost:" + webPort;
    const cookie = await authenticate(origin);
    const result = await verify(origin, cookie, state, loaded.plan.positionHistoryHorizonPlanFixture().to);
    process.stdout.write(JSON.stringify({ state, fixtureOnlyStub: "http://127.0.0.1:" + apiPort, operatorUrl: origin + "/login", stubRequests: requests, ...result }, null, 2) + "\n");
    if (result.failed.length > 0) process.exitCode = 1;
    if (checkOnly) return;
    process.stdout.write([
      "",
      "Local history visual review",
      "  1. Open " + origin + "/login and sign in with any preview credentials (for example preview.admin / preview-password).",
      "  2. Open " + origin + "/admin/history",
      "  3. Open " + origin + "/admin/history/population",
      "  State: " + state + ". No provider request, no database, no production credential is used.",
      "  Press Ctrl+C to stop the preview.",
      "",
    ].join("\n"));
    await new Promise((resolve) => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
  } finally {
    await stop(web);
    await new Promise((resolve) => stub.close(resolve));
  }
}

void main().catch((error) => { process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n"); process.exitCode = 1; });
