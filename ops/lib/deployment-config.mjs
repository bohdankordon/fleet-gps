import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

export class DeploymentConfigurationError extends Error {
  constructor(issues) {
    super("Invalid deployment configuration.");
    this.name = "DeploymentConfigurationError";
    this.issues = Object.freeze([...new Set(issues)].sort());
  }
}

function decodeUrlComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function pathTools(value) {
  return path.isAbsolute(value) ? path : null;
}

function isInsideOrEqual(candidate, parent, tools) {
  const relative = tools.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${tools.sep}`) && relative !== ".." && !tools.isAbsolute(relative));
}

function resolveThroughExistingAncestor(value, tools) {
  let cursor = value;
  const missingSegments = [];
  while (!existsSync(cursor)) {
    const parent = tools.dirname(cursor);
    if (parent === cursor) return value;
    missingSegments.unshift(tools.basename(cursor));
    cursor = parent;
  }
  return tools.resolve(realpathSync(cursor), ...missingSegments);
}

function backupPathIsSafe(value, repositoryRoot) {
  const tools = pathTools(value);
  if (tools === null) return false;

  const resolved = tools.resolve(value);
  const repositoryTools = pathTools(repositoryRoot);
  if (repositoryTools === tools && isInsideOrEqual(resolved, tools.resolve(repositoryRoot), tools)) return false;

  // If both paths exist, also reject a symlinked path that resolves into the
  // checkout. Lexical checking above still covers a not-yet-created path.
  if (existsSync(repositoryRoot)) {
    const realCandidate = resolveThroughExistingAncestor(resolved, tools);
    const realRepository = realpathSync(repositoryRoot);
    if (isInsideOrEqual(realCandidate, realRepository, path)) return false;
  }
  return true;
}

export function validateDeploymentEnvironment(env, { repositoryRoot = process.cwd() } = {}) {
  const issues = [];
  const invalid = (...fields) => issues.push(...fields);

  const postgresUser = env.POSTGRES_USER ?? "";
  const postgresPassword = env.POSTGRES_PASSWORD ?? "";
  const postgresDatabase = env.POSTGRES_DB ?? "";
  const databaseUrl = env.DATABASE_URL ?? "";

  if (!/^[A-Za-z0-9_]+$/.test(postgresUser)) invalid("POSTGRES_USER");
  if (postgresPassword === "") invalid("POSTGRES_PASSWORD");
  if (!/^[A-Za-z0-9_]+$/.test(postgresDatabase)) invalid("POSTGRES_DB");

  let parsedDatabaseUrl;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    invalid("DATABASE_URL");
  }

  if (parsedDatabaseUrl !== undefined) {
    if (parsedDatabaseUrl.protocol !== "postgresql:" && parsedDatabaseUrl.protocol !== "postgres:") invalid("DATABASE_URL");
    if (parsedDatabaseUrl.hostname !== "postgres") invalid("DATABASE_URL");
    if (parsedDatabaseUrl.port !== "5432") invalid("DATABASE_URL");
    if (parsedDatabaseUrl.hash !== "") invalid("DATABASE_URL");

    const decodedUser = decodeUrlComponent(parsedDatabaseUrl.username);
    const decodedPassword = decodeUrlComponent(parsedDatabaseUrl.password);
    const decodedDatabase = decodeUrlComponent(parsedDatabaseUrl.pathname.slice(1));
    if (decodedUser === null || decodedUser !== postgresUser) invalid("DATABASE_URL", "POSTGRES_USER");
    if (decodedPassword === null || decodedPassword !== postgresPassword) invalid("DATABASE_URL", "POSTGRES_PASSWORD");
    if (decodedDatabase === null || decodedDatabase === "" || decodedDatabase.includes("/") || decodedDatabase !== postgresDatabase) invalid("DATABASE_URL", "POSTGRES_DB");
  }

  const siteAddress = env.SITE_ADDRESS ?? "";
  try {
    const siteUrl = new URL(siteAddress);
    if (
      siteUrl.protocol !== "https:" ||
      siteUrl.origin === "null" ||
      siteUrl.username !== "" ||
      siteUrl.password !== "" ||
      siteUrl.pathname !== "/" ||
      siteUrl.search !== "" ||
      siteUrl.hash !== ""
    ) invalid("SITE_ADDRESS");
  } catch {
    invalid("SITE_ADDRESS");
  }

  const imageTag = env.APP_IMAGE_TAG ?? "";
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(imageTag) || imageTag.toLowerCase() === "latest") invalid("APP_IMAGE_TAG");

  const backupDirectory = env.BACKUP_DIR ?? "";
  if (backupDirectory === "" || !backupPathIsSafe(backupDirectory, repositoryRoot)) invalid("BACKUP_DIR");

  for (const field of ["BACKUP_RETENTION_DAILY", "BACKUP_RETENTION_WEEKLY"]) {
    const value = env[field];
    if (value !== undefined && !/^[1-9][0-9]*$/.test(value)) invalid(field);
  }

  if (issues.length > 0) throw new DeploymentConfigurationError(issues);
  return Object.freeze({ valid: true });
}
