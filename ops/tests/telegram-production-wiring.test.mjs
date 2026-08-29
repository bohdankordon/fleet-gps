import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";

const repositoryRoot = path.resolve(process.cwd());
const compose = readFileSync(path.join(repositoryRoot, "compose.production.yaml"), "utf8");
const productionExample = readFileSync(path.join(repositoryRoot, ".env.production.example"), "utf8");
const apiDockerfile = readFileSync(path.join(repositoryRoot, "apps", "api", "Dockerfile"), "utf8");
const preflight = readFileSync(path.join(repositoryRoot, "ops", "production-preflight.mjs"), "utf8");

function serviceSection(name, nextName) {
  return compose.slice(compose.indexOf(`  ${name}:`), compose.indexOf(`  ${nextName}:`));
}

test("production Compose gives API all Telegram 2A-2C settings and gives Web only the server webhook secret", () => {
  const web = serviceSection("web", "api");
  const api = serviceSection("api", "postgres");
  for (const name of [
    "TELEGRAM_PRODUCT_LINKING_ENABLED",
    "TELEGRAM_PRODUCT_BOT_USERNAME",
    "TELEGRAM_PRODUCT_BOT_TOKEN",
    "TELEGRAM_PRODUCT_WEBHOOK_SECRET",
    "TELEGRAM_PER_USER_NOTIFICATIONS_ENABLED",
    "TELEGRAM_PER_USER_DISPATCH_ENABLED",
    "TELEGRAM_PER_USER_DISPATCH_INTERVAL_MS",
    "TELEGRAM_PER_USER_DISPATCH_BATCH_SIZE",
    "TELEGRAM_PER_USER_DISPATCH_NOT_BEFORE",
  ]) assert.match(api, new RegExp(`^\\s+${name}:`, "m"));
  assert.match(web, /^\s+TELEGRAM_PRODUCT_WEBHOOK_SECRET:/m);
  assert.equal(web.includes("TELEGRAM_PRODUCT_BOT_TOKEN"), false);
  assert.equal(compose.includes("NEXT_PUBLIC_TELEGRAM_PRODUCT_WEBHOOK_SECRET"), false);
});

test("sanitized production template is deploy-dark and contains no public Telegram secret", () => {
  for (const line of [
    "TELEGRAM_PRODUCT_LINKING_ENABLED=false",
    "TELEGRAM_PER_USER_NOTIFICATIONS_ENABLED=false",
    "TELEGRAM_PER_USER_DISPATCH_ENABLED=false",
    "TELEGRAM_PER_USER_DISPATCH_NOT_BEFORE=",
  ]) assert.equal(productionExample.includes(line), true);
  assert.equal(productionExample.includes("NEXT_PUBLIC_TELEGRAM_PRODUCT_WEBHOOK_SECRET"), false);
});

test("API image build owns eQuGPS compilation and runtime preflight uses compiled artifacts", () => {
  assert.match(apiDockerfile, /RUN npm ci\s+RUN npm run equgps:build\s+RUN npm run api:build/);
  assert.match(apiDockerfile, /COPY --from=builder[^\n]+packages\/equgps\/dist/);
  assert.match(apiDockerfile, /COPY --from=builder[^\n]+apps\/api\/dist/);
  assert.doesNotMatch(preflight, /"equgps:build"|"api:build"|\btsc\b/);
  assert.match(preflight, /apps\/api\/dist\/scripts\/production-config-check\.js/);
});
