import assert from "node:assert/strict";
import test from "node:test";
import { VehicleDetailsBackendNotFoundError, VehicleDetailsBackendUnavailableError } from "../vehicle-details/vehicle-details-errors";
import { TripAnalysisBackendNotFoundError, TripAnalysisBackendUnavailableError } from "./trip-analysis-errors";
import { loadVehicleTripsPageState, type VehicleTripsPageDeps } from "./vehicle-trips-page-loader";
import { tripAnalysisFixture, TRIP_ANALYSIS_VEHICLE_ID } from "./trip-analysis-fixture";

const timezone = "Europe/Kyiv";
const range = { from: "2026-08-01T00:00:00.000Z", to: "2026-08-01T12:00:00.000Z" } as const;
const initialRange = { range: { ...range }, restoredFromUrl: false, openEnded: false } as const;
const details = {
  vehicle: { name: "Review Vehicle" },
  generatedAt: "2026-08-01T12:00:00.000Z",
} as never;
const EVENT_ID = "00000000-0000-4000-8000-000000000099";
const investigation = { eventId: EVENT_ID, type: "SPEEDING" as const, vehicleId: TRIP_ANALYSIS_VEHICLE_ID, confirmedAt: "2026-08-01T00:00:30.000Z", confirmationPosition: { latitude: 49.001, longitude: 28.001 }, confirmationSpeedKph: 72, thresholdKph: 60, zone: "CITY" as const };

function deps(overrides: Partial<VehicleTripsPageDeps> = {}): VehicleTripsPageDeps {
  return {
    fetchSettings: async () => ({ timezone }),
    resolveRange: () => ({ ...initialRange, range: { ...range } }),
    fetchDetails: async () => details,
    fetchAnalysis: async () => tripAnalysisFixture(),
    fetchEventInvestigation: async () => { throw new Error("unexpected event investigation"); },
    now: () => new Date("2026-08-01T12:00:00.000Z"),
    ...overrides,
  };
}

test("valid settings and range resolve ready with unchanged client props", async () => {
  const state = await loadVehicleTripsPageState(TRIP_ANALYSIS_VEHICLE_ID, {}, deps());
  assert.equal(state.kind, "ready");
  assert.deepEqual(state.kind === "ready" ? state.range : null, range);
  assert.equal(state.kind === "ready" ? state.restoredFromUrl : null, false);
  assert.equal(state.kind === "ready" ? state.openEnded : null, false);
  assert.equal(state.kind === "ready" ? state.initialError : null, false);
  assert.deepEqual(state.kind === "ready" ? state.initialData : null, tripAnalysisFixture());
  assert.equal(state.kind === "ready" ? state.timezone : null, timezone);
  assert.equal(state.kind === "ready" ? state.vehicleName : null, "Review Vehicle");
  assert.equal(state.kind === "ready" ? state.shellGeneratedAt : null, "2026-08-01T12:00:00.000Z");
  assert.equal(state.kind === "ready" ? state.eventFocus : "unexpected", null);
});

test("valid event context is vehicle-bound and resolves the exact containing trip", async () => {
  const state = await loadVehicleTripsPageState(TRIP_ANALYSIS_VEHICLE_ID, { event: EVENT_ID }, deps({ fetchEventInvestigation: async () => investigation }));
  assert.equal(state.kind, "ready");
  assert.deepEqual(state.kind === "ready" ? state.eventFocus : null, { kind: "AVAILABLE", event: investigation, trip: { kind: "MATCH", tripKey: "trip-0" } });
});

test("mismatched, inaccessible, and malformed event IDs never attach evidence to the route vehicle", async () => {
  const mismatch = await loadVehicleTripsPageState(TRIP_ANALYSIS_VEHICLE_ID, { event: EVENT_ID }, deps({ fetchEventInvestigation: async () => ({ ...investigation, vehicleId: "00000000-0000-4000-8000-000000000002" }) }));
  assert.deepEqual(mismatch.kind === "ready" ? mismatch.eventFocus : null, { kind: "UNAVAILABLE" });
  const denied = await loadVehicleTripsPageState(TRIP_ANALYSIS_VEHICLE_ID, { event: EVENT_ID }, deps({ fetchEventInvestigation: async () => { throw new Error("non-disclosing 404"); } }));
  assert.deepEqual(denied.kind === "ready" ? denied.eventFocus : null, { kind: "UNAVAILABLE" });
  let calls = 0;
  const malformed = await loadVehicleTripsPageState(TRIP_ANALYSIS_VEHICLE_ID, { event: "bad" }, deps({ fetchEventInvestigation: async () => { calls += 1; return investigation; } }));
  assert.equal(malformed.kind === "ready" ? malformed.eventFocus : "unexpected", null);
  assert.equal(calls, 0);
});

