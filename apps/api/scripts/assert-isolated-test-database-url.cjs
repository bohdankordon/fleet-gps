const { assertTestDatabaseUrl } = require("./assert-test-database-url.cjs");
const { assertContainerTestDatabaseUrl } = require("./assert-container-test-database-url.cjs");

function assertIsolatedTestDatabaseUrl(env = process.env) {
  return env.TEST_DATABASE_RUNNER === "linux" ? assertContainerTestDatabaseUrl(env) : assertTestDatabaseUrl(env);
}

module.exports = { assertIsolatedTestDatabaseUrl };
