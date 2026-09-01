"use strict";

// This module deliberately has no Prisma, Nest, or network dependency.  It is
// shared by the development-only fixture CLI and its focused guard tests.
const LOCAL_DATABASE = "taxi_gps";
const LOCAL_PORT = "5433";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const PRODUCTION_WORDS = /prod|production|rds|cloudsql|azure|amazonaws|database\.|db\./i;

function safetyError(message) {
  const error = new Error(message);
  error.name = "VehicleDetailFixtureSafetyError";
  return error;
}

function parseLocalDevelopmentDatabase(env = process.env) {
  const mode = env.NODE_ENV;
  if (mode !== undefined && mode !== "" && mode !== "development") throw safetyError("fixture requires NODE_ENV=development (or an unset local default)");
  if (env.TEST_DATABASE === "1") throw safetyError("fixture refuses the isolated test database");
  if (typeof env.DATABASE_URL !== "string" || env.DATABASE_URL.trim() === "") throw safetyError("fixture requires a local development database configuration");
  let url;
  try { url = new URL(env.DATABASE_URL.trim()); } catch { throw safetyError("fixture database URL is invalid"); }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") throw safetyError("fixture requires PostgreSQL");
  const hostname = url.hostname.toLowerCase();
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (PRODUCTION_WORDS.test(hostname) || PRODUCTION_WORDS.test(database)) throw safetyError("fixture rejects production-looking database targets");
  if (!LOCAL_HOSTS.has(hostname)) throw safetyError("fixture requires a loopback database host");
  if (url.port !== "" && url.port !== LOCAL_PORT) throw safetyError("fixture requires the known local development PostgreSQL port");
  if (database !== LOCAL_DATABASE) throw safetyError("fixture requires the known local development database");
  return Object.freeze({ hostname, database, port: url.port || "5432", mode: mode || "development-default" });
}

module.exports = { LOCAL_DATABASE, LOCAL_PORT, parseLocalDevelopmentDatabase, safetyError };
