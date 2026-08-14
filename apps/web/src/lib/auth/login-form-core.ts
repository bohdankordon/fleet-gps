import { AuthUser, parseAuthUser } from "./auth-contract";

export const LOGIN_ACTION = "/api/auth/login";
export const LOGIN_PATTERN = /^[A-Za-z0-9._-]{3,64}$/;
export type LoginFormError = "LOGIN_REQUIRED" | "LOGIN_INVALID" | "PASSWORD_REQUIRED" | "INVALID_CREDENTIALS" | "UNAVAILABLE";
export type LoginAttemptResult = Readonly<{ kind: "success"; user: AuthUser }> | Readonly<{ kind: "invalid-credentials" }> | Readonly<{ kind: "unavailable" }>;

export function validateLoginForm(login: string, password: string): LoginFormError | null {
  if (login.length === 0) return "LOGIN_REQUIRED";
  if (!LOGIN_PATTERN.test(login)) return "LOGIN_INVALID";
  if (password.length === 0) return "PASSWORD_REQUIRED";
  return null;
}

export async function attemptLogin(login: string, password: string, fetcher: typeof fetch = fetch): Promise<LoginAttemptResult> {
  try {
    const response = await fetcher(LOGIN_ACTION, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login, password }) });
    if (response.status === 401) return { kind: "invalid-credentials" };
    if (!response.ok) return { kind: "unavailable" };
    const user = parseAuthUser(await response.json());
    return user ? { kind: "success", user } : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}
