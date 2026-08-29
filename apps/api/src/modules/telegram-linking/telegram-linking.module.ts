import { Module } from "@nestjs/common";
import { AuditModule } from "../audit";
import { DatabaseModule } from "../database/database.module";
import { AccountNotificationsController, AdminTelegramController, TelegramProductWebhookController } from "./telegram-linking.controller";
import { TelegramLinkingService } from "./telegram-linking.service";
import { TelegramLinkRateLimiter } from "./telegram-link-rate-limiter";
import { TelegramProductBotHttpTransport, TELEGRAM_PRODUCT_BOT_TRANSPORT } from "./telegram-product-bot.transport";
@Module({ imports: [DatabaseModule, AuditModule], controllers: [AccountNotificationsController, AdminTelegramController, TelegramProductWebhookController], providers: [TelegramLinkingService, TelegramLinkRateLimiter, TelegramProductBotHttpTransport, { provide: TELEGRAM_PRODUCT_BOT_TRANSPORT, useExisting: TelegramProductBotHttpTransport }], exports: [TelegramLinkingService] })
export class TelegramLinkingModule {}
