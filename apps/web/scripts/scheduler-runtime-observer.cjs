"use strict";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const POLL_INTERVAL_MS = 15_000;
const OBSERVATION_TIMEOUT_MS = 390_000;
const REQUEST_TIMEOUT_MS = 10_000;
const FAILURE_CATEGORIES = new Set(["equgps", "database", "configuration", "unknown"]);

function safeErrorType(value) {
  return ["configuration", "scheduler", "dashboard", "timeout", "validation", "unknown"].includes(value)
    ? value
    : "unknown";
}

function isIsoTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function isNonnegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isJob(value) {
  return value !== null
    && typeof value === "object"
    && typeof value.running === "boolean"
    && (value.lastAttemptAt === null || isIsoTimestamp(value.lastAttemptAt))
    && (value.lastSuccessAt === null || isIsoTimestamp(value.lastSuccessAt))
    && (value.lastFailureAt === null || isIsoTimestamp(value.lastFailureAt))
    && (value.lastFailureCategory === null || FAILURE_CATEGORIES.has(value.lastFailureCategory))
    && isNonnegativeInteger(value.consecutiveFailures)
    && isNonnegativeInteger(value.successfulRuns)
    && isNonnegativeInteger(value.failedRuns)
    && isNonnegativeInteger(value.skippedOverlaps);
}

function parseSchedulerStatus(value) {
  if (value === null || typeof value !== "object"
    || typeof value.enabled !== "boolean"
    || (value.startedAt !== null && !isIsoTimestamp(value.startedAt))
    || !isPositiveInteger(value.fleetIntervalSeconds)
    || !isPositiveInteger(value.runsIntervalSeconds)
    || !isIsoTimestamp(value.generatedAt)
    || !isJob(value.fleet) || !isJob(value.runs)) {
    return null;
  }
  return value;
}

function parseDashboardResponse(value) {
  if (value === null || typeof value !== "object"
    || value.timezone !== "Europe/Kyiv"
    || !Array.isArray(value.vehicles)
    || value.vehicles.length !== 58
    || value.summary === null || typeof value.summary !== "object"
    || value.summary.total !== 58) {
    return null;
  }
  return { totalVehicles: value.summary.total };
}

function parseLocalBaseUrl(rawValue) {
  const raw = rawValue === undefined ? DEFAULT_BASE_URL : rawValue;
  const match = typeof raw === "string" && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::([1-9]\d{0,4}))?\/?$/.exec(raw);
  if (!match || (match[1] && Number(match[1]) > 65_535)) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "http:" || (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
  return url.origin;
}

function createRequest({ fetchImpl, baseUrl, timeoutMs = REQUEST_TIMEOUT_MS, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout, onActiveController, isCancelled = () => false }) {
  return async (path, parseJson = true) => {
    const controller = new AbortController();
    let timedOut = false;
    const classifyAbort = () => (timedOut ? "timeout" : (isCancelled() ? "cancelled" : "unknown"));
    onActiveController(controller);
    const timeout = setTimeoutFn(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, { signal: controller.signal });
      if (!parseJson) return { status: response.status };
      let body;
      try { body = await response.json(); } catch { return { errorType: classifyAbort() === "unknown" ? "validation" : classifyAbort() }; }
      return { status: response.status, body };
    } catch { return { errorType: classifyAbort() }; }
    finally { clearTimeoutFn(timeout); onActiveController(null); }
  };
}

function requestErrorType(result, fallback) {
  if (result.errorType === "timeout" || result.errorType === "validation") return result.errorType;
  if (result.errorType === "cancelled") return "unknown";
  return fallback;
}

function validateInitialStatus(status) {
  if (!status.enabled) return "configuration";
  if (status.startedAt === null) return "scheduler";
  if (status.fleetIntervalSeconds !== 60 || status.runsIntervalSeconds !== 300) return "configuration";
  return null;
}

function evaluateObservation(initial, current) {
  if (!current.enabled) return { state: "failure", errorType: "scheduler" };
  if (current.startedAt === null || current.startedAt !== initial.startedAt) return { state: "failure", errorType: "scheduler" };
  for (const job of ["fleet", "runs"]) {
    if (current[job].failedRuns > initial[job].failedRuns
      || current[job].consecutiveFailures > 0
      || current[job].lastFailureAt !== initial[job].lastFailureAt) {
      return { state: "failure", errorType: "scheduler" };
    }
  }
  const advanced = current.fleet.successfulRuns >= initial.fleet.successfulRuns + 1
    && current.runs.successfulRuns >= initial.runs.successfulRuns + 1;
  if (advanced && !current.fleet.running && !current.runs.running) return { state: "success" };
  return { state: "pending" };
}

