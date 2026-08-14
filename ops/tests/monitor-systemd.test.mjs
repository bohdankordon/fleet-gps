import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const systemdDir = path.resolve(process.cwd(), "ops", "systemd");
const opsDir = path.resolve(process.cwd(), "ops");

function unit(name) {
  return readFileSync(path.join(systemdDir, name), "utf8");
}

function opsFile(name) {
  return readFileSync(path.join(opsDir, name), "utf8");
}

function parseUnitSections(text) {
  const sections = new Map();
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      current = header[1];
      if (!sections.has(current)) sections.set(current, []);
    } else if (current !== null && line !== "" && !line.startsWith("#") && !line.startsWith(";")) {
      sections.get(current).push(line);
    }
  }
  return sections;
}

function keyValues(sections, section, key) {
  return (sections.get(section) ?? []).filter((line) => line.startsWith(key + "=")).map((line) => line.slice(key.length + 1));
}

test("daily backup failure triggers the operational notify unit", () => {
  const sections = parseUnitSections(unit("taxi-gps-backup-daily.service"));
  assert.deepEqual(keyValues(sections, "Unit", "OnFailure"), ["taxi-gps-ops-notify@backup-daily.service"]);
  assert.deepEqual(keyValues(sections, "Service", "OnFailure"), []);
});

test("weekly backup failure triggers the operational notify unit", () => {
  const sections = parseUnitSections(unit("taxi-gps-backup-weekly.service"));
  assert.deepEqual(keyValues(sections, "Unit", "OnFailure"), ["taxi-gps-ops-notify@backup-weekly.service"]);
  assert.deepEqual(keyValues(sections, "Service", "OnFailure"), []);
});

test("monitor execution failure triggers a nonrecursive notify unit", () => {
  const service = unit("taxi-gps-monitor.service");
  const sections = parseUnitSections(service);
  assert.deepEqual(keyValues(sections, "Unit", "OnFailure"), ["taxi-gps-ops-notify@monitor.service"]);
  assert.deepEqual(keyValues(sections, "Service", "OnFailure"), []);
  assert.deepEqual(keyValues(sections, "Service", "Type"), ["oneshot"]);
  assert.deepEqual(keyValues(sections, "Service", "TimeoutStartSec"), ["45"]);
});

test("the notify template has no OnFailure and cannot recurse", () => {
  const template = unit("taxi-gps-ops-notify@.service");
  const sections = parseUnitSections(template);
  assert.deepEqual(keyValues(sections, "Unit", "OnFailure"), []);
  assert.deepEqual(keyValues(sections, "Service", "OnFailure"), []);
  assert.match(template, /notify-host\.sh %i \.env\.production/);
});

test("monitor timer runs approximately every 60 seconds", () => {
  assert.match(unit("taxi-gps-monitor.timer"), /OnUnitActiveSec=60s/);
  assert.match(unit("taxi-gps-monitor.timer"), /Unit=taxi-gps-monitor\.service/);
});

test("monitor overlap prevention uses a crash-released flock", () => {
  const wrapper = opsFile("monitor-host.sh");
  assert.match(wrapper, /flock -n/);
  assert.match(wrapper, /exec 9>/);
  assert.match(wrapper, /exit 0/);
});

test("the notifier and monitor keep credentials out of argv", () => {
  const notifyWrapper = opsFile("notify-host.sh");
  assert.match(notifyWrapper, /--env-file/);
  assert.match(notifyWrapper, /--kind/);
  assert.equal(notifyWrapper.includes("TELEGRAM_BOT_TOKEN"), false);
  const monitorWrapper = opsFile("monitor-host.sh");
  assert.equal(monitorWrapper.includes("TELEGRAM_BOT_TOKEN"), false);
});
