import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createLocalePreferenceDeleteHandler, createLocalePreferenceHandler, expiredLocaleCookie, localeCookie } from "./locale-preference";

function request(payload: unknown, headers: Record<string, string> = { Origin: "http://app.test", "Sec-Fetch-Site": "same-origin" }): Request {
  return new Request("http://app.test/api/preferences/locale", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

test("unauthenticated same-origin requests accept exactly ru, uk, and en", async () => {
  const handler = createLocalePreferenceHandler(false);
  for (const locale of ["ru", "uk", "en"] as const) {
    const response = await handler(request({ locale }));
    assert.equal(response.status, 204);
    assert.match(response.headers.get("set-cookie") ?? "", new RegExp(`^taxi_locale=${locale};`));
  }
});

test("the preference body is strict and invalid bodies fail before any side effect", async () => {
  const handler = createLocalePreferenceHandler(false);
  for (const payload of [{}, { locale: "pl" }, { locale: "en", extra: true }, [], null, 1, "en", { locale: ["en"] }]) assert.equal((await handler(request(payload))).status, 400);
  const malformed = new Request("http://app.test/api/preferences/locale", { method: "POST", headers: { Origin: "http://app.test", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" }, body: "{" });
  assert.equal((await handler(malformed)).status, 400);
});

test("centralized write protection rejects cross-site, same-site, and mismatched origins", async () => {
  const handler = createLocalePreferenceHandler(false);
  const deleteHandler = createLocalePreferenceDeleteHandler(false);
  for (const headers of [{ Origin: "http://app.test", "Sec-Fetch-Site": "cross-site" }, { Origin: "http://app.test", "Sec-Fetch-Site": "same-site" }, { Origin: "https://evil.test", "Sec-Fetch-Site": "same-origin" }]) {
    assert.equal((await handler(request({ locale: "en" }, headers))).status, 403);
    assert.equal((await deleteHandler(new Request("http://app.test/api/preferences/locale", { method: "DELETE", headers }))).status, 403);
  }
});

test("locale cookie attributes are private, root-scoped, lax, one-year, and environment-secure", () => {
  const development = localeCookie("uk", false);
  for (const expected of ["taxi_locale=uk", "Max-Age=31536000", "Path=/", "HttpOnly", "SameSite=Lax"]) assert.ok(development.includes(expected), expected);
  assert.equal(development.includes("Secure"), false);
  assert.ok(localeCookie("en", true).endsWith("; Secure"));
  assert.equal(expiredLocaleCookie(false), "taxi_locale=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
  assert.ok(expiredLocaleCookie(true).endsWith("; Secure"));
});

test("Automatic mode clears the explicit cookie without storing a fake locale", async () => {
  const response = await createLocalePreferenceDeleteHandler(false)(new Request("http://app.test/api/preferences/locale", { method: "DELETE", headers: { Origin: "http://app.test", "Sec-Fetch-Site": "same-origin" } }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), "taxi_locale=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
  assert.doesNotMatch(response.headers.get("set-cookie") ?? "", /taxi_locale=auto(?:matic)?/);
});

test("the Next-only route requires no session, Nest call, database, or audit write", () => {
  const handler = readFileSync("src/lib/preferences/locale-preference.ts", "utf8");
  const route = readFileSync("src/app/api/preferences/locale/route.ts", "utf8");
  const source = `${handler}\n${route}`;
  assert.match(source, /rejectCrossOriginWrite/);
  assert.doesNotMatch(source, /taxi_session|authenticatedApiFetch|API_INTERNAL_BASE_URL|prisma|AuditEvent|audit/i);
  assert.match(route, /export const POST/);
  assert.match(route, /export const DELETE/);
  assert.doesNotMatch(route, /export const GET|query|searchParams/);
});
