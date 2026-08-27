import "server-only";
import { authenticatedApiFetch } from "../auth/auth-cookie";
import { parseWebConfig } from "../web-config";
import { parseRuntimeSettings, type RuntimeSettings } from "./runtime-settings-contract";
export async function fetchRuntimeSettings(): Promise<RuntimeSettings> { const response = await authenticatedApiFetch(`${parseWebConfig(process.env).apiInternalBaseUrl}/api/settings/runtime`, { cache: "no-store", headers: { Accept: "application/json" } }); const settings = response.ok ? parseRuntimeSettings(await response.json()) : null; if (!settings) throw new Error("Runtime settings unavailable."); return settings; }
