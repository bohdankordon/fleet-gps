import { parseAuthUser, type AuthUser } from "./auth-contract";

export type AuthResolution =
  | Readonly<{ kind: "authenticated"; user: AuthUser }>
  | Readonly<{ kind: "unauthenticated" }>
  | Readonly<{ kind: "unavailable" }>;

export function classifyMeResponse(status: number, payload: unknown): AuthResolution {
  if (status === 401) return Object.freeze({ kind: "unauthenticated" });
  if (status === 200) {
    const user = parseAuthUser(payload);
    return user ? Object.freeze({ kind: "authenticated", user }) : Object.freeze({ kind: "unavailable" });
  }
  return Object.freeze({ kind: "unavailable" });
}

export class AuthUnavailableError extends Error {
  public constructor() {
    super("Authentication is temporarily unavailable.");
    this.name = "AuthUnavailableError";
  }
}

export async function resolveAuthFromToken(
  token: string | undefined,
  loadMe: (token: string) => Promise<Response>,
): Promise<AuthResolution> {
  if (!token) return Object.freeze({ kind: "unauthenticated" });
  let response: Response;
  try {
    response = await loadMe(token);
  } catch {
    return Object.freeze({ kind: "unavailable" });
  }
  if (response.status !== 200) return classifyMeResponse(response.status, undefined);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return Object.freeze({ kind: "unavailable" });
  }
  return classifyMeResponse(response.status, payload);
}

export function requireResolutionUser(
  resolution: AuthResolution,
  redirectToLogin: () => never,
): AuthUser {
  if (resolution.kind === "authenticated") return resolution.user;
  if (resolution.kind === "unauthenticated") return redirectToLogin();
  throw new AuthUnavailableError();
}
