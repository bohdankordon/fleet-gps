import "server-only";
import { redirect } from "next/navigation";
import { authenticatedApiFetch } from "./auth-cookie";
import { parseWebConfig } from "../web-config";
import { parseAuthUser, type AuthUser } from "./auth-contract";
export { hasPermission, landingFor, type AuthPermission, type AuthUser } from "./auth-contract";

export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const config = parseWebConfig(process.env);
    const response = await authenticatedApiFetch(`${config.apiInternalBaseUrl}/api/auth/me`, { cache: "no-store", headers: { Accept: "application/json" } });
    return response.ok ? parseAuthUser(await response.json()) : null;
  } catch { return null; }
}

export async function requireAuthUser(): Promise<AuthUser> { const user = await getAuthUser(); if (!user) redirect("/login"); return user; }
