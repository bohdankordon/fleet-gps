import assert from "node:assert/strict";
import test from "node:test";
import { DateTime } from "luxon";
import { metersToKilometers } from "./equgps-distance.js";
import { createJsonHeaders, EqugpsClient } from "./equgps-client.js";
import { createSafeHttpDiagnostic, sanitizeServerMessage } from "./equgps-errors.js";
import { getCurrentKyivDay, getPreviousKyivDay } from "./equgps-periods.js";
import { reportSummarySchema } from "./equgps-summary-schemas.js";

test("converts zero meters to kilometers", () => {
  assert.equal(metersToKilometers(0), 0);
});

test("converts 500 meters to kilometers", () => {
  assert.equal(metersToKilometers(500), 0.5);
});

test("converts 1000 meters to kilometers", () => {
  assert.equal(metersToKilometers(1_000), 1);
});

test("converts fractional meters to kilometers", () => {
  assert.equal(metersToKilometers(123.45), 0.12345);
});

test("rejects a negative distance", () => {
  assert.throws(() => metersToKilometers(-1), RangeError);
});

test("rejects a negative summary distance", () => {
  assert.equal(reportSummarySchema.safeParse({ deviceId: 1, distance: -1 }).success, false);
});

test("sends multiple deviceId parameters in collectionFormat multi form", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: URL | undefined;
  globalThis.fetch = async (input) => {
    requestedUrl = new URL(typeof input === "string" ? input : input.toString());
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const client = new EqugpsClient({
      baseUrl: "https://example.invalid/api/",
      email: "test@example.invalid",
      password: "not-a-secret",
      timezone: "Europe/Kyiv",
      requestTimeoutMs: 1_000,
    });
    await client.getReportSummary({
      deviceIds: [1, 2],
      from: "2026-08-03T21:00:00Z",
      to: "2026-08-04T21:00:00Z",
    });

    assert.deepEqual(requestedUrl?.searchParams.getAll("deviceId"), ["1", "2"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sends exactly one deviceId plus from and to for a single-device summary", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: URL | undefined;
  globalThis.fetch = async (input) => {
    requestedUrl = new URL(typeof input === "string" ? input : input.toString());
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const client = new EqugpsClient({
      baseUrl: "https://example.invalid/api/",
      email: "test@example.invalid",
      password: "not-a-secret",
      timezone: "Europe/Kyiv",
      requestTimeoutMs: 1_000,
    });
    await client.getReportSummary({ deviceIds: [1], from: "2026-08-03T21:00:00Z", to: "2026-08-04T21:00:00Z" });

    assert.deepEqual(requestedUrl?.searchParams.getAll("deviceId"), ["1"]);
    assert.equal(requestedUrl?.searchParams.get("from"), "2026-08-03T21:00:00Z");
    assert.equal(requestedUrl?.searchParams.get("to"), "2026-08-04T21:00:00Z");
    assert.equal(requestedUrl?.searchParams.has("deviceId[]"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("current Kyiv day ends at now and API timestamps have no milliseconds", () => {
  const now = DateTime.fromISO("2026-07-15T12:34:56.789Z");
  const period = getCurrentKyivDay(now);

  assert.equal(period.from, "2026-07-14T21:00:00Z");
  assert.equal(period.to, "2026-07-15T12:34:56Z");
  assert.ok(DateTime.fromISO(period.to).toMillis() <= now.toMillis());
  assert.doesNotMatch(period.from, /\.\d+/);
  assert.doesNotMatch(period.to, /\.\d+/);
});

test("previous Kyiv day uses correct summer and winter UTC boundaries", () => {
  const summer = getPreviousKyivDay(DateTime.fromISO("2026-07-15T12:00:00Z"));
  const winter = getPreviousKyivDay(DateTime.fromISO("2026-01-15T12:00:00Z"));

  assert.deepEqual([summer.from, summer.to], ["2026-07-13T21:00:00Z", "2026-07-14T21:00:00Z"]);
  assert.deepEqual([winter.from, winter.to], ["2026-01-13T22:00:00Z", "2026-01-14T22:00:00Z"]);
});

test("sanitizes server messages without retaining query values or credentials", () => {
  const sanitized = sanitizeServerMessage(
    "Invalid from=2026-08-03T21:00:00Z deviceId=123 for user@example.com with Bearer abcdefghijklmnopqrstuvwxyz",
  );

  assert.doesNotMatch(sanitized, /2026-08-03|123|user@example\.com|abcdefghijklmnopqrstuvwxyz/);
  assert.match(sanitized, /from=\[redacted\]|\[redacted\]/);
});

test("extracts only safe fields from JSON and plain-text HTTP 400 diagnostics", () => {
  const jsonDiagnostic = createSafeHttpDiagnostic(
    400,
    "application/json",
    JSON.stringify({ message: "Invalid to=2026-08-04T21:00:00Z", parameter: "to", code: "INVALID_DATE" }),
  );
  const textDiagnostic = createSafeHttpDiagnostic(400, "text/plain", "Missing deviceId=42");

  assert.equal(jsonDiagnostic.parameter, "to");
  assert.doesNotMatch(jsonDiagnostic.message ?? "", /2026-08-04/);
  assert.equal(textDiagnostic.parameter, "deviceId");
  assert.doesNotMatch(textDiagnostic.message ?? "", /42/);
});

test("preserves only a Java exception type and safe stack frames", () => {
  const nullPointer = createSafeHttpDiagnostic(400, "application/json", "NullPointerException (Summary:42 < *:96 < ReportResource:147)");
  const sql = createSafeHttpDiagnostic(400, "text/plain", "SQLException: select * from secret where deviceId=42");
  const json = createSafeHttpDiagnostic(400, "application/json", JSON.stringify({
    message: "IllegalArgumentException (ReportResource:147)",
    details: "deviceId=42",
  }));
  const unknown = createSafeHttpDiagnostic(400, "text/plain", "Report unavailable");

  assert.equal(nullPointer.exceptionType, "NullPointerException");
  assert.deepEqual(nullPointer.stackFrames, ["Summary:42", "ReportResource:147"]);
  assert.equal(sql.exceptionType, "SQLException");
  assert.equal(sql.message, undefined);
  assert.equal(json.exceptionType, "IllegalArgumentException");
  assert.deepEqual(json.stackFrames, ["ReportResource:147"]);
  assert.equal(unknown.exceptionType, "unknown");
  assert.equal(unknown.message, "Report unavailable");
});

test("final JSON headers force Accept and omit Content-Type for GET", () => {
  const headers = createJsonHeaders(
    {
      baseUrl: "https://example.invalid/api/",
      email: "test@example.invalid",
      password: "not-a-secret",
      timezone: "Europe/Kyiv",
      requestTimeoutMs: 1_000,
    },
    { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Type": "application/json" },
  );

  assert.equal(headers.get("accept"), "application/json");
  assert.equal(headers.has("content-type"), false);
  assert.ok(headers.has("authorization"));
});
