import assert from "node:assert/strict";
import test from "node:test";
import { speedingTripLink } from "./speeding-trip-link";

const vehicleId = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";

test("speeding link reuses the bounded Events investigation range and contains confirmation", () => {
  const confirmedAt = new Date("2026-09-29T12:00:00.000Z");
  const url = new URL(speedingTripLink("https://fleet.example.test", vehicleId, eventId, confirmedAt, new Date("2026-09-29T12:15:00.000Z")));
  assert.equal(url.origin, "https://fleet.example.test");
  assert.equal(url.pathname, `/vehicles/${vehicleId}/trips`);
  assert.deepEqual([...url.searchParams.keys()], ["from", "to", "event"]);
  assert.equal(url.searchParams.get("from"), "2026-09-29T11:30:00.000Z");
  assert.equal(url.searchParams.get("to"), "2026-09-29T12:15:00.000Z");
  assert.equal(url.searchParams.get("event"), eventId);
  for (const forbidden of ["bot-token", "session-token", "telegram-chat-id", "fleet-user-id", "delivery-id", "provider-credential"]) assert.equal(url.toString().includes(forbidden), false);
  assert.equal(new URL(speedingTripLink(url.origin, vehicleId, eventId, confirmedAt, new Date("2026-09-29T16:00:00.000Z"))).searchParams.get("to"), "2026-09-29T13:30:00.000Z");
  assert.equal(new URL(speedingTripLink(url.origin, vehicleId, eventId, confirmedAt, new Date("2026-09-29T11:59:00.000Z"))).searchParams.get("to"), confirmedAt.toISOString());
});

test("speeding link rejects arbitrary origins and route identifiers", () => {
  const at = new Date("2026-09-29T12:00:00.000Z");
  for (const origin of ["http://fleet.example.test", "https://fleet.example.test/other", "https://user:secret@fleet.example.test", "https://fleet.example.test/?token=secret"]) assert.throws(() => speedingTripLink(origin, vehicleId, eventId, at, at));
  assert.throws(() => speedingTripLink("https://fleet.example.test", "../other", eventId, at, at));
});
