import assert from "node:assert/strict";
import test from "node:test";
import { COMMON_PASSWORD_BLOCKLIST } from "./password-blocklist";
import { canonicalBlocklistIdentity, trimBlocklistWhitespace } from "./password-canonical";
import { hashPassword, verifyPassword } from "./password";
import { canonicalPassword, isContextuallyPredictable, PasswordPolicyError, PasswordPolicyReason, passwordCodePointLength, validateUserSelectedPassword } from "./password-policy";

function reason(password: string, login = "operator", currentPassword?: string): PasswordPolicyReason | null {
  try { validateUserSelectedPassword(password, login, currentPassword); return null; }
  catch (error) { assert.ok(error instanceof PasswordPolicyError); return error.reason; }
}

test("raw length is 12-128 Unicode code points, including astral characters and outer spaces", () => {
  assert.equal(reason("🔐".repeat(11)), PasswordPolicyReason.LENGTH);
  assert.equal(reason("🔐".repeat(12)), null);
  assert.equal(reason("🧭".repeat(128)), null);
  assert.equal(reason("🧭".repeat(129)), PasswordPolicyReason.LENGTH);
  assert.equal(passwordCodePointLength("a😀b"), 3);
  assert.equal(passwordCodePointLength(" ".repeat(12)), 12);
  assert.equal(reason(" ".repeat(11)), PasswordPolicyReason.LENGTH);
  assert.equal(reason(" ".repeat(12)), PasswordPolicyReason.COMMON_OR_PREDICTABLE);
  assert.equal(reason("\u0085".repeat(11)), PasswordPolicyReason.LENGTH);
});

test("common lookup rejects exact, case, NFKC-equivalent, and outer-space-padded forms", () => {
  assert.equal(COMMON_PASSWORD_BLOCKLIST.hasIdentity("password1234"), true);
  assert.equal(reason("password1234"), PasswordPolicyReason.COMMON_OR_PREDICTABLE);
  assert.equal(reason("Password1234"), PasswordPolicyReason.COMMON_OR_PREDICTABLE);
  assert.equal(canonicalPassword("ＰＡＳＳＷＯＲＤ１２３４"), "password1234");
  assert.equal(reason("ＰＡＳＳＷＯＲＤ１２３４"), PasswordPolicyReason.COMMON_OR_PREDICTABLE);
  assert.equal(reason("    password    "), PasswordPolicyReason.COMMON_OR_PREDICTABLE);
  assert.equal(reason("  password1234  "), PasswordPolicyReason.COMMON_OR_PREDICTABLE);
  assert.equal(reason("\u0085password1234\u0085"), PasswordPolicyReason.COMMON_OR_PREDICTABLE);
  assert.equal(reason("\u0085  password1234  \u0085"), PasswordPolicyReason.COMMON_OR_PREDICTABLE);
  assert.equal("\u0085password1234\u0085".trim(), "\u0085password1234\u0085");
  assert.equal(trimBlocklistWhitespace(canonicalPassword("\u0085password1234\u0085")), "password1234");
  assert.equal(canonicalBlocklistIdentity("  PASSWORD1234  "), "password1234");
  assert.equal(trimBlocklistWhitespace("  violet otters navigate lunar harbors  "), "violet otters navigate lunar harbors");
  assert.equal(reason("violet otters navigate lunar harbors"), null);
  assert.equal(reason("  violet otters navigate lunar harbors  "), null);
});

test("whitespace-only passwords are rejected as predictable without composition rules", () => {
  assert.equal(reason(" ".repeat(12)), PasswordPolicyReason.COMMON_OR_PREDICTABLE);
  assert.equal(reason("\u0085".repeat(12)), PasswordPolicyReason.COMMON_OR_PREDICTABLE);
  assert.equal(reason(" \u0085 \u0085      \u0085 "), PasswordPolicyReason.COMMON_OR_PREDICTABLE);
  assert.equal(trimBlocklistWhitespace(canonicalPassword(" ".repeat(12))), "");
  assert.equal(trimBlocklistWhitespace(canonicalPassword("\u0085".repeat(12))), "");
  assert.equal(reason("violet otters navigate lunar harbors"), null);
  assert.equal(reason("  violet otters navigate lunar harbors  "), null);
  assert.equal(reason("violet  otters   navigate lunar harbors"), null);
});

test("exact raw password is preserved for hashing and validation does not mutate input", async () => {
  const candidate = "  violet otters navigate lunar harbors  ";
  const snapshot = candidate;
  assert.equal(reason(candidate), null);
  assert.equal(candidate, snapshot);
  const material = await hashPassword(candidate);
  assert.equal(await verifyPassword(candidate, material), true);
  assert.equal(await verifyPassword(candidate.trim(), material), false);
  assert.equal(await verifyPassword(trimBlocklistWhitespace(canonicalPassword(candidate)), material), false);
  const nelCandidate = "\u0085\u0085violet otters navigate lunar harbors\u0085\u0085";
  const nelSnapshot = nelCandidate;
  assert.equal(reason(nelCandidate), null);
  assert.equal(nelCandidate, nelSnapshot);
  const nelMaterial = await hashPassword(nelCandidate);
  assert.equal(await verifyPassword(nelCandidate, nelMaterial), true);
  assert.equal(await verifyPassword(trimBlocklistWhitespace(canonicalPassword(nelCandidate)), nelMaterial), false);
});

test("context check is deliberately narrow and separator-insensitive", () => {
  for (const password of ["fleetgps2026", "admin12345678", "dispatcher2026", "2026dispatcher", "dispatcherdispatcher", "fleet-gps-2026"]) {
    assert.equal(reason(password, "dispatcher"), PasswordPolicyReason.COMMON_OR_PREDICTABLE, password);
  }
  assert.equal(isContextuallyPredictable("violet dispatcher routes reach dawn", "dispatcher"), false);
  assert.equal(reason("violet dispatcher routes reach dawn", "dispatcher"), null);
});

test("exact equality with current password has a stable reason", () => {
  const password = "violet otters navigate lunar harbors";
  assert.equal(reason(password, "operator", password), PasswordPolicyReason.SAME_AS_CURRENT);
  assert.equal(reason(password + " ", "operator", password), null);
});
