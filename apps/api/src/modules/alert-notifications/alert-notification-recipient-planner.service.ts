import { Inject, Injectable } from "@nestjs/common";
import { API_CONFIG } from "../../config/api-config.tokens";
import type { ApiConfig } from "../../config/api-config";
import { AlertEventType, AlertNotificationDeliveryStatus, AlertNotificationKind, AuthRole, NotificationVehicleScope, TelegramConnectionStatus, type Prisma } from "../../generated/prisma/client";
import { usersWithProductAccessToVehicleWhere } from "../vehicle-access/vehicle-access.service";

export type ConfirmedAlertForRecipientPlanning = Readonly<{
  id: string;
  vehicleId: string;
  type: "SPEEDING" | "INACTIVITY";
}>;

type PlanningClient = Pick<Prisma.TransactionClient, "vehicle" | "alertNotification" | "authUser" | "alertNotificationDelivery">;

export interface AlertNotificationRecipientPlanning {
  plan(transaction: PlanningClient, event: ConfirmedAlertForRecipientPlanning): Promise<void>;
}

/**
 * Creates per-user delivery intent only. A future dispatcher must re-check all
 * eligibility below, including the stored connection revision, before sending.
 */
@Injectable()
export class AlertNotificationRecipientPlanner implements AlertNotificationRecipientPlanning {
  public constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  public async plan(transaction: PlanningClient, event: ConfirmedAlertForRecipientPlanning): Promise<void> {
    if (this.config.telegramPerUserNotifications?.enabled !== true) return;

    const notification = await transaction.alertNotification.upsert({
      where: { alertEventId_kind: { alertEventId: event.id, kind: AlertNotificationKind.ALERT_CONFIRMED } },
      create: { alertEventId: event.id, kind: AlertNotificationKind.ALERT_CONFIRMED },
      update: {},
      select: { id: true },
    });
    const vehicle = await transaction.vehicle.findUnique({ where: { id: event.vehicleId }, select: { disabled: true } });
    if (vehicle?.disabled !== false) return;

    const typeFilter = event.type === "SPEEDING" ? { speedingEnabled: true } : { inactivityEnabled: true };
    const recipients = await transaction.authUser.findMany({
      where: {
        disabled: false,
        mustChangePassword: false,
        telegramConnection: { is: { status: TelegramConnectionStatus.CONNECTED, telegramUserId: { not: null }, telegramChatId: { not: null } } },
        notificationPreferences: { is: { enabled: true, ...typeFilter, OR: [
          { vehicleScope: NotificationVehicleScope.ALL },
          { vehicleScope: NotificationVehicleScope.SELECTED, vehicles: { some: { vehicleId: event.vehicleId } } },
        ] } },
        OR: [
          { role: AuthRole.ADMIN },
          { role: AuthRole.USER, permissions: { some: { key: "events.view" } }, AND: [{ permissions: { some: { key: "vehicles.view" } } }] },
        ],
        AND: [usersWithProductAccessToVehicleWhere(event.vehicleId)],
      },
      select: { id: true, telegramConnection: { select: { connectionRevision: true } } },
    });
    if (recipients.length === 0) return;
    await transaction.alertNotificationDelivery.createMany({
      data: recipients.map((recipient) => ({ notificationId: notification.id, userId: recipient.id, status: AlertNotificationDeliveryStatus.PENDING, connectionRevision: recipient.telegramConnection!.connectionRevision })),
      skipDuplicates: true,
    });
  }
}