test("runtime 5xx and network rejection resolve context-unavailable with real identity", async () => {
  for (const fetchSettings of [
    async () => {
      throw new Error("upstream 500 sentinel");
    },
    async () => {
      throw new Error("network sentinel");
    },
  ]) {
    const state = await loadVehicleTripsPageState(TRIP_ANALYSIS_VEHICLE_ID, {}, deps({ fetchSettings }));
    assert.deepEqual(state, {
      kind: "context-unavailable",
      vehicleName: "Review Vehicle",
      generatedAt: "2026-08-01T12:00:00.000Z",
    });
    assert.equal(JSON.stringify(state).includes("sentinel"), false);
  }
});

test("malformed settings and unresolved range resolve context-unavailable without fabrication", async () => {
  const malformed = await loadVehicleTripsPageState(
    TRIP_ANALYSIS_VEHICLE_ID,
    {},
    deps({ fetchSettings: async () => ({ timezone: "" }) }),
  );
  assert.deepEqual(malformed, {
    kind: "context-unavailable",
    vehicleName: "Review Vehicle",
    generatedAt: "2026-08-01T12:00:00.000Z",
  });
  const unresolved = await loadVehicleTripsPageState(
    TRIP_ANALYSIS_VEHICLE_ID,
    {},
    deps({ resolveRange: () => null }),
  );
  assert.deepEqual(unresolved, {
    kind: "context-unavailable",
    vehicleName: "Review Vehicle",
    generatedAt: "2026-08-01T12:00:00.000Z",
  });
  assert.equal("timezone" in unresolved, false);
  assert.equal("range" in unresolved, false);
});

test("invalid timezone resolves context-unavailable", async () => {
  const { resolveInitialTripAnalysisRange } = await import("./trip-analysis-range");
  const state = await loadVehicleTripsPageState(
    TRIP_ANALYSIS_VEHICLE_ID,
    {},
    deps({ fetchSettings: async () => ({ timezone: "Mars/Olympus" }), resolveRange: resolveInitialTripAnalysisRange }),
  );
  assert.equal(state.kind === "context-unavailable" ? state.vehicleName : null, "Review Vehicle");
});

test("details non-404 failure keeps fallback identity instead of inventing a name", async () => {
  const state = await loadVehicleTripsPageState(
    TRIP_ANALYSIS_VEHICLE_ID,
    {},
    deps({
      fetchSettings: async () => {
        throw new Error("settings down");
      },
      fetchDetails: async () => {
        throw new VehicleDetailsBackendUnavailableError();
      },
    }),
  );
  assert.deepEqual(state, { kind: "context-unavailable", vehicleName: null, generatedAt: null });
});

test("details 404 with runtime failure takes not-found precedence", async () => {
  const state = await loadVehicleTripsPageState(
    TRIP_ANALYSIS_VEHICLE_ID,
    {},
    deps({
      fetchSettings: async () => {
        throw new Error("settings down");
      },
      fetchDetails: async () => {
        throw new VehicleDetailsBackendNotFoundError();
      },
    }),
  );
  assert.deepEqual(state, { kind: "not-found" });
});

test("invalid vehicle id resolves not-found before settings and details work", async () => {
  let calls = 0;
  const state = await loadVehicleTripsPageState(
    "not-a-uuid",
    {},
    deps({
      fetchSettings: async () => {
        calls += 1;
        return { timezone };
      },
      fetchDetails: async () => {
        calls += 1;
        return details;
      },
    }),
  );
  assert.deepEqual(state, { kind: "not-found" });
  assert.equal(calls, 0);
});

test("analysis 404 on valid context stays not-found", async () => {
  const state = await loadVehicleTripsPageState(
    TRIP_ANALYSIS_VEHICLE_ID,
    {},
    deps({
      fetchAnalysis: async () => {
        throw new TripAnalysisBackendNotFoundError();
      },
    }),
  );
  assert.deepEqual(state, { kind: "not-found" });
});

test("analysis non-404 failure stays ready with the existing error flag", async () => {
  const state = await loadVehicleTripsPageState(
    TRIP_ANALYSIS_VEHICLE_ID,
    {},
    deps({
      fetchAnalysis: async () => {
        throw new TripAnalysisBackendUnavailableError();
      },
    }),
  );
  assert.equal(state.kind, "ready");
  assert.equal(state.kind === "ready" ? state.initialError : null, true);
  assert.equal(state.kind === "ready" ? state.initialData : "present", null);
  assert.equal(state.kind === "ready" ? state.timezone : null, timezone);
});

test("zero observations stay ready with truthful empty data", async () => {
  const empty = {
    ...tripAnalysisFixture(),
    trips: [],
    stops: [],
    gaps: [],
    summary: { ...tripAnalysisFixture().summary, tripCount: 0, stopCount: 0, gapCount: 0, rawObservationCount: 0 },
  };
  const state = await loadVehicleTripsPageState(TRIP_ANALYSIS_VEHICLE_ID, {}, deps({ fetchAnalysis: async () => empty }));
  assert.equal(state.kind, "ready");
  assert.equal(state.kind === "ready" ? state.initialError : null, false);
  assert.deepEqual(state.kind === "ready" ? state.initialData : null, empty);
});
