import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChangePasswordPayload,
  changePasswordErrorKey,
  passwordCodePointLength,
  validateSecurityForm,
} from "./account-security-form-model";

const valid = { currentPassword: "current-secret-value", newPassword: "0123456789abcdef", confirmation: "0123456789abcdef" };

test("empty form reports every required field in field order", () => {
  assert.deepEqual(validateSecurityForm({ currentPassword: "", newPassword: "", confirmation: "" }), [
    { field: "currentPassword", messageKey: "account.security.fieldRequired" },
    { field: "newPassword", messageKey: "account.security.fieldRequired" },
    { field: "confirmation", messageKey: "account.security.fieldRequired" },
  ]);
});

test("length uses Unicode code points without trimming or composition rules", () => {
  assert.equal(passwordCodePointLength("0123456789a"), 11);
  assert.equal(passwordCodePointLength("0123456789ab"), 12);
  assert.equal(passwordCodePointLength("0123456789abcdef"), 16);
  // Astral symbols count once, matching the backend counter.
  assert.equal(passwordCodePointLength("🔑".repeat(12)), 12);
  assert.equal(passwordCodePointLength("🔑".repeat(11) + "ab"), 13);
  // Spaces count and are never trimmed away.
  assert.equal(passwordCodePointLength(" ".repeat(12)), 12);
  assert.deepEqual(validateSecurityForm({ ...valid, newPassword: "0123456789a", confirmation: "0123456789a" })[0], {
    field: "newPassword",
    messageKey: "auth.password.invalidNew",
  });
  assert.deepEqual(validateSecurityForm({ ...valid, newPassword: "x".repeat(129), confirmation: "x".repeat(129) })[0], {
    field: "newPassword",
    messageKey: "auth.password.invalidNew",
  });
  assert.deepEqual(validateSecurityForm({ ...valid, newPassword: "x".repeat(12), confirmation: "x".repeat(12) }), []);
  assert.deepEqual(validateSecurityForm({ ...valid, newPassword: "x".repeat(128), confirmation: "x".repeat(128) }), []);
  assert.deepEqual(validateSecurityForm({ ...valid, newPassword: " ".repeat(12), confirmation: " ".repeat(12) }), []);
});

test("new password must differ exactly from current password", () => {
  assert.deepEqual(validateSecurityForm({ currentPassword: valid.newPassword, newPassword: valid.newPassword, confirmation: valid.newPassword }), [
    { field: "newPassword", messageKey: "auth.password.sameAsCurrent" },
  ]);
  assert.deepEqual(validateSecurityForm({ currentPassword: valid.newPassword, newPassword: `${valid.newPassword} `, confirmation: `${valid.newPassword} ` }), []);
});

test("confirmation must equal the new password exactly", () => {
  assert.deepEqual(validateSecurityForm(valid), []);
  assert.deepEqual(validateSecurityForm({ ...valid, confirmation: "0123456789abcdeX" }), [
    { field: "confirmation", messageKey: "auth.password.mismatch" },
  ]);
  // A padded confirmation is a different password, never silently fixed.
  assert.deepEqual(validateSecurityForm({ ...valid, confirmation: `${valid.newPassword} ` })[0]?.field, "confirmation");
});

test("payload carries exactly the two backend keys with raw values", () => {
  const values = { currentPassword: "  spaced current  ", newPassword: "  spaced new password  ", confirmation: "ignored" };
  assert.deepEqual(buildChangePasswordPayload(values), {
    currentPassword: "  spaced current  ",
    newPassword: "  spaced new password  ",
  });
  assert.deepEqual(Object.keys(buildChangePasswordPayload(values)).sort(), ["currentPassword", "newPassword"]);
});

test("error mapping stays truthful to the contract", () => {
  assert.equal(changePasswordErrorKey(401), "auth.password.invalidCurrent");
  assert.equal(changePasswordErrorKey(400), "auth.password.invalidNew");
  assert.equal(changePasswordErrorKey(400, "COMMON_OR_PREDICTABLE"), "auth.password.commonOrPredictable");
  assert.equal(changePasswordErrorKey(400, "SAME_AS_CURRENT"), "auth.password.sameAsCurrent");
  for (const status of [403, 404, 422, 500, null]) assert.equal(changePasswordErrorKey(status), "auth.password.unavailable");
});
