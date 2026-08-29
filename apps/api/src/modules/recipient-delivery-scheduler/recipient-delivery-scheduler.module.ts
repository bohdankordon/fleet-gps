import { Module } from "@nestjs/common";
import { AlertNotificationsModule } from "../alert-notifications/alert-notifications.module";
import { RecipientDeliverySchedulerService } from "./recipient-delivery-scheduler.service";
@Module({ imports: [AlertNotificationsModule], providers: [RecipientDeliverySchedulerService] })
export class RecipientDeliverySchedulerModule {}
