import { createHash } from "node:crypto";
import type { AlertEventType } from "./alert-events.types";

function digest(parts: readonly string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(String(part.length));
    hash.update(":");
    hash.update(part);
    hash.update(";");
  }
  return hash.digest("hex");
}

export function createAlertEventDedupeKey(type: AlertEventType, vehicleId: string, observedAt: Date): string {
  return digest(["alert-event-confirmation-v1", type, vehicleId, observedAt.toISOString()]);
}

export function createAlertEventActiveKey(type: AlertEventType, vehicleId: string): string {
  return digest(["alert-event-active-v1", type, vehicleId]);
}

