import { Inject, Injectable } from "@nestjs/common";
import type { AuthUser, Prisma } from "../../generated/prisma/client";
import { AuthRole } from "../../generated/prisma/enums";
import { DatabaseService } from "../database/database.service";
import { AuditEventRepository, buildUserAccessChangedAuditEvent, buildUserCreatedAuditEvent, buildUserDisabledAuditEvent, buildUserEnabledAuditEvent, buildUserPasswordResetAuditEvent, type AuditUserActor } from "../audit";
import { normalizeLogin } from "./login";
import { hashPassword, type PasswordMaterial } from "./password";
import { isPermission, PERMISSIONS, resolvePermissions, type Permission } from "./permissions";
import { generateTemporaryPassword } from "./temporary-password";
import type { OneTimePasswordResult, SafeAdminUser } from "./admin-users.types";

export const ADMIN_USER_SECURITY = Symbol("ADMIN_USER_SECURITY");
export const ADMIN_CARDINALITY_ADVISORY_LOCK_KEY = 1_706_170_002;

export type AdminUserSecurity = Readonly<{
  generatePassword(): string;
  hashPassword(password: string): Promise<PasswordMaterial>;
}>;

export const DEFAULT_ADMIN_USER_SECURITY: AdminUserSecurity = Object.freeze({ generatePassword: generateTemporaryPassword, hashPassword });

export type AdminUsersErrorCode = "INVALID_INPUT" | "DUPLICATE_LOGIN" | "NOT_FOUND" | "SELF_PROTECTED" | "LAST_ENABLED_ADMIN";
export class AdminUsersError extends Error {
  public constructor(public readonly code: AdminUsersErrorCode) { super(code); this.name = "AdminUsersError"; }
}

type UserWithPermissions = AuthUser & Readonly<{ permissions: readonly Readonly<{ key: string }>[]; telegramConnection?: Readonly<{ status: "CONNECTED" | "BROKEN" | "DISCONNECTED" }> | null }>;

