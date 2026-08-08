import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("alert-events client keeps API_INTERNAL_BASE_URL server-only and proxies only validated query fields", () => {
  const source = readFileSync("src/lib/alert-events/alert-events-client.ts", "utf8");
  assert.equal(source.includes("import \"server-only\""), true);
  assert.equal(source.includes("NEXT_PUBLIC_API_INTERNAL_BASE_URL"), false);
  assert.equal(source.includes("serializeAlertEventsRequestQuery"), true);
  assert.equal(source.includes("parseAlertEventsListResponse"), true);
  assert.equal(source.includes("parseAlertEventsSummaryResponse"), true);
});
