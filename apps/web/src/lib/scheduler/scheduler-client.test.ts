import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("scheduler client keeps API_INTERNAL_BASE_URL server-only", () => {
  const source = readFileSync("src/lib/scheduler/scheduler-client.ts", "utf8");
  assert.equal(source.includes("import \"server-only\""), true);
  assert.equal(source.includes("NEXT_PUBLIC_API_INTERNAL_BASE_URL"), false);
});
