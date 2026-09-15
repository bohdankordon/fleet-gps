import { Module } from "@nestjs/common";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { DatabaseModule } from "../database";
import { VehicleAccessModule } from "../vehicle-access/vehicle-access.module";
import { AlertNotificationDispatcherService } from "./alert-notification-dispatcher.service";
import { AlertNotificationMessageFormatter } from "./alert-notification-message.formatter";
import { AlertNotificationOutboxRepository } from "./alert-notification-outbox.repository";
import { AlertNotificationRecipientPlanner } from "./alert-notification-recipient-planner.service";
import { RecipientDeliveryRepository } from "./recipient-delivery.repository";
import { RecipientDeliveryDispatcherService } from "./recipient-delivery-dispatcher.service";
import { TelegramLinkingModule } from "../telegram-linking/telegram-linking.module";
import { TELEGRAM_NOTIFICATION_TRANSPORT } from "./alert-notification.tokens";
import { TelegramBotNotificationTransport } from "./telegram-bot-notification.transport";

@Module({
  imports: [DatabaseModule, TelegramLinkingModule, VehicleAccessModule],
  providers: [
    AlertNotificationOutboxRepository,
    AlertNotificationRecipientPlanner,
    RecipientDeliveryRepository,
    RecipientDeliveryDispatcherService,
    AlertNotificationMessageFormatter,
    {
      provide: TelegramBotNotificationTransport,
      useFactory: (config: ApiConfig) => new TelegramBotNotificationTransport(config.telegramNotifications),
      inject: [API_CONFIG],
    },
    { provide: TELEGRAM_NOTIFICATION_TRANSPORT, useExisting: TelegramBotNotificationTransport },
    AlertNotificationDispatcherService,
  ],
  exports: [AlertNotificationOutboxRepository, AlertNotificationDispatcherService, AlertNotificationRecipientPlanner, RecipientDeliveryDispatcherService],
})
export class AlertNotificationsModule {}
