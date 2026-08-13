import { randomBytes } from "node:crypto";
import { isValidPassword } from "./password";

export type RandomBytes = (size: number) => Uint8Array;

export function generateTemporaryPassword(random: RandomBytes = randomBytes): string {
  const password = Buffer.from(random(18)).toString("base64url");
  if (!/^[A-Za-z0-9_-]{24}$/.test(password) || !isValidPassword(password)) throw new Error("Temporary password generator returned invalid entropy.");
  return password;
}
