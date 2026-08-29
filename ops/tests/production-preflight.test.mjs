import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = path.resolve(process.cwd());
const fixture = readFileSync(path.join(repositoryRoot, "ops", "tests", "production.synthetic.env"), "utf8");

function configuredEnvironment(planning) {
  const safeBackupDirectory = process.platform === "win32" ? "C:/taxi-gps-preflight-test-backups" : "/srv/taxi-gps-preflight-test-backups";
  return fixture
    .replace(/^BACKUP_DIR=.*$/m, `BACKUP_DIR=${safeBackupDirectory}`)
    .replace(/^APP_IMAGE_TAG=.*$/m, "APP_IMAGE_TAG=preflight-tooling-test")
    .replace(/^TELEGRAM_NOTIFICATIONS_ENABLED=.*$/m, "TELEGRAM_NOTIFICATIONS_ENABLED=true")
    .replace(/^TELEGRAM_BOT_TOKEN=.*$/m, "TELEGRAM_BOT_TOKEN=synthetic-legacy-token")
    .replace(/^TELEGRAM_CHAT_ID=.*$/m, "TELEGRAM_CHAT_ID=synthetic-legacy-chat")
    .replace(/^TELEGRAM_PRODUCT_LINKING_ENABLED=.*$/m, "TELEGRAM_PRODUCT_LINKING_ENABLED=true")
    .replace(/^TELEGRAM_PRODUCT_BOT_USERNAME=.*$/m, "TELEGRAM_PRODUCT_BOT_USERNAME=synthetic_product_bot")
    .replace(/^TELEGRAM_PRODUCT_BOT_TOKEN=.*$/m, "TELEGRAM_PRODUCT_BOT_TOKEN=synthetic-product-token")
    .replace(/^TELEGRAM_PRODUCT_WEBHOOK_SECRET=.*$/m, "TELEGRAM_PRODUCT_WEBHOOK_SECRET=synthetic-webhook-secret")
    .replace(/^TELEGRAM_PER_USER_NOTIFICATIONS_ENABLED=.*$/m, `TELEGRAM_PER_USER_NOTIFICATIONS_ENABLED=${planning}`);
}

function fakeDocker(root) {
  // production-preflight invokes `<DOCKER_BIN> compose ...`; using Node as the
  // executable and an extensionless `compose` fixture keeps this portable.
  const implementation = path.join(root, "compose");
  writeFileSync(implementation, [
    'import { appendFileSync } from "node:fs";',
    'appendFileSync(process.env.FAKE_DOCKER_LOG, `${JSON.stringify(process.argv.slice(2))}\\n`);',
    'if (process.env.FAKE_DOCKER_FAIL_RUNTIME === "true" && process.argv.includes("apps/api/dist/scripts/production-config-check.js")) process.exit(23);',
  ].join("\n"));
  return process.execPath;
}

function releaseTree() {
  const root = mkdtempSync(path.join(tmpdir(), "taxi-gps-production-release-"));
  cpSync(path.join(repositoryRoot, "ops"), path.join(root, "ops"), { recursive: true });
  for (const file of ["compose.production.yaml", ".env.example", ".env.production.example"]) cpSync(path.join(repositoryRoot, file), path.join(root, file));
  writeFileSync(path.join(root, ".env.production"), configuredEnvironment(false));
  return { root, docker: fakeDocker(root), log: path.join(root, "docker.log") };
}

function runPreflight(release, extraEnvironment = {}) {
  return spawnSync(process.execPath, [path.join(release.root, "ops", "production-preflight.mjs"), "--env-file", ".env.production"], {
    cwd: release.root,
    env: { ...process.env, DOCKER_BIN: release.docker, FAKE_DOCKER_LOG: release.log, ...extraEnvironment },
    encoding: "utf8",
  });
}

test("release-tree preflight passes dark and shadow modes without host node_modules or tsc", (t) => {
  const release = releaseTree();
  t.after(() => rmSync(release.root, { recursive: true, force: true }));
  assert.equal(existsSync(path.join(release.root, "node_modules")), false);

  const dark = runPreflight(release);
  assert.equal(dark.status, 0, `${dark.stdout}\n${dark.stderr}`);

  writeFileSync(path.join(release.root, ".env.production"), configuredEnvironment(true));
  const shadow = runPreflight(release);
  assert.equal(shadow.status, 0, `${shadow.stdout}\n${shadow.stderr}`);

  const invocations = readFileSync(release.log, "utf8");
  assert.match(invocations, /"config","--quiet"/);
  assert.match(invocations, /"run","--rm","--no-deps","--entrypoint","node","api","apps\/api\/dist\/scripts\/production-config-check\.js"/);
  assert.doesNotMatch(invocations, /equgps:build|api:build|tsc/);
});

test("runtime artifact/config validation failure blocks preflight safely", (t) => {
  const release = releaseTree();
  t.after(() => rmSync(release.root, { recursive: true, force: true }));
  const result = runPreflight(release, { FAKE_DOCKER_FAIL_RUNTIME: "true" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /compiled API production configuration validation failed/);
  assert.equal(`${result.stdout}${result.stderr}`.includes("synthetic-product-token"), false);
});
