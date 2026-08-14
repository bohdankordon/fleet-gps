#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

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

function referencedEnvironmentNames(text) {
  return [...text.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]);
}

function controlledEnvironment(envFile) {
  const result = { ...process.env };
  const names = new Set();
  for (const file of [envFile, path.join(repositoryRoot, ".env.production.example"), path.join(repositoryRoot, ".env.example")]) {
    if (!existsSync(file)) continue;
    for (const name of Object.keys(parseEnv(readFileSync(file, "utf8")))) names.add(name);
  }
  for (const name of referencedEnvironmentNames(readFileSync(path.join(repositoryRoot, "compose.production.yaml"), "utf8"))) names.add(name);
  for (const name of names) delete result[name];
  return result;
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
  controlledEnv = controlledEnvironment(envFile);
} catch {
  fail("explicit env file is malformed");
}

// Validate Stage 22 fields first so secret sentinels cannot reach downstream
// tools that might include raw values in their diagnostics.
run(process.execPath, [`--env-file=${envFile}`, path.join(repositoryRoot, "ops", "validate-env.mjs")], controlledEnv, "Stage 22 deployment validation");
process.stdout.write("production preflight: Stage 22 deployment fields passed using the explicit env file\n");

const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) fail("must be started through npm");
run(process.execPath, [npmExecPath, "run", "equgps:build"], controlledEnv, "eQuGPS package build");
run(process.execPath, [npmExecPath, "run", "api:build"], controlledEnv, "API build");
run(
  process.execPath,
  [`--env-file=${envFile}`, "--experimental-transform-types", path.join(repositoryRoot, "src", "scripts", "production-check.ts")],
  controlledEnv,
  "Stage 21 application production configuration validation",
);
process.stdout.write("production preflight: Stage 21 application configuration passed using the explicit env file\n");

run(
  dockerCommand(),
  ["compose", "-f", "compose.production.yaml", "--env-file", envFile, "config", "--quiet"],
  controlledEnv,
  "Docker Compose production configuration validation",
);
process.stdout.write("production preflight: Compose configuration passed using the same explicit env file\n");
process.stdout.write("production preflight: valid\n");
