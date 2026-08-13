import type { AuthUser } from "./auth/auth-contract";
import { hasPermission } from "./auth/auth-contract";

export type AdminNavigationItem = Readonly<{ href: string; label: string }>;
export function adminNavigationFor(user: AuthUser | null): readonly AdminNavigationItem[] {
  if (!user) return [];
  const items: AdminNavigationItem[] = [];
  if (user.role === "ADMIN") items.push({ href: "/admin/users", label: "Пользователи" }, { href: "/admin/audit", label: "Аудит" });
  if (hasPermission(user, "historyAdmin.view")) items.push({ href: "/admin/history", label: "История GPS" });
  return Object.freeze(items);
}
