import assert from "node:assert/strict";
import test from "node:test";
import { loadReportPage } from "./fleet-activity-report-page-loader";
import { fleetActivityReportFixture } from "./fleet-activity-report-fixture";
const now = new Date("2026-09-07T12:00:00Z");
const report = async (range: { from: string; to: string }) => ({ ...fleetActivityReportFixture(), ...range });
test("page resolves selected calendar date and safely distinguishes report and runtime failure", async () => {
  const deps = { runtime: async () => ({ timezone: "Europe/Kyiv" }), report };
  assert.equal((await loadReportPage({ date: "2026-08-21" }, now, deps)).initialDate, "2026-08-21");
  assert.equal((await loadReportPage({ date: "bad" }, now, deps)).initialDate, "2026-09-07");
  const runtime = await loadReportPage({}, now, { ...deps, runtime: async () => { throw Error("config"); } });
  assert.equal(runtime.initialError, "context"); assert.equal(runtime.initialData, null);
  const failed = await loadReportPage({ date: "2026-08-21" }, now, { ...deps, report: async () => { throw Error("secret"); } });
  assert.equal(failed.initialError, "report"); assert.equal(failed.initialDate, "2026-08-21");
});
test("timezone change during generation re-resolves once; repeated changes fail safely", async () => {
  let calls = 0;
  const stable = await loadReportPage({}, now, { runtime: async () => ({ timezone: "UTC" }), report: async (range) => { calls++; return report(range); } });
  assert.equal(calls, 2); assert.equal(stable.timezone, "Europe/Kyiv");
  calls = 0;
  const unstable = await loadReportPage({}, now, { runtime: async () => ({ timezone: "UTC" }), report: async (range) => ({ ...await report(range), timezone: ++calls === 1 ? "Europe/Kyiv" : "UTC" }) });
  assert.equal(unstable.initialError, "context"); assert.equal(unstable.initialData, null);
});
test("midnight page accepts a zero interval and returned mismatched range fails safely", async () => {
  const props = await loadReportPage({}, new Date("2026-09-06T21:00:00Z"), { runtime: async () => ({ timezone: "Europe/Kyiv" }), report });
  assert.equal(props.initialError, null); assert.equal(props.initialRange!.from, props.initialRange!.to);
  assert.equal((await loadReportPage({}, now, { runtime: async () => ({ timezone: "Europe/Kyiv" }), report: async () => fleetActivityReportFixture() })).initialError, "report");
});
