import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authenticatedApiFetch } from "./auth-cookie";
import { parseWebConfig } from "../web-config";
import { AUTH_COOKIE_NAME, type AuthUser } from "./auth-contract";
import { requireResolutionUser, resolveAuthFromToken, type AuthResolution } from "./auth-resolution";
export { hasPermission, landingFor, type AuthPermission, type AuthUser } from "./auth-contract";
export { AuthUnavailableError, type AuthResolution } from "./auth-resolution";

type ResolveDeps = Readonly<{
  readSessionToken?: () => Promise<string | undefined> | string | undefined;
  fetcher?: typeof fetch;
  env?: Readonly<Record<string, string | undefined>>;
}>;

export async function resolveAuthUser(deps: ResolveDeps = {}): Promise<AuthResolution> {
  const readSessionToken =
    deps.readSessionToken ?? (async () => (await cookies()).get(AUTH_COOKIE_NAME)?.value);
  const token = await readSessionToken();
  const apiEnv = deps.env ?? process.env;
  const fetcher = deps.fetcher ?? authenticatedApiFetch;
  return resolveAuthFromToken(token, async () => {
    const { apiInternalBaseUrl } = parseWebConfig(apiEnv);
    return fetcher(apiInternalBaseUrl + "/api/auth/me", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  });
}

export async function requireAuthUser(deps: ResolveDeps = {}): Promise<AuthUser> {
  return requireResolutionUser(await resolveAuthUser(deps), () => redirect("/login"));
}
