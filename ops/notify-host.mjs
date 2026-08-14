#!/usr/bin/env node
// Host-level operational notifier for systemd OnFailure units and the manual
// TEST procedure. The bot token is read from the explicit env file and never
// passed through process argv or written to any log.

import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deliverHostNotification } from "./lib/host-notification.mjs";
import { loadEnvironment, MonitorConfigurationError } from "./lib/monitor-env.mjs";
import { TelegramNotifier } from "./lib/monitor-notify.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  process.stderr.write("notify-host: " + message + "\n");
  process.exit(1);
}

function parseArguments(argv) {
  let envFile = null;
  let kind = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--env-file" && argv[i + 1]) {
      envFile = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--env-file=") && arg.slice(11) !== "") {
      envFile = arg.slice(11);
    } else if (arg === "--kind" && argv[i + 1]) {
      kind = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--kind=") && arg.slice(7) !== "") {
      kind = arg.slice(7);
    }
  }
  if (!envFile || !kind) {
    throw new Error("usage: node notify-host.mjs --env-file .env.production --kind monitor|backup-daily|backup-weekly|test");
  }
  return { envFile, kind };
}

async function main() {
  let args;
  try {
    args = parseArguments(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
  }

  const envFile = path.resolve(repositoryRoot, args.envFile);
  if (!existsSync(envFile) || !statSync(envFile).isFile()) fail("env file is missing or not a regular file");

  let env;
  try {
    env = loadEnvironment(envFile);
  } catch {
    fail("env file is malformed");
  }

  let outcome;
  try {
    outcome = await deliverHostNotification({
      kind: args.kind,
      env,
      send: ({ botToken, chatId, message }) => new TelegramNotifier({ botToken, chatId }).sendMessage(message),
    });
  } catch (error) {
    if (error instanceof MonitorConfigurationError) {
      fail("invalid notifier configuration" + (error.issues.length > 0 ? ": " + error.issues.join(",") : ""));
    }
    if (error && error.name === "HostNotificationKindError") fail("unknown notification kind");
    fail("delivery failed");
  }

  if (outcome.disabled) {
    process.stdout.write("notify-host: operational alerts disabled; not sending\n");
    return;
  }
  process.stdout.write("notify-host: delivered\n");
}

main().catch(() => fail("internal failure"));
