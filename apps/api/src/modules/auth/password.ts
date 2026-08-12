import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

export const PASSWORD_HASH_VERSION = 1;
export const PASSWORD_PROFILE_V1 = Object.freeze({ algorithm: "argon2id" as const, memory: 65_536, passes: 3, parallelism: 4, saltLength: 16, tagLength: 32 });
export type PasswordMaterial = Readonly<{ version: number; salt: Uint8Array<ArrayBufferLike>; hash: Uint8Array<ArrayBufferLike> }>;

export function passwordCodePointLength(password: string): number { return Array.from(password).length; }
export function isValidPassword(password: string): boolean { const length = passwordCodePointLength(password); return length >= 15 && length <= 128; }

function derive(password: string, salt: Uint8Array): Promise<Buffer> {
  return new Promise((resolve, reject) => argon2(PASSWORD_PROFILE_V1.algorithm, {
    message: password,
    nonce: salt,
    parallelism: PASSWORD_PROFILE_V1.parallelism,
    tagLength: PASSWORD_PROFILE_V1.tagLength,
    memory: PASSWORD_PROFILE_V1.memory,
    passes: PASSWORD_PROFILE_V1.passes,
  }, (error, result) => error ? reject(error) : resolve(result)));
}

export async function hashPassword(password: string): Promise<PasswordMaterial> {
  if (!isValidPassword(password)) throw new Error("Password must contain 15 to 128 Unicode code points.");
  const salt = randomBytes(PASSWORD_PROFILE_V1.saltLength);
  return Object.freeze({ version: PASSWORD_HASH_VERSION, salt: new Uint8Array(salt), hash: new Uint8Array(await derive(password, salt)) });
}

export async function verifyPassword(password: string, material: PasswordMaterial): Promise<boolean> {
  if (material.version !== PASSWORD_HASH_VERSION || material.salt.byteLength !== PASSWORD_PROFILE_V1.saltLength || material.hash.byteLength !== PASSWORD_PROFILE_V1.tagLength) return false;
  const candidate = await derive(password, material.salt);
  return timingSafeEqual(candidate, material.hash);
}
