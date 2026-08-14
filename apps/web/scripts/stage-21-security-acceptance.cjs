const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { discoverStandaloneWebRoot } = require("./prepare-standalone.cjs");

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function collectOutput(child) {
  let output = "";
  const append = (chunk) => {
    output = `${output}${chunk}`.slice(-8_192);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  return () => output;
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function waitForResponse(url, child, output) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Standalone server exited early.\n${output()}`);
    try {
      return await fetch(url, { redirect: "follow" });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Standalone server did not become ready.\n${output()}`);
}

function assertSecurityHeaders(response) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("permissions-policy") ?? "", /geolocation=\(\)/);
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /connect-src 'self' https:\/\/tiles\.openfreemap\.org/);
  assert.doesNotMatch(csp, /'unsafe-eval'|\*/);
}

function findFilesWithSuffix(root, suffix) {
  if (!fs.existsSync(root)) return [];
  const matches = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) matches.push(...findFilesWithSuffix(entryPath, suffix));
    else if (entry.isFile() && entry.name.endsWith(suffix)) matches.push(entryPath);
  }
  return matches;
}

async function verifyHardenedRuntime(startPath, webRoot, standaloneRoot) {
  const port = await availablePort();
  const child = spawn(process.execPath, [startPath], {
    cwd: webRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      API_INTERNAL_BASE_URL: "http://127.0.0.1:9",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = collectOutput(child);
  try {
    const login = await waitForResponse(`http://127.0.0.1:${port}/login`, child, output);
    assert.equal(login.status, 200);
    assertSecurityHeaders(login);

    const admin = await fetch(`http://127.0.0.1:${port}/admin/audit`, { redirect: "follow" });
    assert.equal(admin.status, 200);
    assertSecurityHeaders(admin);

    const oversized = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: `http://127.0.0.1:${port}`, "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ login: "operator", password: "x".repeat(70_000) }),
    });
    assert.equal(oversized.status, 413);
    assertSecurityHeaders(oversized);
  } finally {
    await stop(child);
  }

  const browserMaps = findFilesWithSuffix(path.join(standaloneRoot, ".next", "static"), ".map");
  assert.deepEqual(browserMaps, []);
}

async function verifyMissingConfigFails(startPath, webRoot) {
  const port = await availablePort();
  const env = { ...process.env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port) };
  delete env.API_INTERNAL_BASE_URL;
  const child = spawn(process.execPath, [startPath], { cwd: webRoot, env, stdio: ["ignore", "pipe", "pipe"] });
  const output = collectOutput(child);
  try {
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      fetch(`http://127.0.0.1:${port}/login`).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    if (child.exitCode === null) {
      try {
        await fetch(`http://127.0.0.1:${port}/login`);
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.notEqual(child.exitCode, null, `Server accepted missing production API_INTERNAL_BASE_URL.\n${output()}`);
    assert.notEqual(child.exitCode, 0, `Server exited successfully despite missing production configuration.\n${output()}`);
  } finally {
    await stop(child);
  }
}

async function main() {
  const webRoot = path.resolve(__dirname, "..");
  const standaloneRoot = discoverStandaloneWebRoot(webRoot);
  const startPath = path.join(webRoot, "scripts", "start-standalone.cjs");
  await verifyHardenedRuntime(startPath, webRoot, standaloneRoot);
  await verifyMissingConfigFails(startPath, webRoot);
  process.stdout.write("Stage 21 standalone security acceptance passed.\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
