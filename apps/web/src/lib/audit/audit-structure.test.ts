import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Stage 20C remains one read-only BFF/page with no permission, mutation, export, retention, or live subscription", () => {
  const route = readFileSync("src/app/api/admin/audit/route.ts", "utf8");
  const page = readFileSync("src/app/admin/audit/page.tsx", "utf8");
  const viewer = readFileSync("src/components/audit-viewer.tsx", "utf8");
  assert.match(route, /export function GET/);
  assert.doesNotMatch(route, /export function (?:POST|PUT|PATCH|DELETE)/);
  assert.match(page, /user\.role !== "ADMIN"/);
  assert.doesNotMatch(`${route}${page}${viewer}`, /audit\.view|WebSocket|EventSource|setInterval|polling|method: "POST"|>Экспорт<|download|CSV|audit-retention/i);
  assert.doesNotMatch(viewer, /<table|<Drawer|JSON\.stringify|fetch\([^)]*audit.*selected/i);
  for (const expected of ["<ol", "audit-desktop-inspector", "audit-inline-detail", "audit-mobile-detail", "history.pushState", "popstate", "aria-pressed", "aria-expanded"]) assert.match(viewer, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), expected);
  const styles = readFileSync("src/styles/admin-audit.css", "utf8");
  for (const width of ["1199px", "991px", "767px", "480px"]) assert.match(styles, new RegExp(width.replace(".", "\\.")));
  assert.doesNotMatch(styles, /overflow-x\s*:\s*auto|min-width\s*:\s*1180px/);
});
