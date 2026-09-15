export const PASSWORD_BLOCKLIST_WHITESPACE_RULE =
  "remove only leading and trailing Unicode \\p{White_Space}";

export function trimBlocklistWhitespace(value: string): string {
  return value.replace(/^[\p{White_Space}]+|[\p{White_Space}]+$/gu, "");
}

export function canonicalBlocklistIdentity(value: string): string {
  return trimBlocklistWhitespace(value.normalize("NFKC").toLowerCase());
}
