export const MAX_ALERT_NOTIFICATION_RETRY_DELAY_MINUTES = 60;

export function alertNotificationRetryDelayMs(attemptCount: number): number {
  if (!Number.isInteger(attemptCount) || attemptCount < 1) throw new RangeError("Attempt count must be a positive integer");
  const minutes = Math.min(2 ** Math.min(attemptCount - 1, 6), MAX_ALERT_NOTIFICATION_RETRY_DELAY_MINUTES);
  return minutes * 60_000;
}
