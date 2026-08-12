import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLogin } from "./login";
test("normalizes valid ASCII login case-insensitively", () => { assert.equal(normalizeLogin("Dispatch.Admin-1"), "dispatch.admin-1"); });
test("rejects short, long, whitespace, and Unicode-confusable logins", () => { assert.equal(normalizeLogin("ab"), null); assert.equal(normalizeLogin("a".repeat(65)), null); assert.equal(normalizeLogin(" user"), null); assert.equal(normalizeLogin("аdmin"), null); });
