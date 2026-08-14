#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DeploymentConfigurationError, validateDeploymentEnvironment } from "./lib/deployment-config.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  validateDeploymentEnvironment(process.env, { repositoryRoot });
  process.stdout.write("validate-env: deployment configuration is consistent\n");
} catch (error) {
  const fields = error instanceof DeploymentConfigurationError ? error.issues : [];
  process.stderr.write(`validate-env: invalid fields${fields.length > 0 ? `: ${fields.join(",")}` : ""}\n`);
  process.exitCode = 1;
}
