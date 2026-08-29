#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { controlledEnvironment } from "./lib/controlled-environment.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  process.stderr.write(`production preflight: ${message}\n`);
  process.exit(1);
}

function parseArguments(argv) {
  if (argv.length === 2 && argv[0] === "--env-file" && argv[1] !== "") return argv[1];
  if (argv.length === 1 && argv[0].startsWith("--env-file=") && argv[0].slice(11) !== "") return argv[0].slice(11);
  fail("usage: npm run production:check -- --env-file .env.production");
}

function run(command, args, env, label) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, env, stdio: "inherit", shell: false });
  if (result.error) fail(`${label} could not start`);
  if (result.status !== 0) fail(`${label} failed`);
}

function dockerCommand() {
  if (process.env.DOCKER_BIN) return process.env.DOCKER_BIN;
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const desktopDocker = path.join(localAppData, "Programs", "DockerDesktop", "resources", "bin", "docker.exe");
      if (existsSync(desktopDocker)) return desktopDocker;
    }
  }
  return "docker";
}

const suppliedPath = parseArguments(process.argv.slice(2));
const envFile = path.resolve(repositoryRoot, suppliedPath);
if (!existsSync(envFile) || !statSync(envFile).isFile()) fail("explicit env file is missing or not a regular file");

let controlledEnv;
try {
  controlledEnv = controlledEnvironment({ envFile, repositoryRoot });
} catch {
  fail("explicit env file is malformed");
}

// Validate Stage 22 fields first so secret sentinels cannot reach downstream
// tools that might include raw values in their diagnostics.
run(process.execPath, [`--env-file=${envFile}`, path.join(repositoryRoot, "ops", "validate-env.mjs")], controlledEnv, "Stage 22 deployment validation");
process.stdout.write("production preflight: Stage 22 deployment fields passed using the explicit env file\n");

const docker = dockerCommand();
const composeArgs = ["compose", "-f", "compose.production.yaml", "--env-file", envFile];
run(docker, [...composeArgs, "config", "--quiet"], controlledEnv, "Docker Compose production configuration validation");
process.stdout.write("production preflight: Compose configuration passed using the same explicit env file\n");

// Source compilation belongs to the pinned image build. Validate the actual
// compiled API configuration parser and its @taxi-gps/equgps dependency from
// that runtime image instead of relying on undeclared host devDependencies.
run(
  docker,
  [...composeArgs, "run", "--rm", "--no-deps", "--entrypoint", "node", "api", "apps/api/dist/scripts/production-config-check.js"],
  controlledEnv,
  "compiled API production configuration validation",
);
process.stdout.write("production preflight: compiled API configuration and runtime artifacts passed using the explicit env file\n");
process.stdout.write("production preflight: valid\n");
