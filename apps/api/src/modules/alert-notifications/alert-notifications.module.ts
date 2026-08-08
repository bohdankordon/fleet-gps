import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database";
import { AlertNotificationOutboxRepository } from "./alert-notification-outbox.repository";

@Module({
  imports: [DatabaseModule],
  providers: [AlertNotificationOutboxRepository],
  exports: [AlertNotificationOutboxRepository],
})
export class AlertNotificationsModule {}
