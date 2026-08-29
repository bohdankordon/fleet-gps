const { spawnSync } = require("node:child_process");
const { assertContainerTestDatabaseUrl } = require("./assert-container-test-database-url.cjs");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: "/workspace", env: process.env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function buildApi() {
  // The production/root build establishes this workspace prerequisite too.
  // The runner intentionally has no host packages/equgps/dist mounted.
  run("npm", ["run", "equgps:build"]);
  run("npm", ["--workspace", "@taxi-gps/api", "run", "build"]);
}

function compileApiTests() {
  run("npm", ["--workspace", "@taxi-gps/api", "exec", "tsc", "--", "-p", "tsconfig.test.json"]);
}

function testSelector(selector) {
  const prefix = "apps/api/src/";
  return selector.startsWith(prefix) && selector.endsWith(".ts")
    ? `apps/api/.test-dist/${selector.slice(prefix.length, -3)}.js`
    : selector;
}

function main() {
  assertContainerTestDatabaseUrl();
  if (process.platform !== "linux") throw new Error("The isolated DB runner must execute on Linux.");
  const [action, ...argumentsForAction] = process.argv.slice(2);
  switch (action) {
    case "validate":
      run("npm", ["--workspace", "@taxi-gps/api", "run", "prisma:validate"]);
      return;
    case "migrate":
      run("npm", ["--workspace", "@taxi-gps/api", "run", "prisma:migrate:deploy"]);
      run(process.execPath, ["apps/api/scripts/report-test-migrations.cjs"]);
      return;
    case "smoke":
      buildApi();
      run(process.execPath, ["--test", "apps/api/test/isolated-postgres.smoke.test.cjs"]);
      return;
    case "api-test":
      if (argumentsForAction.length === 0) throw new Error("api-test requires one or more Node test selectors.");
      buildApi();
      compileApiTests();
      run(process.execPath, ["--test", ...argumentsForAction.map(testSelector)]);
      return;
    case "api-typecheck":
      run("npm", ["run", "equgps:build"]);
      run("npm", ["--workspace", "@taxi-gps/api", "run", "typecheck"]);
      return;
    case "api-full-test":
      run("npm", ["run", "equgps:build"]);
      run("npm", ["--workspace", "@taxi-gps/api", "run", "test"]);
      return;
    default:
      throw new Error("Choose validate, migrate, smoke, api-test, api-typecheck, or api-full-test.");
  }
}

try { main(); } catch (error) { console.error(`Linux DB runner failed: ${error instanceof Error ? error.message : "unknown error."}`); process.exitCode = 1; }
