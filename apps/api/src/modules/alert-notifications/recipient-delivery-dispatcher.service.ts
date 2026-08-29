import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { TELEGRAM_PRODUCT_BOT_TRANSPORT, TelegramProductTransportError, type TelegramProductBotTransport } from "../telegram-linking/telegram-product-bot.transport";
import { AlertNotificationMessageFormatter } from "./alert-notification-message.formatter";
import { RecipientDeliveryRepository, validateRecipientDeliveryBatchLimit } from "./recipient-delivery.repository";
import { RecipientDeliveryLostLeaseError } from "./recipient-delivery.types";
import { recipientDeliveryExhausted, recipientDeliveryRetryDelayMs } from "./recipient-delivery-retry.policy";

export type RecipientDeliveryDispatchResult = Readonly<{ claimed: number; sent: number; retryScheduled: number; suppressed: number; failed: number; lostLease: number }>;
const empty = (): RecipientDeliveryDispatchResult => Object.freeze({ claimed: 0, sent: 0, retryScheduled: 0, suppressed: 0, failed: 0, lostLease: 0 });

@Injectable()
export class RecipientDeliveryDispatcherService {
  public constructor(private readonly repository: RecipientDeliveryRepository, private readonly formatter: AlertNotificationMessageFormatter, @Inject(TELEGRAM_PRODUCT_BOT_TRANSPORT) private readonly transport: TelegramProductBotTransport, @Inject(API_CONFIG) private readonly config: ApiConfig) {}
  public async dispatchBatch(limit: number): Promise<RecipientDeliveryDispatchResult> {
    const bounded = validateRecipientDeliveryBatchLimit(limit); if (!this.config.telegramPerUserDispatch?.enabled) return empty();
    await this.repository.expireOverAge(); let result = empty();
    while (result.claimed < bounded) {
      const claimed = await this.repository.claimNext(1, randomUUID()); if (claimed.length === 0) break;
      const delivery = claimed[0]!; result = { ...result, claimed: result.claimed + 1 };
      try {
        const boundary = this.config.telegramPerUserDispatch?.dispatchNotBefore;
        if (boundary !== null && boundary !== undefined && delivery.createdAt.getTime() < boundary.getTime()) {
          await this.repository.markSuppressed(delivery.id, delivery.leaseToken, "CUTOVER_BOUNDARY"); result = { ...result, suppressed: result.suppressed + 1 }; continue;
        }
        const recheck = await this.repository.recheck(delivery.id, delivery.leaseToken);
        if (recheck.kind === "LOST_LEASE") { result = { ...result, lostLease: result.lostLease + 1 }; continue; }
        if (recheck.kind === "SUPPRESS") { await this.repository.markSuppressed(delivery.id, delivery.leaseToken, recheck.code); result = { ...result, suppressed: result.suppressed + 1 }; continue; }
        try { await this.transport.sendAlertConfirmed(recheck.source.chatId, this.formatter.formatAlertConfirmed(recheck.source)); }
        catch (error) {
          if (!(error instanceof TelegramProductTransportError)) throw error;
          const exhausted = recipientDeliveryExhausted(delivery.attemptCount + 1, delivery.createdAt);
          if (error.recipientPermanent) { await this.repository.markFailed(delivery.id, delivery.leaseToken, error.code, true); result = { ...result, failed: result.failed + 1 }; }
          else if (exhausted !== null || !error.retryable) { await this.repository.markFailed(delivery.id, delivery.leaseToken, exhausted ?? error.code, false); result = { ...result, failed: result.failed + 1 }; }
          else { await this.repository.releaseRetry(delivery.id, delivery.leaseToken, error.code, recipientDeliveryRetryDelayMs(delivery.attemptCount + 1)); result = { ...result, retryScheduled: result.retryScheduled + 1 }; }
          continue;
        }
        await this.repository.markSent(delivery.id, delivery.leaseToken); result = { ...result, sent: result.sent + 1 };
      } catch (error) { if (!(error instanceof RecipientDeliveryLostLeaseError)) throw error; result = { ...result, lostLease: result.lostLease + 1 }; }
    }
    return Object.freeze(result);
  }
}
