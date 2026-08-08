import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { AlertNotificationMessageFormatter } from "./alert-notification-message.formatter";
import { AlertNotificationOutboxRepository, validateAlertNotificationBatchLimit } from "./alert-notification-outbox.repository";
import { AlertNotificationLostLeaseError, AlertNotificationOutboxStateError } from "./alert-notification-outbox.types";
import { alertNotificationRetryDelayMs } from "./alert-notification-retry.policy";
import { TELEGRAM_NOTIFICATION_TRANSPORT } from "./alert-notification.tokens";
import { TelegramTransportError, type TelegramNotificationTransport } from "./telegram-notification.transport";

export type AlertNotificationDispatchBatchResult = Readonly<{
  claimed: number;
  sent: number;
  retryScheduled: number;
  failedPermanent: number;
  lostLease: number;
}>;

function result(claimed = 0, sent = 0, retryScheduled = 0, failedPermanent = 0, lostLease = 0): AlertNotificationDispatchBatchResult {
  return Object.freeze({ claimed, sent, retryScheduled, failedPermanent, lostLease });
}

@Injectable()
export class AlertNotificationDispatcherService {
  public constructor(
    private readonly repository: AlertNotificationOutboxRepository,
    private readonly formatter: AlertNotificationMessageFormatter,
    @Inject(TELEGRAM_NOTIFICATION_TRANSPORT) private readonly transport: TelegramNotificationTransport,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  public async dispatchBatch(limit: number): Promise<AlertNotificationDispatchBatchResult> {
    const boundedLimit = validateAlertNotificationBatchLimit(limit);
    if (!this.config.telegramNotifications.enabled) return result();
    let claimed = 0;
    let sent = 0;
    let retryScheduled = 0;
    let failedPermanent = 0;
    let lostLease = 0;

    while (claimed < boundedLimit) {
      const claimedRows = await this.repository.claimNextBatch(1, randomUUID());
      if (claimedRows.length === 0) break;
      if (claimedRows.length !== 1) throw new AlertNotificationOutboxStateError("Single notification claim returned multiple rows");
      const notification = claimedRows[0]!;
      claimed += 1;
      const message = this.formatter.formatAlertConfirmed(notification);
      try {
        await this.transport.sendAlertConfirmed(message);
      } catch (error) {
        if (!(error instanceof TelegramTransportError)) throw error;
        try {
          if (error.retryable) {
            await this.repository.releaseForRetry(notification.id, notification.lockToken, error.code, alertNotificationRetryDelayMs(notification.attemptCount));
            retryScheduled += 1;
          } else {
            await this.repository.markFailed(notification.id, notification.lockToken, error.code);
            failedPermanent += 1;
          }
        } catch (transitionError) {
          if (!(transitionError instanceof AlertNotificationLostLeaseError)) throw transitionError;
          lostLease += 1;
        }
        continue;
      }

      try {
        await this.repository.markSent(notification.id, notification.lockToken);
        sent += 1;
      } catch (error) {
        if (!(error instanceof AlertNotificationLostLeaseError)) throw error;
        lostLease += 1;
      }
    }
    return result(claimed, sent, retryScheduled, failedPermanent, lostLease);
  }
}
