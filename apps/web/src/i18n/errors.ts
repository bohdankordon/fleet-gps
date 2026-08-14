import type { Translator } from "./core";

const adminUserErrorKeys = Object.freeze({
  INVALID_INPUT: "admin.user.error.INVALID_INPUT",
  DUPLICATE_LOGIN: "admin.user.error.DUPLICATE_LOGIN",
  NOT_FOUND: "admin.user.error.NOT_FOUND",
  SELF_PROTECTED: "admin.user.error.SELF_PROTECTED",
  LAST_ENABLED_ADMIN: "admin.user.error.LAST_ENABLED_ADMIN",
} as const);

export function errorCode(body: unknown): string | null {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : null;
}

export function adminUserErrorMessage(body: unknown, t: Translator, fallback: "create" | "action" = "action"): string {
  const code = errorCode(body);
  return code && code in adminUserErrorKeys ? t(adminUserErrorKeys[code as keyof typeof adminUserErrorKeys]) : t(fallback === "create" ? "admin.user.createError" : "admin.user.actionError");
}
