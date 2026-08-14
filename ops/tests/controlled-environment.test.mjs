import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { controlledEnvironment, productionConfigurationNames, referencedEnvironmentNames } from "../lib/controlled-environment.mjs";

const repositoryRoot = path.resolve(process.cwd());
const envFile = path.join(repositoryRoot, "ops", "tests", "production.synthetic.env");
const composeFile = path.join(repositoryRoot, "compose.production.yaml");

test("controlled environment removes inherited production and Compose interpolation variables while preserving host tooling", () => {
  const configurationNames = productionConfigurationNames({ envFile, repositoryRoot, composeFile });
  const inherited = {
    PATH: "/host/bin",
    HOME: "/host/home",
    DOCKER_HOST: "tcp://docker.example.test:2376",
    DOCKER_CONTEXT: "production-context",
    HARMLESS_HOST_VALUE: "preserved",
  };
  for (const name of configurationNames) inherited[name] = "INHERITED_" + name;

  const controlled = controlledEnvironment({ envFile, repositoryRoot, composeFile, inheritedEnvironment: inherited });
  for (const name of configurationNames) assert.equal(Object.hasOwn(controlled, name), false, name + " must be removed");

  for (const name of ["SITE_ADDRESS", "APP_IMAGE_TAG", "DATABASE_URL", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB", "BACKUP_DIR", "OPS_ALERTS_ENABLED", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]) {
    assert.equal(Object.hasOwn(controlled, name), false, name + " must be removed");
  }
  assert.equal(controlled.PATH, "/host/bin");
  assert.equal(controlled.HOME, "/host/home");
  assert.equal(controlled.DOCKER_HOST, "tcp://docker.example.test:2376");
  assert.equal(controlled.DOCKER_CONTEXT, "production-context");
  assert.equal(controlled.HARMLESS_HOST_VALUE, "preserved");
});

test("every Compose production interpolation variable is covered by controlled environment filtering", () => {
  const composeReferenced = new Set(referencedEnvironmentNames(readFileSync(composeFile, "utf8")));
  const configurationNames = productionConfigurationNames({ envFile, repositoryRoot, composeFile });
  for (const name of composeReferenced) assert.equal(configurationNames.has(name), true, name + " must be controlled");
});
