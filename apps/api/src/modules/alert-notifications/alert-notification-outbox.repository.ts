import { Injectable } from "@nestjs/common";
import { AlertNotificationStatus, Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database";
import type { PendingAlertNotification } from "./alert-notification-outbox.types";

export const MAX_PENDING_ALERT_NOTIFICATIONS = 100;

const pendingSelect = {
  id: true,
  alertEventId: true,
  kind: true,
  status: true,
  createdAt: true,
  attemptCount: true,
} satisfies Prisma.AlertNotificationOutboxSelect;

function validateLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PENDING_ALERT_NOTIFICATIONS) {
    throw new RangeError(`Alert notification pending limit must be an integer from 1 to ${MAX_PENDING_ALERT_NOTIFICATIONS}`);
  }
  return limit;
}

@Injectable()
export class AlertNotificationOutboxRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async findPending(limit: number): Promise<readonly PendingAlertNotification[]> {
    const rows = await this.database.getClient().alertNotificationOutbox.findMany({
      where: { status: AlertNotificationStatus.PENDING },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: validateLimit(limit),
      select: pendingSelect,
    });
    return Object.freeze(rows.map((row) => Object.freeze({ ...row, status: "PENDING" as const })));
  }
}
