// Production runtime for the Stage 23 monitor: real Docker CLI, local-loopback
// HTTPS with TLS verification, filesystem inspection, and the accepted Stage 22
// checksum verifier. Nothing here prints credentials or raw command output.

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import https from "node:https";
import path from "node:path";
import { parseComposePsLines } from "./monitor-checks.mjs";
import { controlledEnvironment } from "./controlled-environment.mjs";

const API_READY_SCRIPT = "fetch('http://127.0.0.1:3000/api/health/ready').then(function(r){process.exit(r.ok?0:1)}).catch(function(){process.exit(1)})";
const POSTGRES_READY_CMD = 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"';

// Local-loopback HTTPS probe options. DNS is forced to loopback while SNI,
// certificate hostname validation, and the Host header all use the real
// production hostname. rejectUnauthorized stays true (never "insecure").
// Node 24 may invoke a custom lookup with { all: true }; in that mode the
// callback must receive an address array, otherwise Node throws
// ERR_INVALID_IP_ADDRESS before connecting.
function edgeLoopbackLookup(_hostname, options, callback) {
  if (options?.all === true) {
    callback(null, [{ address: "127.0.0.1", family: 4 }]);
    return;
  }
  callback(null, "127.0.0.1", 4);
}

export function localEdgeHttpsOptions(hostname, requestPath, httpsTimeout) {
  return {
    hostname,
    port: 443,
    path: requestPath,
    method: "GET",
    servername: hostname,
    lookup: edgeLoopbackLookup,
    rejectUnauthorized: true,
    timeout: httpsTimeout,
    headers: { host: hostname },
  };
}

export function createProductionRuntime({ repositoryRoot, envFile, dockerBin = "docker", shBin = "sh", timeouts = {} }) {
  const composeFile = path.join(repositoryRoot, "compose.production.yaml");
  const backupVerifyPath = path.join(repositoryRoot, "ops", "backup-verify.sh");
  const childEnvironment = controlledEnvironment({ envFile, repositoryRoot, composeFile });

  const dockerTimeout = timeouts.dockerTimeout ?? 10_000;
  const probeTimeout = timeouts.probeTimeout ?? 10_000;
  const httpsTimeout = timeouts.httpsTimeout ?? 10_000;

  function runDocker(args, { timeout = dockerTimeout } = {}) {
    const result = spawnSync(dockerBin, args, {
      cwd: repositoryRoot,
      env: childEnvironment,
      timeout,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  }

  function composeArgs(...args) {
    return ["compose", "-f", composeFile, "--env-file", envFile, ...args];
  }

  function dockerEngineOk() {
    const result = runDocker(["info"], { timeout: dockerTimeout });
    return result.status === 0;
  }

  function composeServiceStates() {
    const result = runDocker(composeArgs("ps", "--format", "json"), { timeout: dockerTimeout });
    if (result.status !== 0) return null;
    return parseComposePsLines(result.stdout);
  }

  function execApiReadiness() {
    const result = runDocker(composeArgs("exec", "-T", "api", "node", "-e", API_READY_SCRIPT), { timeout: probeTimeout });
    return result.status === 0;
  }

  function execPostgresReadiness() {
    const result = runDocker(composeArgs("exec", "-T", "postgres", "sh", "-c", POSTGRES_READY_CMD), { timeout: probeTimeout });
    return result.status === 0;
  }

  function discoverPostgresDataDir() {
    const idResult = runDocker(composeArgs("ps", "-q", "postgres"), { timeout: dockerTimeout });
    if (idResult.status !== 0) return null;
    const id = idResult.stdout.trim().split(/\s+/)[0];
    if (!id) return null;

    const inspectResult = runDocker(["inspect", id], { timeout: dockerTimeout });
    if (inspectResult.status !== 0) return null;
    let parsed;
    try {
      parsed = JSON.parse(inspectResult.stdout);
    } catch {
      return null;
    }
    const container = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!container || !Array.isArray(container.Mounts)) return null;
    for (const mount of container.Mounts) {
      if (mount && mount.Destination === "/var/lib/postgresql/data" && typeof mount.Source === "string" && mount.Source !== "") {
        return mount.Source;
      }
    }
    return null;
  }

  function requestLocalHttps({ hostname, path: requestPath }) {
    return new Promise((resolve) => {
      const request = https.request(
        localEdgeHttpsOptions(hostname, requestPath, httpsTimeout),
        (response) => {
          response.resume();
          const status = response.statusCode;
          resolve({ ok: typeof status === "number" && status >= 200 && status < 400, status });
        },
      );
      request.on("timeout", () => {
        request.destroy();
        resolve({ ok: false });
      });
      request.on("error", () => resolve({ ok: false }));
      request.end();
    });
  }

  async function statfs(target) {
    try {
      const stats = await fs.statfs(target);
      return { blocks: stats.blocks, bavail: stats.bavail };
    } catch {
      return null;
    }
  }

  async function listDirectory(directory) {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      return entries.map((entry) => ({ name: entry.name, isFile: entry.isFile(), isSymlink: entry.isSymbolicLink() }));
    } catch {
      return null;
    }
  }

  async function statFile(file) {
    try {
      const stats = await fs.stat(file);
      return { size: stats.size, mtimeMs: stats.mtimeMs };
    } catch {
      return null;
    }
  }

  function verifyBackup(dumpPath) {
    const result = spawnSync(shBin, [backupVerifyPath, dumpPath], {
      cwd: repositoryRoot,
      env: process.env,
      timeout: probeTimeout,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    return result.status === 0;
  }

  return Object.freeze({
    dockerEngineOk,
    composeServiceStates,
    execApiReadiness,
    execPostgresReadiness,
    discoverPostgresDataDir,
    requestLocalHttps,
    statfs,
    listDirectory,
    statFile,
    verifyBackup,
  });
}
