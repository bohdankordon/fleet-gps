import { Injectable } from "@nestjs/common";
import type { ClaimedAlertNotification } from "./alert-notification-outbox.types";

export type AlertConfirmedMessageSource =
  | Readonly<{ vehicleName: string; timezone: string; confirmedAt: Date; alertType: "SPEEDING"; speedZone: "CITY" | "OUTSIDE_CITY"; confirmationSpeedKph: number; speedThresholdKph: number }>
  | Readonly<{ vehicleName: string; timezone: string; confirmedAt: Date; alertType: "INACTIVITY"; confirmationTraveledDistanceMeters: number; distanceThresholdMeters: number; durationThresholdMinutes: number }>;

function vehicleDisplayName(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "Транспортний засіб";
}

function formatKyivTime(value: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(value);
  } catch {
    throw new AlertNotificationFormatterError();
  }
}

function number(value: number): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1 }).format(value);
}

export class AlertNotificationFormatterError extends Error {
  public constructor() {
    super("Alert notification could not be formatted");
    this.name = "AlertNotificationFormatterError";
  }
}

@Injectable()
export class AlertNotificationMessageFormatter {
  public formatAlertConfirmed(notification: AlertConfirmedMessageSource): string {
    const vehicle = vehicleDisplayName(notification.vehicleName);
    const confirmedAt = formatKyivTime(notification.confirmedAt, notification.timezone);
    if (notification.alertType === "SPEEDING") {
      const zone = notification.speedZone === "CITY" ? "місто (CITY)" : "поза містом (OUTSIDE_CITY)";
      return [
        "🚨 Перевищення швидкості",
        `Авто: ${vehicle}`,
        `Зона: ${zone}`,
        `Час підтвердження: ${confirmedAt}`,
        `Швидкість: ${number(notification.confirmationSpeedKph)} км/год`,
        `Поріг: ${number(notification.speedThresholdKph)} км/год`,
      ].join("\n");
    }
    return [
      "⚠️ Тривалий простій",
      `Авто: ${vehicle}`,
      `Тривалість: ${notification.durationThresholdMinutes} хв`,
      `Поріг відстані: ${number(notification.distanceThresholdMeters)} м`,
      `Зафіксована відстань: ${number(notification.confirmationTraveledDistanceMeters)} м`,
      `Час підтвердження: ${confirmedAt}`,
    ].join("\n");
  }
}

export const alertNotificationMessageFormatterInternals = Object.freeze({ vehicleDisplayName, formatKyivTime });
