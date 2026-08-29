const expected = Object.freeze({ host: "postgres-test", port: "5432", database: "taxi_gps_test", user: "taxi_gps_test" });

function assertContainerTestDatabaseUrl(env = process.env) {
  if (env.TEST_DATABASE !== "1") throw new Error("TEST_DATABASE must be exactly 1.");
  if (env.TEST_DATABASE_RUNNER !== "linux") throw new Error("TEST_DATABASE_RUNNER must be exactly linux.");
  if (typeof env.DATABASE_URL !== "string" || env.DATABASE_URL.trim() === "") throw new Error("A container test DATABASE_URL is required.");

  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error("DATABASE_URL must be a valid PostgreSQL URL."); }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") throw new Error("DATABASE_URL must use PostgreSQL.");
  if (url.hostname.toLowerCase() !== expected.host) throw new Error("DATABASE_URL host is not the isolated test service.");
  if (url.port !== expected.port) throw new Error("DATABASE_URL port is not the isolated test service port.");
  if (database !== expected.database) throw new Error("DATABASE_URL database is not the isolated test database.");
  if (decodeURIComponent(url.username) !== expected.user) throw new Error("DATABASE_URL user is not the isolated test user.");
  return url;
}

if (require.main === module) {
  try {
    assertContainerTestDatabaseUrl();
    console.log("Isolated Linux test database target accepted.");
  } catch (error) {
    console.error(`Refusing database action: ${error instanceof Error ? error.message : "invalid test target."}`);
    process.exitCode = 1;
  }
}

module.exports = { assertContainerTestDatabaseUrl };
