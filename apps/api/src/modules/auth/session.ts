import { createHash, randomBytes } from "node:crypto";
import { AUTH_COOKIE_NAME, AUTH_SESSION_BYTES, AUTH_SESSION_LIFETIME_MS } from "./auth.constants";

export function createSessionToken(): string { return randomBytes(AUTH_SESSION_BYTES).toString("base64url"); }
export function hashSessionToken(token: string): Uint8Array<ArrayBuffer> { return new Uint8Array(createHash("sha256").update(token, "utf8").digest()); }
export function sessionExpiresAt(createdAt: Date): Date { return new Date(createdAt.getTime() + AUTH_SESSION_LIFETIME_MS); }
export function readSessionCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== AUTH_COOKIE_NAME) continue;
    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{43,}$/.test(value) ? value : null;
  }
  return null;
}
export function sessionCookie(token: string, production = process.env.NODE_ENV === "production"): string {
  return `${AUTH_COOKIE_NAME}=${token}; Max-Age=${AUTH_SESSION_LIFETIME_MS / 1_000}; HttpOnly; SameSite=Lax; Path=/${production ? "; Secure" : ""}`;
}
export function clearedSessionCookie(production = process.env.NODE_ENV === "production"): string {
  return `${AUTH_COOKIE_NAME}=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/${production ? "; Secure" : ""}`;
}
