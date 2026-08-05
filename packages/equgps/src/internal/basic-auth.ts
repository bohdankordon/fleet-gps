export function createBasicAuthorization(email: string, password: string): string {
  return `Basic ${Buffer.from(`${email}:${password}`, "utf8").toString("base64")}`;
}
