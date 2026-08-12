import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_SESSION_LIFETIME_MS } from "./auth.constants";
import { clearedSessionCookie, createSessionToken, hashSessionToken, readSessionCookie, sessionCookie, sessionExpiresAt } from "./session";
test("creates random 32-byte-equivalent opaque tokens and stores deterministic SHA-256 hashes", () => { const first = createSessionToken(); const second = createSessionToken(); assert.notEqual(first, second); assert.ok(first.length >= 43); assert.equal(hashSessionToken(first).byteLength, 32); assert.notDeepEqual(hashSessionToken(first), Buffer.from(first)); });
test("uses exact seven-day absolute expiry", () => { const created = new Date("2026-08-12T00:00:00.000Z"); assert.equal(sessionExpiresAt(created).getTime() - created.getTime(), AUTH_SESSION_LIFETIME_MS); });
test("cookie is HttpOnly Lax path-root and Secure only in production", () => { const local = sessionCookie("token", false); assert.match(local, /HttpOnly/); assert.match(local, /SameSite=Lax/); assert.match(local, /Path=\//); assert.doesNotMatch(local, /Secure/); assert.match(sessionCookie("token", true), /Secure/); assert.match(clearedSessionCookie(false), /Max-Age=0/); assert.equal(readSessionCookie("unrelated=x; taxi_session=abc_def-12345678901234567890123456789012345"), "abc_def-12345678901234567890123456789012345"); });
