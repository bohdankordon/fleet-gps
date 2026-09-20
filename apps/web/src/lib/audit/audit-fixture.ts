import { AUTH_PERMISSIONS } from "../auth/auth-contract";
import { parseAuditReadResponse, type AuditReadItem, type AuditReadResponse } from "./audit-contract";

const AT = "2026-08-11T02:00:00.000Z";
const TARGET = "00000000-0000-4000-8000-000000000002";
const RUN = "00000000-0000-4000-8000-000000000003";
const retention = { status: "AVAILABLE", canonicalAnchor: AT, policyCutoff: "2026-05-13T02:00:00.000Z", deletedCheckpoints: 1, deletedObservations: 2, moreCheckpointWork: true, moreObservationWork: true, stoppedByBudget: true };
const common = { createdAt: AT, actor: { type: "USER", login: "operator" } };
const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

export function auditItemsFixture(): readonly AuditReadItem[] {
  return parseAuditReadResponse({ items: [
    { ...common, id: id(11), eventType: "USER_CREATED", target: { type: "USER", id: TARGET }, details: { status: "AVAILABLE", targetLoginSnapshot: "target", role: "USER", permissions: ["fleet.view"] } },
    { ...common, id: id(10), eventType: "USER_ACCESS_CHANGED", target: { type: "USER", id: TARGET }, details: { status: "AVAILABLE", targetLoginSnapshot: "target", previousRole: "USER", role: "ADMIN", previousPermissions: ["fleet.view"], permissions: AUTH_PERMISSIONS } },
    { ...common, id: id(9), eventType: "USER_DISABLED", target: { type: "USER", id: TARGET }, details: { status: "AVAILABLE", targetLoginSnapshot: "target" } },
    { ...common, id: id(8), eventType: "USER_ENABLED", target: { type: "USER", id: TARGET }, details: { status: "AVAILABLE", targetLoginSnapshot: "target" } },
    { ...common, id: id(7), eventType: "USER_PASSWORD_RESET", target: { type: "USER", id: TARGET }, details: { status: "AVAILABLE", targetLoginSnapshot: "target" } },
    { ...common, id: id(6), eventType: "OWN_PASSWORD_CHANGED", target: { type: "USER", id: "00000000-0000-4000-8000-000000000001" }, details: { status: "AVAILABLE" } },
    { ...common, id: id(5), eventType: "SHORT_POPULATION_EXECUTED", target: { type: "POSITION_HISTORY", id: null }, details: { status: "AVAILABLE", to: AT, windowBudget: 24, excludeProviderDisabled: true, committedWindows: 6 } },
    { ...common, id: id(4), eventType: "DURABLE_POPULATION_CREATED", target: { type: "POSITION_HISTORY_POPULATION_RUN", id: RUN }, details: { status: "AVAILABLE", to: AT, windowBudget: 500, excludeProviderDisabled: false } },
    { ...common, id: id(3), eventType: "RETENTION_EXECUTED", target: { type: "POSITION_HISTORY_RETENTION", id: null }, details: retention },
    { id: id(2), createdAt: AT, eventType: "SYSTEM_POPULATION_CREATED", actor: { type: "SYSTEM" }, target: { type: "POSITION_HISTORY_POPULATION_RUN", id: RUN }, details: { status: "AVAILABLE", to: AT, windowBudget: 5000, excludeProviderDisabled: true } },
    { id: id(1), createdAt: AT, eventType: "AUTOMATIC_RETENTION_EXECUTED", actor: { type: "SYSTEM" }, target: { type: "POSITION_HISTORY_RETENTION", id: null }, details: retention },
    { ...common, id: id(12), eventType: "SETTINGS_UPDATED", target: { type: "APPLICATION_SETTINGS", id: "1" }, details: { status: "AVAILABLE", changes: [{ field: "timezone", previous: "Europe/Kyiv", next: "UTC" }] } },
    { ...common, id: id(13), eventType: "TELEGRAM_LINKED", target: { type: "USER", id: TARGET }, details: { status: "AVAILABLE" } },
    { ...common, id: id(14), eventType: "TELEGRAM_DISCONNECTED", target: { type: "USER", id: TARGET }, details: { status: "AVAILABLE" } },
    { ...common, id: id(15), eventType: "VEHICLE_GROUP_CREATED", target: { type: "VEHICLE_GROUP", id: TARGET }, details: { status: "AVAILABLE", name: "Taxi", color: "BLUE" } },
    { ...common, id: id(16), eventType: "VEHICLE_GROUP_RENAMED", target: { type: "VEHICLE_GROUP", id: TARGET }, details: { status: "AVAILABLE", previousName: "Taxi", name: "City Taxi" } },
    { ...common, id: id(17), eventType: "VEHICLE_GROUP_UPDATED", target: { type: "VEHICLE_GROUP", id: TARGET }, details: { status: "AVAILABLE", previousName: "City Taxi", name: "City Taxi", previousColor: "BLUE", color: "GREEN" } },
    { ...common, id: id(18), eventType: "VEHICLE_GROUP_MEMBERSHIP_CHANGED", target: { type: "VEHICLE_GROUP", id: TARGET }, details: { status: "AVAILABLE", name: "City Taxi", addedCount: 2, removedCount: 1 } },
    { ...common, id: id(19), eventType: "VEHICLE_GROUP_DELETED", target: { type: "VEHICLE_GROUP", id: TARGET }, details: { status: "AVAILABLE", name: "City Taxi", vehicleCount: 3, userGrantCount: 1 } },
    { ...common, id: id(20), eventType: "USER_VEHICLE_ACCESS_CHANGED", target: { type: "USER", id: TARGET }, details: { status: "AVAILABLE", targetLoginSnapshot: "target", previousMode: "ALL", mode: "SELECTED", previousGroupGrantCount: 0, groupGrantCount: 1, previousVehicleGrantCount: 0, vehicleGrantCount: 2, addedGroupGrantCount: 1, removedGroupGrantCount: 0, addedVehicleGrantCount: 2, removedVehicleGrantCount: 0 } },
  ], nextCursor: null, hasMore: false }).items;
}

export function auditResponseFixture(): AuditReadResponse { return { items: [...auditItemsFixture()], nextCursor: null, hasMore: false }; }
