"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { buildPlan, makeTimeline, parseMode, VEHICLES } = require("./dev-vehicle-detail-fixtures.cjs");

const settings = Object.freeze({ timezone: "Europe/Kyiv", citySpeedLimitKph: 50, speedToleranceKph: 10, inactivityDistanceMeters: 300, inactivityDurationMinutes: 60, tripMovementSpeedKph: 5, tripDataGapSeconds: 300 });
test("requires one explicit fixture intent", () => {
  for (const input of [[], ["--apply", "--clean"], ["--execute"]]) assert.throws(() => parseMode(input), /Usage/);
  assert.equal(parseMode(["--plan"]), "plan"); assert.equal(parseMode(["--apply"]), "apply"); assert.equal(parseMode(["--clean"]), "clean");
});
test("generates a bounded coherent timeline with real analyzer evidence", () => {
  const timeline = makeTimeline(new Date("2026-09-01T12:00:30.000Z"));
  assert.equal(timeline.observations.length, 192);
  assert.ok(timeline.observations.every((point, index) => index === 0 || point.observedAt > timeline.observations[index - 1].observedAt));
  const gaps = timeline.observations.slice(1).filter((point, index) => point.observedAt - timeline.observations[index].observedAt > 300_000);
  assert.ok(gaps.length >= 3); assert.ok(timeline.observations.some((point) => point.valid === false)); assert.ok(timeline.observations.some((point) => point.outdated === true));
});
test("keeps fixed synthetic identities and valid alert/stat plan", () => {
  const plan = buildPlan(new Date("2026-09-01T12:00:30.000Z"), settings);
  assert.equal(VEHICLES.length, 4); assert.equal(plan.activeCount, 2); assert.equal(plan.resolvedCount, 4); assert.ok(plan.distance > 0); assert.ok(plan.movementSeconds > 0);
  assert.equal(plan.events.filter((event) => event.status === "OPEN" && event.type === "SPEEDING").length, 1);
  assert.equal(plan.events.filter((event) => event.status === "OPEN" && event.type === "INACTIVITY").length, 1);
});
