"use strict";
// Loopback-only, read-only report integration. Login creates a local auth session.
// No DB client, provider, Telegram, fixture population or domain mutation.
const assert = require("node:assert/strict");
const { DateTime } = require("luxon");
const { localBase } = require("./events-workspace-smoke.cjs");
async function main() {
  const api = localBase(process.env.REPORTS_SMOKE_API_URL, "http://127.0.0.1:3000");
  const web = localBase(process.env.REPORTS_SMOKE_WEB_URL, "http://127.0.0.1:3001");
  const date = process.env.REPORTS_SMOKE_DATE || "2026-08-21";
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  const login = process.env.REPORTS_SMOKE_LOGIN; const password = process.env.REPORTS_SMOKE_PASSWORD;
  if (!login || !password) throw Error("Set REPORTS_SMOKE_LOGIN and REPORTS_SMOKE_PASSWORD for the local demo account");
  const signedIn = await fetch(api + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login, password }), redirect: "error" });
  assert.ok(signedIn.ok, "local login");
  const cookie = signedIn.headers.get("set-cookie")?.split(";", 1)[0]; assert.ok(cookie);
  const get = (base, path, authenticated = true, locale = "uk") => fetch(base + path, { headers: authenticated ? { Cookie: cookie + "; taxi_locale=" + locale } : {}, redirect: "error" });
  const json = async (base, path) => { const response = await get(base, path); assert.equal(response.status, 200, path); return response.json(); };
  const runtime = await json(api, "/api/settings/runtime");
  const start = DateTime.fromISO(date, { zone: runtime.timezone }).startOf("day");
  assert.ok(start.isValid);
  const from = start.toUTC().toISO(); const to = start.plus({ days: 1 }).toUTC().toISO();
  const path = "/api/reports/fleet-activity?" + new URLSearchParams({ from, to });
  const checks = [];
  let populated;
  for (const base of [api, web]) {
    assert.equal((await get(base, path, false)).status, 401); checks.push("unauthenticated report denied");
    const report = await json(base, path);
    assert.equal(report.from, from); assert.equal(report.to, to); assert.equal(report.timezone, runtime.timezone);
    assert.ok(Number.isFinite(Date.parse(report.generatedAt)));
    assert.deepEqual(Object.keys(report.policy).sort(), ["tripDataGapSeconds", "tripMovementConfirmationSeconds", "tripMovementSpeedKph", "tripStopConfirmationSeconds"]);
    assert.ok(report.summary.vehiclesWithGps > 0, "chosen local date must be populated");
    assert.equal(report.vehicles.length, report.summary.vehicleCount);
    assert.equal(report.summary.totalGapDurationSeconds, report.vehicles.reduce((n, row) => n + row.gapDurationSeconds, 0));
    for (const row of report.vehicles) {
      assert.equal("externalDeviceId" in row, false);
      assert.equal(row.hasGpsData, row.rawObservationCount > 0);
      if (row.hasGpsData) assert.ok(Date.parse(row.firstObservationAt) >= Date.parse(from) && Date.parse(row.lastObservationAt) < Date.parse(to));
      else { assert.equal(row.firstObservationAt, null); assert.equal(row.lastObservationAt, null); }
    }
    checks.push("populated context, half-open bounds, policy and gap totals");
    const empty = await json(base, "/api/reports/fleet-activity?" + new URLSearchParams({ from, to: from }));
    assert.equal(empty.vehicles.length, report.vehicles.length);
    assert.equal(empty.summary.vehiclesWithGps, 0);
    assert.ok(empty.vehicles.every((row) => !row.hasGpsData && row.rawObservationCount === 0 && row.tripCount === 0 && row.stopCount === 0 && row.gapCount === 0));
    checks.push("zero length preserves fleet identities with no derived activity");
    for (const end of [start.minus({ seconds: 1 }).toUTC().toISO(), start.plus({ hours: 25, seconds: 1 }).toUTC().toISO()]) assert.equal((await get(base, "/api/reports/fleet-activity?" + new URLSearchParams({ from, to: end }))).status, 400);
    checks.push("reversed and overlong ranges denied");
    populated = report;
  }
  for (const locale of ["uk", "ru", "en"]) {
    const response = await get(web, "/reports?date=" + date, true, locale);
    assert.equal(response.status, 200);
    const html = await response.text();
    for (const marker of ["reports-workspace", "reports-summary", "reports-list", date, populated.vehicles[0].vehicleId]) assert.ok(html.includes(marker), marker);
    assert.ok(!/reports-export|reports-chart|recharts|echarts/i.test(html));
    checks.push("authenticated daily Reports SSR " + locale);
  }
  console.log(JSON.stringify({ passed: checks.length, checks, date, summary: populated.summary, providerCalls: 0, telegramCalls: 0, domainWrites: 0, productionActions: 0 }, null, 2));
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { localBase };
