import type { AuthPermission, AuthUser } from "@/lib/auth/auth-contract";
import { translate } from "./core";
import { DEFAULT_LOCALE, type AppLocale } from "./locales";

export function roleLabel(role: AuthUser["role"], locale: AppLocale = DEFAULT_LOCALE): string {
  return translate(locale, `role.${role}`);
}

export function permissionLabel(permission: AuthPermission, locale: AppLocale = DEFAULT_LOCALE): string {
  return translate(locale, `permission.${permission}`);
}