function printSuccess(values) {
  const lines = [
    ["page status", values.pageStatus], ["initial scheduler status", values.schedulerStatus],
    ["scheduler enabled", values.initial.enabled], ["scheduler started", values.initial.startedAt !== null],
    ["fleet interval seconds", values.initial.fleetIntervalSeconds], ["runs interval seconds", values.initial.runsIntervalSeconds],
    ["initial fleet successful runs", values.initial.fleet.successfulRuns], ["final fleet successful runs", values.final.fleet.successfulRuns],
    ["initial runs successful runs", values.initial.runs.successfulRuns], ["final runs successful runs", values.final.runs.successfulRuns],
    ["fleet failed runs", values.final.fleet.failedRuns], ["runs failed runs", values.final.runs.failedRuns],
    ["fleet skipped overlaps", values.final.fleet.skippedOverlaps], ["runs skipped overlaps", values.final.runs.skippedOverlaps],
    ["initial dashboard status", values.initialDashboardStatus], ["final dashboard status", values.finalDashboardStatus],
    ["total vehicles", values.totalVehicles], ["observation successful", true],
  ];
  for (const [label, value] of lines) process.stdout.write(`${label}: ${value}\n`);
}

async function runObserver(deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const baseUrl = parseLocalBaseUrl(process.env.LOCAL_WEB_BASE_URL);
  if (!baseUrl) return { ok: false, errorType: "configuration" };
  let pendingTimeout = null;
  let activeController = null;
  let stopped = false;
  const cleanup = () => {
    stopped = true;
    if (pendingTimeout !== null) { clearTimeout(pendingTimeout); pendingTimeout = null; }
    if (activeController) activeController.abort();
  };
  if (deps.onCleanup) deps.onCleanup(cleanup);
  const request = createRequest({
    fetchImpl, baseUrl,
    onActiveController: (controller) => { activeController = controller; },
    isCancelled: () => stopped,
  });
  const page = await request("/", false);
  if (page.errorType || page.status !== 200) { cleanup(); return { ok: false, errorType: requestErrorType(page, "dashboard") }; }
  const scheduler = await request("/api/system/sync-status");
  if (scheduler.errorType || scheduler.status !== 200) { cleanup(); return { ok: false, errorType: requestErrorType(scheduler, "unknown") }; }
  const initial = parseSchedulerStatus(scheduler.body);
  if (!initial) { cleanup(); return { ok: false, errorType: "validation" }; }
  const initialError = validateInitialStatus(initial);
  if (initialError) { cleanup(); return { ok: false, errorType: initialError }; }
  const dashboard = await request("/api/dashboard/vehicles");
  const initialDashboard = !dashboard.errorType && dashboard.status === 200 ? parseDashboardResponse(dashboard.body) : null;
  if (!initialDashboard) { cleanup(); return { ok: false, errorType: requestErrorType(dashboard, "dashboard") }; }
  const deadline = Date.now() + OBSERVATION_TIMEOUT_MS;
  return await new Promise((resolve) => {
    const poll = async () => {
      if (stopped) return resolve({ ok: false, errorType: "unknown" });
      if (Date.now() >= deadline) { cleanup(); return resolve({ ok: false, errorType: "timeout" }); }
      const result = await request("/api/system/sync-status");
      if (result.errorType || result.status !== 200) { cleanup(); return resolve({ ok: false, errorType: requestErrorType(result, "unknown") }); }
      const current = parseSchedulerStatus(result.body);
      if (!current) { cleanup(); return resolve({ ok: false, errorType: "validation" }); }
      const dashboardCheck = await request("/api/dashboard/vehicles");
      const checkedDashboard = !dashboardCheck.errorType && dashboardCheck.status === 200
        ? parseDashboardResponse(dashboardCheck.body)
        : null;
      if (!checkedDashboard) {
        cleanup();
        return resolve({ ok: false, errorType: requestErrorType(dashboardCheck, "dashboard") });
      }
      const outcome = evaluateObservation(initial, current);
      if (outcome.state === "failure") { cleanup(); return resolve({ ok: false, errorType: outcome.errorType }); }
      if (outcome.state === "success") {
        const finalDashboardRequest = await request("/api/dashboard/vehicles");
        const finalDashboard = !finalDashboardRequest.errorType && finalDashboardRequest.status === 200 ? parseDashboardResponse(finalDashboardRequest.body) : null;
        cleanup();
        if (!finalDashboard) return resolve({ ok: false, errorType: requestErrorType(finalDashboardRequest, "dashboard") });
        return resolve({ ok: true, values: { pageStatus: page.status, schedulerStatus: scheduler.status, initial, final: current, initialDashboardStatus: dashboard.status, finalDashboardStatus: finalDashboardRequest.status, totalVehicles: finalDashboard.totalVehicles } });
      }
      pendingTimeout = setTimeout(poll, POLL_INTERVAL_MS);
    };
    pendingTimeout = setTimeout(poll, POLL_INTERVAL_MS);
  });
}

if (require.main === module) {
  let cleanup = () => {};
  const onSignal = () => { cleanup(); process.exitCode = 1; };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  runObserver({ onCleanup: (value) => { cleanup = value; } }).then((result) => {
    if (result.ok) printSuccess(result.values);
    else process.stdout.write(`errorType: ${safeErrorType(result.errorType)}\n`);
    process.exitCode = result.ok ? 0 : 1;
  }).catch(() => { process.stdout.write("errorType: unknown\n"); process.exitCode = 1; });
}

module.exports = { DEFAULT_BASE_URL, parseLocalBaseUrl, parseSchedulerStatus, parseDashboardResponse, evaluateObservation, safeErrorType, isIsoTimestamp, createRequest };
