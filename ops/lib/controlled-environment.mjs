// Preserve ordinary host/tool execution variables while removing every
// production configuration and Compose interpolation name from an inherited
// child process environment. The explicitly selected env file remains the sole
// authority for those names when passed to Docker Compose with --env-file.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

export function referencedEnvironmentNames(text) {
  return [...text.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]);
}

export function productionConfigurationNames({ envFile, repositoryRoot, composeFile = path.join(repositoryRoot, "compose.production.yaml") }) {
  const names = new Set();
  for (const file of [envFile, path.join(repositoryRoot, ".env.production.example"), path.join(repositoryRoot, ".env.example")]) {
    if (!existsSync(file)) continue;
    for (const name of Object.keys(parseEnv(readFileSync(file, "utf8")))) names.add(name);
  }
  for (const name of referencedEnvironmentNames(readFileSync(composeFile, "utf8"))) names.add(name);
  return names;
}

export function controlledEnvironment({ envFile, repositoryRoot, composeFile, inheritedEnvironment = process.env }) {
  const result = { ...inheritedEnvironment };
  for (const name of productionConfigurationNames({ envFile, repositoryRoot, composeFile })) delete result[name];
  return result;
}
