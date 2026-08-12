export const LOGIN_PATTERN = /^[A-Za-z0-9._-]{3,64}$/;
export function normalizeLogin(value: string): string | null {
  return LOGIN_PATTERN.test(value) ? value.toLowerCase() : null;
}
