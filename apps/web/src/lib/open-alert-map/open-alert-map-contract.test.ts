import assert from "node:assert/strict";
import test from "node:test";
import { OpenAlertMapContractError, parseOpenAlertMapResponse } from "./open-alert-map-contract";

const vehicleId = "00000000-0000-4000-8000-000000000001";
const alert = (type: "SPEEDING" | "INACTIVITY", openedAt = "2026-08-10T11:00:00.000Z") => ({ type, openedAt });
const response = (alerts: ReturnType<typeof alert>[]) => ({
  generatedAt: "2026-08-10T12:00:00.000Z",
  summary: { totalOpenAlerts: alerts.length, vehiclesWithOpenAlerts: alerts.length === 0 ? 0 : 1, speeding: alerts.filter((item) => item.type === "SPEEDING").length, inactivity: alerts.filter((item) => item.type === "INACTIVITY").length },
  vehicles: alerts.length === 0 ? [] : [{ vehicle: { id: vehicleId, name: "Taxi", group: null }, alerts }],
});

test("accepts empty, SPEEDING, INACTIVITY, and both OPEN types for one vehicle", () => {
  assert.equal(parseOpenAlertMapResponse(response([])).vehicles.length, 0);
  assert.equal(parseOpenAlertMapResponse(response([alert("SPEEDING")])).summary.speeding, 1);
  assert.equal(parseOpenAlertMapResponse(response([alert("INACTIVITY")])).summary.inactivity, 1);
  assert.deepEqual(parseOpenAlertMapResponse(response([alert("SPEEDING"), alert("INACTIVITY")])).vehicles[0]?.alerts.map((item) => item.type), ["SPEEDING", "INACTIVITY"]);
});

test("rejects invalid type, timestamp, summary, duplicate vehicle/type, and unexpected fields", () => {
  const speeding = response([alert("SPEEDING")]);
  const invalid = [
    { ...speeding, generatedAt: "bad" },
    { ...speeding, vehicles: [{ ...speeding.vehicles[0], alerts: [{ type: "OFFLINE", openedAt: "2026-08-10T11:00:00.000Z" }] }] },
    { ...speeding, vehicles: [{ ...speeding.vehicles[0], alerts: [alert("SPEEDING", "bad")] }] },
    { ...speeding, summary: { ...speeding.summary, totalOpenAlerts: 2 } },
    { ...speeding, vehicles: [speeding.vehicles[0], speeding.vehicles[0]] },
    { ...speeding, summary: { totalOpenAlerts: 2, vehiclesWithOpenAlerts: 1, speeding: 2, inactivity: 0 }, vehicles: [{ ...speeding.vehicles[0], alerts: [alert("SPEEDING"), alert("SPEEDING")] }] },
    { ...speeding, activeKey: "secret" },
    { ...speeding, vehicles: [{ ...speeding.vehicles[0], currentState: { latitude: 49 } }] },
    { ...speeding, vehicles: [{ ...speeding.vehicles[0], alerts: [{ ...alert("SPEEDING"), eventId: vehicleId }] }] },
  ];
  for (const value of invalid) assert.throws(() => parseOpenAlertMapResponse(value), OpenAlertMapContractError);
});
