import type { AuthRole, PrismaClient } from "../../generated/prisma/client";
import { hashPassword } from "./password";
import { normalizeLogin } from "./login";
import { isPermission, resolvePermissions } from "./permissions";

export class AuthUserCreateError extends Error {}
export type AuthUserCreateInput = Readonly<{ login: string; role: AuthRole; permissions: readonly string[]; password: string }>;

export async function createAuthUser(client: PrismaClient, input: AuthUserCreateInput): Promise<Readonly<{ login: string; role: AuthRole; permissions: readonly string[] }>> {
  const normalizedLogin = normalizeLogin(input.login);
  if (!normalizedLogin) throw new AuthUserCreateError("Login must contain 3-64 ASCII letters, digits, dots, underscores, or hyphens.");
  if (input.role !== "ADMIN" && input.role !== "USER") throw new AuthUserCreateError("Role must be ADMIN or USER.");
  if (input.permissions.some((key) => !isPermission(key))) throw new AuthUserCreateError("One or more permission keys are unknown.");
  const recognized = resolvePermissions(input.permissions);
  const permissions = input.role === "ADMIN" ? [] : recognized;
  const material = await hashPassword(input.password).catch(() => { throw new AuthUserCreateError("Password must contain 15-128 Unicode code points."); });
  try {
    await client.$transaction(async (transaction) => {
      const user = await transaction.authUser.create({ data: { login: input.login, normalizedLogin, passwordHashVersion: material.version, passwordSalt: new Uint8Array(material.salt), passwordHash: new Uint8Array(material.hash), role: input.role, disabled: false, mustChangePassword: false } });
      if (permissions.length > 0) await transaction.authUserPermission.createMany({ data: permissions.map((key) => ({ userId: user.id, key })) });
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") throw new AuthUserCreateError("An account with that login already exists.");
    throw error;
  }
  return Object.freeze({ login: input.login, role: input.role, permissions });
}
