// Shared host-level notification orchestration for systemd OnFailure and the
// manual TEST command. Transport is injected so acceptance uses fake delivery
// exclusively while production uses the same preparation path.

import { toUtcTimestamp } from "./monitor-config.mjs";
import { validateNotifierEnvironment, validateTestNotificationEnvironment } from "./monitor-env.mjs";
import { buildBackupFailureMessage, buildMonitorSelfFailureMessage, buildTestMessage } from "./monitor-message.mjs";

export const FAILURE_NOTIFICATION_KINDS = Object.freeze(["monitor", "backup-daily", "backup-weekly"]);

export class HostNotificationKindError extends Error {
  constructor() {
    super("Unknown operational notification kind.");
    this.name = "HostNotificationKindError";
  }
}

export function prepareHostNotification({ kind, env, now = Date.now() }) {
  const failureKind = FAILURE_NOTIFICATION_KINDS.includes(kind);
  if (!failureKind && kind !== "test") throw new HostNotificationKindError();

  const config = kind === "test" ? validateTestNotificationEnvironment(env) : validateNotifierEnvironment(env);
  if (!config.alertsEnabled) return Object.freeze({ enabled: false, config, message: null });

  const utcTimestamp = toUtcTimestamp(now);
  let message;
  if (kind === "monitor") message = buildMonitorSelfFailureMessage({ utcTimestamp });
  else if (kind === "backup-daily") message = buildBackupFailureMessage({ tier: "daily", utcTimestamp });
  else if (kind === "backup-weekly") message = buildBackupFailureMessage({ tier: "weekly", utcTimestamp });
  else message = buildTestMessage({ siteHostname: config.siteHostname, appImageTag: config.appImageTag, utcTimestamp });

  return Object.freeze({ enabled: true, config, message });
}

export async function deliverHostNotification({ kind, env, now = Date.now(), send }) {
  const prepared = prepareHostNotification({ kind, env, now });
  if (!prepared.enabled) return Object.freeze({ delivered: false, disabled: true });
  await send({ botToken: prepared.config.botToken, chatId: prepared.config.chatId, message: prepared.message });
  return Object.freeze({ delivered: true, disabled: false });
}
