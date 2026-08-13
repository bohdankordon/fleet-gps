import "server-only";
import { authenticatedApiFetch } from "../auth/auth-cookie";
import { parseWebConfig } from "../web-config";
import { parseAdminManagedUser, parseAdminManagedUsers, type AdminManagedUser } from "./admin-users-contract";
export async function fetchAdminUsers(): Promise<readonly AdminManagedUser[]> { const response = await authenticatedApiFetch(`${parseWebConfig(process.env).apiInternalBaseUrl}/api/admin/users`, { cache: "no-store", headers: { Accept: "application/json" } }); const users = response.ok ? parseAdminManagedUsers(await response.json()) : null; if (!users) throw new Error("Admin users unavailable."); return users; }
export async function fetchAdminUser(userId: string): Promise<AdminManagedUser | null> { const response = await authenticatedApiFetch(`${parseWebConfig(process.env).apiInternalBaseUrl}/api/admin/users/${encodeURIComponent(userId)}`, { cache: "no-store", headers: { Accept: "application/json" } }); if (response.status === 404) return null; const user = response.ok ? parseAdminManagedUser(await response.json()) : null; if (!user) throw new Error("Admin user unavailable."); return user; }
