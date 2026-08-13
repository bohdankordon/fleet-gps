import assert from "node:assert/strict";
import test from "node:test";
import { forwardAuditReadToUpstream } from "./audit-bff-core";
import { auditResponseFixture } from "./audit-fixture";

function request(query = "", cookie = "preference=dark; taxi_session=session-secret; analytics=yes"): Request { return new Request(`http://app.test/api/admin/audit${query ? `?${query}` : ""}`, { headers: { Cookie: cookie, Authorization: "Bearer forbidden", "X-Private": "forbidden" } }); }

test("legitimate ADMIN GET forwards approved query and only taxi_session with no-store", async () => {
  let url = ""; let init: RequestInit | undefined;
  const response = await forwardAuditReadToUpstream(request("eventType=USER_DISABLED&actorType=USER"), "http://api.test", async (input, value) => { url = String(input); init = value; return Response.json(auditResponseFixture()); });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(url, "http://api.test/api/admin/audit?eventType=USER_DISABLED&actorType=USER");
  const headers = new Headers(init?.headers);
  assert.deepEqual([...headers.entries()], [["accept", "application/json"], ["cookie", "taxi_session=session-secret"]]);
  assert.equal(init?.method, "GET");
  assert.equal(init?.cache, "no-store");
});

test("preserves unauthenticated and USER authorization status safely", async () => {
  for (const status of [401, 403] as const) {
    const response = await forwardAuditReadToUpstream(request("", ""), "http://api.test", async () => Response.json({ stack: "private SQL" }, { status }));
    assert.equal(response.status, status);
    assert.equal((await response.text()).includes("private"), false);
  }
});

test("rejects unknown query before upstream and masks upstream/contract failures", async () => {
  let calls = 0;
  const rejected = await forwardAuditReadToUpstream(request("limit=50"), "http://api.test", async () => { calls += 1; return Response.json(auditResponseFixture()); });
  assert.equal(rejected.status, 400); assert.equal(calls, 0);
  const failure = await forwardAuditReadToUpstream(request(), "http://api.test", async () => Response.json({ stack: "private Prisma SQL secret" }, { status: 500 }));
  assert.equal(failure.status, 503); assert.equal((await failure.text()).includes("private"), false);
  const malformed = await forwardAuditReadToUpstream(request(), "http://api.test", async () => Response.json({ items: [{ details: { password: "secret" } }] }));
  assert.equal(malformed.status, 502); assert.equal((await malformed.text()).includes("secret"), false);
});
