import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { RecipientDeliveryDispatcherService } from "../alert-notifications/recipient-delivery-dispatcher.service";

export const RECIPIENT_DELIVERY_SCHEDULER_INTERVAL = "taxi-gps:telegram:recipient-delivery";

@Injectable()
export class RecipientDeliverySchedulerService implements OnModuleInit, OnModuleDestroy {
  private handle: ReturnType<typeof setInterval> | null = null;
  private active = false;
  public constructor(@Inject(API_CONFIG) private readonly config: ApiConfig, private readonly dispatcher: RecipientDeliveryDispatcherService) {}
  public onModuleInit(): void {
    if (this.config.telegramPerUserDispatch?.enabled !== true || this.handle !== null) return;
    this.handle = setInterval(() => { void this.run(); }, this.config.telegramPerUserDispatch.dispatchIntervalMs);
    this.handle.unref?.();
  }
  public onModuleDestroy(): void { if (this.handle !== null) clearInterval(this.handle); this.handle = null; }
  private async run(): Promise<void> { if (this.active) return; this.active = true; try { await this.dispatcher.dispatchBatch(this.config.telegramPerUserDispatch?.batchSize ?? 20); } catch { /* DB leases remain authoritative */ } finally { this.active = false; } }
}
