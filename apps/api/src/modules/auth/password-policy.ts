import { COMMON_PASSWORD_BLOCKLIST, type PasswordBlocklist } from "./password-blocklist";

export const PASSWORD_MIN_CODE_POINTS = 12;
export const PASSWORD_MAX_CODE_POINTS = 128;

export enum PasswordPolicyReason {
  LENGTH = "LENGTH",
  COMMON_OR_PREDICTABLE = "COMMON_OR_PREDICTABLE",
  SAME_AS_CURRENT = "SAME_AS_CURRENT",
}

export class PasswordPolicyError extends Error {
  public constructor(public readonly reason: PasswordPolicyReason) { super(reason); this.name = "PasswordPolicyError"; }
}

export function passwordCodePointLength(password: string): number { return Array.from(password).length; }

export function canonicalPassword(password: string): string { return password.normalize("NFKC").toLowerCase(); }

function separatorInsensitive(value: string): string { return value.replace(/[\p{White_Space}\p{Punctuation}]/gu, ""); }

export function isContextuallyPredictable(password: string, login: string): boolean {
  const comparison = separatorInsensitive(canonicalPassword(password));
  const bases = new Set(["fleetgps", "taxigps", "admin", "administrator", separatorInsensitive(canonicalPassword(login))].filter((base) => base.length > 0));
  for (const base of bases) {
    if (comparison === base || comparison === `${base}${base}`) return true;
    if (comparison.startsWith(base) && /^\d{1,8}$/u.test(comparison.slice(base.length))) return true;
    if (comparison.endsWith(base) && /^\d{1,8}$/u.test(comparison.slice(0, -base.length))) return true;
  }
  return false;
}

export function validateUserSelectedPassword(password: string, login: string, currentPassword?: string, blocklist: PasswordBlocklist = COMMON_PASSWORD_BLOCKLIST): void {
  const length = passwordCodePointLength(password);
  if (length < PASSWORD_MIN_CODE_POINTS || length > PASSWORD_MAX_CODE_POINTS) throw new PasswordPolicyError(PasswordPolicyReason.LENGTH);
  if (currentPassword !== undefined && password === currentPassword) throw new PasswordPolicyError(PasswordPolicyReason.SAME_AS_CURRENT);
  const canonical = canonicalPassword(password);
  if (blocklist.hasIdentity(canonical) || blocklist.hasIdentity(canonical.trim()) || isContextuallyPredictable(password, login)) throw new PasswordPolicyError(PasswordPolicyReason.COMMON_OR_PREDICTABLE);
}