function safeUser(user: UserWithPermissions): SafeAdminUser {
  return Object.freeze({
    id: user.id,
    login: user.login,
    role: user.role,
    disabled: user.disabled,
    mustChangePassword: user.mustChangePassword,
    permissions: user.role === AuthRole.USER ? resolvePermissions(user.permissions.map(({ key }) => key)) : Object.freeze([]),
    telegramStatus: user.telegramConnection?.status ?? "NOT_CONNECTED",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
}

function effectivePermissions(user: Pick<UserWithPermissions, "role" | "permissions">): readonly Permission[] {
  return user.role === AuthRole.ADMIN ? PERMISSIONS : resolvePermissions(user.permissions.map(({ key }) => key));
}

function samePermissions(left: readonly Permission[], right: readonly Permission[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AdminUsersError("INVALID_INPUT");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new AdminUsersError("INVALID_INPUT");
}

function role(value: unknown): AuthRole {
  if (value !== AuthRole.ADMIN && value !== AuthRole.USER) throw new AdminUsersError("INVALID_INPUT");
  return value;
}

function permissions(value: unknown, required: boolean): readonly Permission[] {
  if (value === undefined && !required) return Object.freeze([]);
  if (!Array.isArray(value) || value.some((key) => typeof key !== "string" || !isPermission(key))) throw new AdminUsersError("INVALID_INPUT");
  return resolvePermissions(value as string[]);
}

async function lockAdminCardinality(transaction: Prisma.TransactionClient): Promise<void> {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_CARDINALITY_ADVISORY_LOCK_KEY})`;
}

function prismaDuplicate(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

@Injectable()
export class AdminUsersService {
  public constructor(private readonly database: DatabaseService, @Inject(ADMIN_USER_SECURITY) private readonly security: AdminUserSecurity, private readonly audit: AuditEventRepository) {}

  public async list(): Promise<readonly SafeAdminUser[]> {
    const users = await this.database.getClient().authUser.findMany({ orderBy: [{ normalizedLogin: "asc" }, { id: "asc" }], include: { permissions: true, telegramConnection: { select: { status: true } } } });
    return Object.freeze(users.map(safeUser));
  }

  public async detail(userId: string): Promise<SafeAdminUser> {
    const user = await this.database.getClient().authUser.findUnique({ where: { id: userId }, include: { permissions: true, telegramConnection: { select: { status: true } } } });
    if (!user) throw new AdminUsersError("NOT_FOUND");
    return safeUser(user);
  }

  public async create(actor: AuditUserActor, input: unknown): Promise<OneTimePasswordResult> {
    const value = record(input); exactKeys(value, ["login", "role", "permissions"]);
    const normalizedLogin = typeof value.login === "string" ? normalizeLogin(value.login) : null;
    if (!normalizedLogin) throw new AdminUsersError("INVALID_INPUT");
    const nextRole = role(value.role);
    const nextPermissions = permissions(value.permissions, nextRole === AuthRole.USER);
    if (nextRole === AuthRole.ADMIN && nextPermissions.length > 0) throw new AdminUsersError("INVALID_INPUT");
    const temporaryPassword = this.security.generatePassword();
    const material = await this.security.hashPassword(temporaryPassword);
    try {
      const user = await this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
        if (nextRole === AuthRole.ADMIN) await lockAdminCardinality(transaction);
        const created = await transaction.authUser.create({ data: { login: value.login as string, normalizedLogin, role: nextRole, disabled: false, mustChangePassword: true, passwordHashVersion: material.version, passwordSalt: new Uint8Array(material.salt), passwordHash: new Uint8Array(material.hash) } });
        if (nextRole === AuthRole.USER && nextPermissions.length > 0) await transaction.authUserPermission.createMany({ data: nextPermissions.map((key) => ({ userId: created.id, key })) });
        const persisted = await transaction.authUser.findUniqueOrThrow({ where: { id: created.id }, include: { permissions: true } });
        await this.audit.append(transaction, buildUserCreatedAuditEvent(actor, persisted.id, {
          targetLoginSnapshot: persisted.login,
          role: persisted.role,
          permissions: effectivePermissions(persisted),
        }));
        return persisted;
      });
      return Object.freeze({ user: safeUser(user), temporaryPassword });
    } catch (error) {
      if (prismaDuplicate(error)) throw new AdminUsersError("DUPLICATE_LOGIN");
      throw error;
    }
  }

  public async updateAccess(actor: AuditUserActor, userId: string, input: unknown): Promise<SafeAdminUser> {
    const value = record(input); exactKeys(value, ["role", "permissions"]);
    const nextRole = role(value.role);
    const nextPermissions = permissions(value.permissions, nextRole === AuthRole.USER);
    if (nextRole === AuthRole.ADMIN && nextPermissions.length > 0) throw new AdminUsersError("INVALID_INPUT");
    return this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
      await lockAdminCardinality(transaction);
      const current = await transaction.authUser.findUnique({ where: { id: userId }, include: { permissions: true } });
      if (!current) throw new AdminUsersError("NOT_FOUND");
      if (actor.actorUserId === userId && current.role === AuthRole.ADMIN && nextRole === AuthRole.USER) throw new AdminUsersError("SELF_PROTECTED");
      if (current.role === AuthRole.ADMIN && !current.disabled && nextRole === AuthRole.USER) {
        const enabledAdmins = await transaction.authUser.count({ where: { role: AuthRole.ADMIN, disabled: false } });
        if (enabledAdmins <= 1) throw new AdminUsersError("LAST_ENABLED_ADMIN");
      }
      const previousPermissions = effectivePermissions(current);
      const requestedEffectivePermissions = nextRole === AuthRole.ADMIN ? PERMISSIONS : nextPermissions;
      if (current.role === nextRole && samePermissions(previousPermissions, requestedEffectivePermissions)) return safeUser(current);

      await transaction.authUserPermission.deleteMany({ where: { userId } });
      await transaction.authUser.update({ where: { id: userId }, data: { role: nextRole } });
      if (nextRole === AuthRole.USER && nextPermissions.length > 0) await transaction.authUserPermission.createMany({ data: nextPermissions.map((key) => ({ userId, key })) });
      const persisted = await transaction.authUser.findUniqueOrThrow({ where: { id: userId }, include: { permissions: true } });
      await this.audit.append(transaction, buildUserAccessChangedAuditEvent(actor, persisted.id, {
        targetLoginSnapshot: persisted.login,
        previousRole: current.role,
        role: persisted.role,
        previousPermissions,
        permissions: effectivePermissions(persisted),
      }));
      return safeUser(persisted);
    });
  }

  public async disable(actor: AuditUserActor, userId: string): Promise<SafeAdminUser> {
    if (actor.actorUserId === userId) throw new AdminUsersError("SELF_PROTECTED");
    return this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
      await lockAdminCardinality(transaction);
      const current = await transaction.authUser.findUnique({ where: { id: userId }, include: { permissions: true } });
      if (!current) throw new AdminUsersError("NOT_FOUND");
      if (current.role === AuthRole.ADMIN && !current.disabled) {
        const enabledAdmins = await transaction.authUser.count({ where: { role: AuthRole.ADMIN, disabled: false } });
        if (enabledAdmins <= 1) throw new AdminUsersError("LAST_ENABLED_ADMIN");
      }
      if (!current.disabled) {
        await transaction.authUser.update({ where: { id: userId }, data: { disabled: true } });
        await transaction.authSession.deleteMany({ where: { userId } });
        await this.audit.append(transaction, buildUserDisabledAuditEvent(actor, userId, current.login));
      } else {
        await transaction.authSession.deleteMany({ where: { userId } });
      }
      return safeUser(await transaction.authUser.findUniqueOrThrow({ where: { id: userId }, include: { permissions: true } }));
    });
  }

  public async enable(actor: AuditUserActor, userId: string): Promise<SafeAdminUser> {
    return this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
      await lockAdminCardinality(transaction);
      const current = await transaction.authUser.findUnique({ where: { id: userId }, include: { permissions: true } });
      if (!current) throw new AdminUsersError("NOT_FOUND");
      if (current.disabled) {
        await transaction.authUser.update({ where: { id: userId }, data: { disabled: false } });
        await this.audit.append(transaction, buildUserEnabledAuditEvent(actor, userId, current.login));
      }
      return safeUser(await transaction.authUser.findUniqueOrThrow({ where: { id: userId }, include: { permissions: true } }));
    });
  }

  public async resetPassword(actor: AuditUserActor, userId: string): Promise<OneTimePasswordResult> {
    if (actor.actorUserId === userId) throw new AdminUsersError("SELF_PROTECTED");
    const temporaryPassword = this.security.generatePassword();
    const material = await this.security.hashPassword(temporaryPassword);
    const user = await this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
      const current = await transaction.authUser.findUnique({ where: { id: userId }, include: { permissions: true } });
      if (!current) throw new AdminUsersError("NOT_FOUND");
      await transaction.authUser.update({ where: { id: userId }, data: { passwordHashVersion: material.version, passwordSalt: new Uint8Array(material.salt), passwordHash: new Uint8Array(material.hash), passwordChangedAt: new Date(), mustChangePassword: true } });
      await transaction.authSession.deleteMany({ where: { userId } });
      await this.audit.append(transaction, buildUserPasswordResetAuditEvent(actor, userId, current.login));
      return transaction.authUser.findUniqueOrThrow({ where: { id: userId }, include: { permissions: true } });
    });
    return Object.freeze({ user: safeUser(user), temporaryPassword });
  }
}
