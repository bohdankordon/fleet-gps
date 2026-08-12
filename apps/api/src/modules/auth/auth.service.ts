import { Injectable } from "@nestjs/common";
import type { AuthUser, Prisma } from "../../generated/prisma/client";
import { AuthRole } from "../../generated/prisma/enums";
import { DatabaseService } from "../database/database.service";
import { INVALID_CREDENTIALS_MESSAGE } from "./auth.constants";
import type { AuthenticatedPrincipal, SafeAuthUser } from "./auth.types";
import { normalizeLogin } from "./login";
import { hashPassword, isValidPassword, verifyPassword } from "./password";
import { PERMISSIONS, resolvePermissions } from "./permissions";
import { createSessionToken, hashSessionToken, sessionExpiresAt } from "./session";

const DUMMY_MATERIAL = Object.freeze({
  version: 1,
  salt: Buffer.from("f6ad6fbf352dce93611d1d278b23f444", "hex"),
  hash: Buffer.from("db50682b78b82d30fb9f3266cfba00c4d684bcc5894e26a0e7cb6c38c10bf44c", "hex"),
});

export class InvalidCredentialsError extends Error { public constructor() { super(INVALID_CREDENTIALS_MESSAGE); this.name = "InvalidCredentialsError"; } }
export class InvalidPasswordError extends Error { public constructor() { super("Password must contain 15 to 128 Unicode code points."); this.name = "InvalidPasswordError"; } }

type UserWithPermissions = AuthUser & Readonly<{ permissions: readonly Readonly<{ key: string }>[] }>;

function safeUser(user: UserWithPermissions): SafeAuthUser {
  return Object.freeze({
    id: user.id,
    login: user.login,
    role: user.role,
    permissions: user.role === AuthRole.ADMIN ? PERMISSIONS : resolvePermissions(user.permissions.map(({ key }) => key)),
    mustChangePassword: user.mustChangePassword,
  });
}

@Injectable()
export class AuthService {
  public constructor(private readonly database: DatabaseService) {}

  public async login(login: unknown, password: unknown, now = new Date()): Promise<Readonly<{ user: SafeAuthUser; token: string }>> {
    const normalized = typeof login === "string" ? normalizeLogin(login) : null;
    const suppliedPassword = typeof password === "string" ? password : "";
    const user = normalized ? await this.database.getClient().authUser.findUnique({ where: { normalizedLogin: normalized }, include: { permissions: true } }) : null;
    const valid = user
      ? await verifyPassword(suppliedPassword, { version: user.passwordHashVersion, salt: user.passwordSalt, hash: user.passwordHash })
      : await verifyPassword(suppliedPassword, DUMMY_MATERIAL);
    if (!user || !valid || user.disabled) throw new InvalidCredentialsError();
    const token = createSessionToken();
    await this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
      const current = await transaction.$queryRaw<readonly Readonly<{ id: string }>[]>`
        SELECT "id"
        FROM "auth_users"
        WHERE "id" = ${user.id}::uuid
          AND "password_hash_version" = ${user.passwordHashVersion}
          AND "password_salt" = ${user.passwordSalt}
          AND "password_hash" = ${user.passwordHash}
          AND "disabled" = false
        FOR UPDATE
      `;
      if (current.length !== 1) throw new InvalidCredentialsError();
      await transaction.authSession.create({ data: { userId: user.id, tokenHash: hashSessionToken(token), createdAt: now, expiresAt: sessionExpiresAt(now) } });
    });
    return Object.freeze({ user: safeUser(user), token });
  }

  public async authenticate(token: string, now = new Date()): Promise<AuthenticatedPrincipal | null> {
    const tokenHash = hashSessionToken(token);
    const session = await this.database.getClient().authSession.findUnique({
      where: { tokenHash },
      include: { user: { include: { permissions: true } } },
    }) as (Readonly<{ expiresAt: Date; user: UserWithPermissions }> | null);
    if (!session || session.expiresAt.getTime() <= now.getTime() || session.user.disabled) return null;
    return Object.freeze({ ...safeUser(session.user), sessionTokenHash: tokenHash });
  }

  public async logout(tokenHash: Uint8Array<ArrayBuffer>): Promise<void> {
    await this.database.getClient().authSession.deleteMany({ where: { tokenHash } });
  }

  public async changePassword(principal: AuthenticatedPrincipal, currentPassword: unknown, newPassword: unknown, now = new Date()): Promise<Readonly<{ user: SafeAuthUser; token: string }>> {
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") throw new InvalidCredentialsError();
    if (!isValidPassword(newPassword)) throw new InvalidPasswordError();
    const current = await this.database.getClient().authUser.findUnique({ where: { id: principal.id }, include: { permissions: true } });
    if (!current || current.disabled || !await verifyPassword(currentPassword, { version: current.passwordHashVersion, salt: current.passwordSalt, hash: current.passwordHash })) throw new InvalidCredentialsError();
    const next = await hashPassword(newPassword);
    const token = createSessionToken();
    const tokenHash = hashSessionToken(token);
    const updated = await this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
      const changed = await transaction.authUser.updateMany({
        where: { id: current.id, passwordHashVersion: current.passwordHashVersion, passwordHash: current.passwordHash, passwordSalt: current.passwordSalt, disabled: false },
        data: { passwordHashVersion: next.version, passwordHash: new Uint8Array(next.hash), passwordSalt: new Uint8Array(next.salt), mustChangePassword: false, passwordChangedAt: now },
      });
      if (changed.count !== 1) throw new InvalidCredentialsError();
      await transaction.authSession.deleteMany({ where: { userId: current.id } });
      await transaction.authSession.create({ data: { userId: current.id, tokenHash, createdAt: now, expiresAt: sessionExpiresAt(now) } });
      return transaction.authUser.findUniqueOrThrow({ where: { id: current.id }, include: { permissions: true } });
    });
    return Object.freeze({ user: safeUser(updated), token });
  }
}
