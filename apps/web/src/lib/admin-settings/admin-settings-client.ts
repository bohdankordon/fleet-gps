import "server-only";
import { authenticatedApiFetch } from "../auth/auth-cookie";
import { parseWebConfig } from "../web-config";
import { parseAdminSettings, type AdminSettings } from "./admin-settings-contract";
export async function fetchAdminSettings(): Promise<AdminSettings> { const response = await authenticatedApiFetch(`${parseWebConfig(process.env).apiInternalBaseUrl}/api/admin/settings`, { cache: "no-store", headers: { Accept: "application/json" } }); const settings = response.ok ? parseAdminSettings(await response.json()) : null; if (!settings) throw new Error("Admin settings unavailable."); return settings; }
