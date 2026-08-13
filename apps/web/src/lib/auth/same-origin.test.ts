import assert from "node:assert/strict";
import test from "node:test";
import { isSameOriginWrite, rejectCrossOriginWrite } from "./same-origin";

function write(headers: Record<string, string> = {}, url = "http://app.test/api/auth/login"): Request {
  return new Request(url, { method: "POST", headers });
}

test("accepts the exact supported Chromium metadata despite Next's internal localhost URL reconstruction", () => {
  const request = write({ Origin: "http://127.0.0.1:3000", Host: "127.0.0.1:3000", "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty" }, "http://localhost:3000/api/auth/login");
  assert.equal(isSameOriginWrite(request), true);
  assert.equal(rejectCrossOriginWrite(request), null);
});

test("same-origin Fetch Metadata is accepted and independently covers omitted or null Origin", () => {
  assert.equal(isSameOriginWrite(write({ "Sec-Fetch-Site": "same-origin" })), true);
  assert.equal(isSameOriginWrite(write({ "Sec-Fetch-Site": "same-origin", Origin: "null" })), true);
});

test("cross-site, same-site, none, empty, and unknown Fetch Metadata never grant write access", () => {
  for (const fetchSite of ["cross-site", "same-site", "none", "", "unexpected"]) {
    const request = write({ "Sec-Fetch-Site": fetchSite, Origin: "http://app.test" });
    assert.equal(isSameOriginWrite(request), false);
    assert.equal(rejectCrossOriginWrite(request)?.status, 403);
  }
});

test("absent Fetch Metadata falls back to strict exact Origin matching", () => {
  assert.equal(isSameOriginWrite(write({ Origin: "http://app.test" })), true);
  assert.equal(isSameOriginWrite(write()), false);
  assert.equal(isSameOriginWrite(write({ Origin: "null" })), false);
  assert.equal(isSameOriginWrite(write({ Origin: "https://evil.test" })), false);
  assert.equal(isSameOriginWrite(write({ Origin: "not an origin" })), false);
});

test("contradictory same-origin Fetch Metadata does not override a mismatched explicit Origin", () => {
  assert.equal(isSameOriginWrite(write({ "Sec-Fetch-Site": "same-origin", Origin: "https://evil.test" })), false);
});
