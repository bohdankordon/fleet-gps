// Pure password-change contract model: client validation, request payload,
// and error mapping without React, so behavior is unit-testable. Values are
// never trimmed or transformed here; the backend remains authoritative.
import type { MessageKey } from "../../i18n/messages";
export const PASSWORD_MIN_CODE_POINTS = 12;
export const PASSWORD_MAX_CODE_POINTS = 128;

export type SecurityFormValues = Readonly<{
  currentPassword: string;
  newPassword: string;
  confirmation: string;
}>;

export type SecurityFormField = keyof SecurityFormValues;

export type SecurityFieldError = Readonly<{ field: SecurityFormField; messageKey: MessageKey }>;

// Unicode code points, mirroring the backend `passwordCodePointLength`
// (`Array.from(password).length`): no trim, spaces count, astral symbols
// count once.
export function passwordCodePointLength(password: string): number {
  return Array.from(password).length;
}

// Ordered by field: the first entry owns initial focus on failed submit.
export function validateSecurityForm(values: SecurityFormValues): readonly SecurityFieldError[] {
  const errors: SecurityFieldError[] = [];
  if (values.currentPassword.length === 0) errors.push({ field: "currentPassword", messageKey: "account.security.fieldRequired" });
  if (values.newPassword.length === 0) errors.push({ field: "newPassword", messageKey: "account.security.fieldRequired" });
  else if (passwordCodePointLength(values.newPassword) < PASSWORD_MIN_CODE_POINTS || passwordCodePointLength(values.newPassword) > PASSWORD_MAX_CODE_POINTS) {
    errors.push({ field: "newPassword", messageKey: "auth.password.invalidNew" });
  }
  else if (values.newPassword === values.currentPassword) errors.push({ field: "newPassword", messageKey: "auth.password.sameAsCurrent" });
  if (values.confirmation.length === 0) errors.push({ field: "confirmation", messageKey: "account.security.fieldRequired" });
  else if (values.confirmation !== values.newPassword) errors.push({ field: "confirmation", messageKey: "auth.password.mismatch" });
  return Object.freeze(errors);
}

export type ChangePasswordPayload = Readonly<{
  currentPassword: string;
  newPassword: string;
}>;

// Exactly the two backend keys, raw values: confirmation is client-only
// and must never be sent, persisted, or logged.
export function buildChangePasswordPayload(values: SecurityFormValues): ChangePasswordPayload {
  return Object.freeze({ currentPassword: values.currentPassword, newPassword: values.newPassword });
}

// Truthful mapping of what the contract exposes: 401 means the current
// password did not verify (wrong value, disabled account, or a lost
// optimistic-concurrency race, which the backend reports identically);
// 400 means the new password violates policy; anything else, including
// network failure (null), is a generic unavailable state.
export function changePasswordErrorKey(status: number | null, reason?: unknown): MessageKey {
  if (status === 401) return "auth.password.invalidCurrent";
  if (status === 400 && reason === "COMMON_OR_PREDICTABLE") return "auth.password.commonOrPredictable";
  if (status === 400 && reason === "SAME_AS_CURRENT") return "auth.password.sameAsCurrent";
  if (status === 400) return "auth.password.invalidNew";
  return "auth.password.unavailable";
}
