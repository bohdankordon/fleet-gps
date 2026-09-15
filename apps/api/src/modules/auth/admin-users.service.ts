import { Inject, Injectable } from "@nestjs/common";
import type { AuthUser, Prisma } from "../../generated/prisma/client";
import { AuthRole, VehicleAccessMode } from "../../generated/prisma/enums";
import { normalizeUuid } from "../../common/uuid.validation";
import { DatabaseService } from "../database/database.service";
import { AuditEventRepository, buildUserAccessChangedAuditEvent, buildUserCreatedAuditEvent, buildUserDisabledAuditEvent, buildUserEnabledAuditEvent, buildUserPasswordResetAuditEvent, buildUserVehicleAccessChangedAuditEvent, type AuditUserActor } from "../audit";
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

export type AdminUsersErrorCode = "INVALID_INPUT" | "DUPLICATE_LOGIN" | "NOT_FOUND" | "SELF_PROTECTED" | "LAST_ENABLED_ADMIN" | "INVALID_GROUP_REFERENCE" | "INVALID_VEHICLE_REFERENCE";
export class AdminUsersError extends Error {
  public constructor(public readonly code: AdminUsersErrorCode) { super(code); this.name = "AdminUsersError"; }
}

type UserWithPermissions = AuthUser & Readonly<{
  permissions: readonly Readonly<{ key: string }>[];
  telegramConnection?: Readonly<{ status: "CONNECTED" | "BROKEN" | "DISCONNECTED" }> | null;
  vehicleGroupGrants: readonly Readonly<{ groupId: string }>[];
  vehicleGrants: readonly Readonly<{ vehicleId: string }>[];
}>;

type ParsedVehicleAccess = Readonly<{ mode: VehicleAccessMode; groupIds: readonly string[]; vehicleIds: readonly string[] }>;

// Authoritative safe AdminUser read projection (Phase 0 correctness).
// Every list/detail/mutation read that returns SafeAdminUser must include the
// Telegram connection status projection (status only, no secrets) so that
// safeUser() never fabricates NOT_CONNECTED merely because the relation was
// omitted. Reuse this constant to prevent future drift.
export const ADMIN_USER_INCLUDE = Object.freeze({
  permissions: true,
  telegramConnection: Object.freeze({ select: Object.freeze({ status: true }) }),
  vehicleGroupGrants: Object.freeze({ orderBy: Object.freeze({ groupId: "asc" }), select: Object.freeze({ groupId: true }) }),
  vehicleGrants: Object.freeze({ orderBy: Object.freeze({ vehicleId: "asc" }), select: Object.freeze({ vehicleId: true }) }),
}) as unknown as Prisma.AuthUserInclude;

function safeUser(user: UserWithPermissions): SafeAdminUser {
  return Object.freeze({
    id: user.id,
    login: user.login,
    role: user.role,
    disabled: user.disabled,
    mustChangePassword: user.mustChangePassword,
    permissions: user.role === AuthRole.USER ? resolvePermissions(user.permissions.map(({ key }) => key)) : Object.freeze([]),
    vehicleAccess: configuredVehicleAccess(user),
    telegramStatus: user.telegramConnection?.status ?? "NOT_CONNECTED",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
}

function configuredVehicleAccess(user: Pick<UserWithPermissions, "role" | "vehicleAccessMode" | "vehicleGroupGrants" | "vehicleGrants">): ParsedVehicleAccess {
  if (user.role === AuthRole.ADMIN || user.vehicleAccessMode === VehicleAccessMode.ALL) return Object.freeze({ mode: VehicleAccessMode.ALL, groupIds: Object.freeze([]), vehicleIds: Object.freeze([]) });
  return Object.freeze({ mode: VehicleAccessMode.SELECTED, groupIds: Object.freeze(user.vehicleGroupGrants.map(({ groupId }) => groupId).sort()), vehicleIds: Object.freeze(user.vehicleGrants.map(({ vehicleId }) => vehicleId).sort()) });
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

function uuidArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new AdminUsersError("INVALID_INPUT");
  const ids = value.map((item) => normalizeUuid(item));
  if (ids.some((id) => id === null) || new Set(ids).size !== ids.length) throw new AdminUsersError("INVALID_INPUT");
  return Object.freeze((ids as string[]).sort());
}

function vehicleAccess(value: unknown, required: boolean): ParsedVehicleAccess {
  if (value === undefined && !required) return Object.freeze({ mode: VehicleAccessMode.ALL, groupIds: Object.freeze([]), vehicleIds: Object.freeze([]) });
  const access = record(value); exactKeys(access, ["mode", "groupIds", "vehicleIds"]);
  if (access.mode !== VehicleAccessMode.ALL && access.mode !== VehicleAccessMode.SELECTED) throw new AdminUsersError("INVALID_INPUT");
  const groupIds = uuidArray(access.groupIds);
  const vehicleIds = uuidArray(access.vehicleIds);
  if (access.mode === VehicleAccessMode.ALL && (groupIds.length > 0 || vehicleIds.length > 0)) throw new AdminUsersError("INVALID_INPUT");
  return Object.freeze({ mode: access.mode, groupIds, vehicleIds });
}

function sameVehicleAccess(left: ParsedVehicleAccess, right: ParsedVehicleAccess): boolean {
  return left.mode === right.mode && left.groupIds.length === right.groupIds.length && left.vehicleIds.length === right.vehicleIds.length
    && left.groupIds.every((id, index) => id === right.groupIds[index]) && left.vehicleIds.every((id, index) => id === right.vehicleIds[index]);
}

function changedGrantCount(previous: readonly string[], next: readonly string[]): Readonly<{ added: number; removed: number }> {
  const previousSet = new Set(previous); const nextSet = new Set(next);
  return Object.freeze({ added: next.filter((id) => !previousSet.has(id)).length, removed: previous.filter((id) => !nextSet.has(id)).length });
}

async function validateVehicleAccessReferences(transaction: Prisma.TransactionClient, access: ParsedVehicleAccess): Promise<void> {
  if (access.mode === VehicleAccessMode.ALL) return;
  const groups = access.groupIds.length === 0 ? [] : await transaction.vehicleGroup.findMany({ where: { id: { in: [...access.groupIds] } }, select: { id: true } });
  if (groups.length !== access.groupIds.length) throw new AdminUsersError("INVALID_GROUP_REFERENCE");
  const vehicles = access.vehicleIds.length === 0 ? [] : await transaction.vehicle.findMany({ where: { id: { in: [...access.vehicleIds] } }, select: { id: true } });
  if (vehicles.length !== access.vehicleIds.length) throw new AdminUsersError("INVALID_VEHICLE_REFERENCE");
}

async function replaceVehicleAccess(transaction: Prisma.TransactionClient, userId: string, role: AuthRole, access: ParsedVehicleAccess): Promise<void> {
  await transaction.authUserVehicleGroupGrant.deleteMany({ where: { userId } });
  await transaction.authUserVehicleGrant.deleteMany({ where: { userId } });
  await transaction.authUser.update({ where: { id: userId }, data: { role, vehicleAccessMode: role === AuthRole.ADMIN ? VehicleAccessMode.ALL : access.mode } });
  if (role === AuthRole.USER && access.mode === VehicleAccessMode.SELECTED) {
    if (access.groupIds.length > 0) await transaction.authUserVehicleGroupGrant.createMany({ data: access.groupIds.map((groupId) => ({ userId, groupId })) });
    if (access.vehicleIds.length > 0) await transaction.authUserVehicleGrant.createMany({ data: access.vehicleIds.map((vehicleId) => ({ userId, vehicleId })) });
  }
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
    const users = await this.database.getClient().authUser.findMany({ orderBy: [{ normalizedLogin: "asc" }, { id: "asc" }], include: ADMIN_USER_INCLUDE });
    return Object.freeze(users.map(safeUser));
  }

  public async detail(userId: string): Promise<SafeAdminUser> {
    const user = await this.database.getClient().authUser.findUnique({ where: { id: userId }, include: ADMIN_USER_INCLUDE });
    if (!user) throw new AdminUsersError("NOT_FOUND");
    return safeUser(user);
  }

  public async create(actor: AuditUserActor, input: unknown): Promise<OneTimePasswordResult> {
    const value = record(input); exactKeys(value, ["login", "role", "permissions", "vehicleAccess"]);
    const normalizedLogin = typeof value.login === "string" ? normalizeLogin(value.login) : null;
    if (!normalizedLogin) throw new AdminUsersError("INVALID_INPUT");
    const nextRole = role(value.role);
    const nextPermissions = permissions(value.permissions, nextRole === AuthRole.USER);
    if (nextRole === AuthRole.ADMIN && nextPermissions.length > 0) throw new AdminUsersError("INVALID_INPUT");
    const nextVehicleAccess = vehicleAccess(value.vehicleAccess, nextRole === AuthRole.USER);
    if (nextRole === AuthRole.ADMIN && nextVehicleAccess.mode !== VehicleAccessMode.ALL) throw new AdminUsersError("INVALID_INPUT");
    const temporaryPassword = this.security.generatePassword();
    const material = await this.security.hashPassword(temporaryPassword);
    try {
      const user = await this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
        if (nextRole === AuthRole.ADMIN) await lockAdminCardinality(transaction);
        await validateVehicleAccessReferences(transaction, nextVehicleAccess);
        const created = await transaction.authUser.create({ data: { login: value.login as string, normalizedLogin, role: nextRole, vehicleAccessMode: nextRole === AuthRole.ADMIN ? VehicleAccessMode.ALL : nextVehicleAccess.mode, disabled: false, mustChangePassword: true, passwordHashVersion: material.version, passwordSalt: new Uint8Array(material.salt), passwordHash: new Uint8Array(material.hash) } });
        if (nextRole === AuthRole.USER && nextPermissions.length > 0) await transaction.authUserPermission.createMany({ data: nextPermissions.map((key) => ({ userId: created.id, key })) });
        if (nextRole === AuthRole.USER && nextVehicleAccess.mode === VehicleAccessMode.SELECTED) {
          if (nextVehicleAccess.groupIds.length > 0) await transaction.authUserVehicleGroupGrant.createMany({ data: nextVehicleAccess.groupIds.map((groupId) => ({ userId: created.id, groupId })) });
          if (nextVehicleAccess.vehicleIds.length > 0) await transaction.authUserVehicleGrant.createMany({ data: nextVehicleAccess.vehicleIds.map((vehicleId) => ({ userId: created.id, vehicleId })) });
        }
        const persisted = await transaction.authUser.findUniqueOrThrow({ where: { id: created.id }, include: ADMIN_USER_INCLUDE });
        await this.audit.append(transaction, buildUserCreatedAuditEvent(actor, persisted.id, {
          targetLoginSnapshot: persisted.login,
          role: persisted.role,
          permissions: effectivePermissions(persisted),
        }));
        if (nextRole === AuthRole.USER) await this.audit.append(transaction, buildUserVehicleAccessChangedAuditEvent(actor, persisted.id, {
          targetLoginSnapshot: persisted.login,
          previousMode: null,
          mode: nextVehicleAccess.mode,
          previousGroupGrantCount: 0,
          groupGrantCount: nextVehicleAccess.groupIds.length,
          previousVehicleGrantCount: 0,
          vehicleGrantCount: nextVehicleAccess.vehicleIds.length,
          addedGroupGrantCount: nextVehicleAccess.groupIds.length,
          removedGroupGrantCount: 0,
          addedVehicleGrantCount: nextVehicleAccess.vehicleIds.length,
          removedVehicleGrantCount: 0,
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
    const value = record(input); exactKeys(value, ["role", "permissions", "vehicleAccess"]);
    const nextRole = role(value.role);
    const nextPermissions = permissions(value.permissions, nextRole === AuthRole.USER);
    if (nextRole === AuthRole.ADMIN && nextPermissions.length > 0) throw new AdminUsersError("INVALID_INPUT");
    const requestedVehicleAccess = vehicleAccess(value.vehicleAccess, nextRole === AuthRole.USER);
    if (nextRole === AuthRole.ADMIN && requestedVehicleAccess.mode !== VehicleAccessMode.ALL) throw new AdminUsersError("INVALID_INPUT");
    return this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
      await lockAdminCardinality(transaction);
      const current = await transaction.authUser.findUnique({ where: { id: userId }, include: ADMIN_USER_INCLUDE });
      if (!current) throw new AdminUsersError("NOT_FOUND");
      if (actor.actorUserId === userId && current.role === AuthRole.ADMIN && nextRole === AuthRole.USER) throw new AdminUsersError("SELF_PROTECTED");
      if (current.role === AuthRole.ADMIN && !current.disabled && nextRole === AuthRole.USER) {
        const enabledAdmins = await transaction.authUser.count({ where: { role: AuthRole.ADMIN, disabled: false } });
        if (enabledAdmins <= 1) throw new AdminUsersError("LAST_ENABLED_ADMIN");
      }
      const previousPermissions = effectivePermissions(current);
      const requestedEffectivePermissions = nextRole === AuthRole.ADMIN ? PERMISSIONS : nextPermissions;
      const previousVehicleAccess = configuredVehicleAccess(current);
      const nextVehicleAccess = nextRole === AuthRole.ADMIN ? Object.freeze({ mode: VehicleAccessMode.ALL, groupIds: Object.freeze([]), vehicleIds: Object.freeze([]) }) : requestedVehicleAccess;
      const functionalAccessChanged = current.role !== nextRole || !samePermissions(previousPermissions, requestedEffectivePermissions);
      const productAccessChanged = !sameVehicleAccess(previousVehicleAccess, nextVehicleAccess);
      if (!functionalAccessChanged && !productAccessChanged) return safeUser(current);

      await validateVehicleAccessReferences(transaction, nextVehicleAccess);

      await transaction.authUserPermission.deleteMany({ where: { userId } });
      await replaceVehicleAccess(transaction, userId, nextRole, nextVehicleAccess);
      if (nextRole === AuthRole.USER && nextPermissions.length > 0) await transaction.authUserPermission.createMany({ data: nextPermissions.map((key) => ({ userId, key })) });
      const persisted = await transaction.authUser.findUniqueOrThrow({ where: { id: userId }, include: ADMIN_USER_INCLUDE });
      if (functionalAccessChanged) await this.audit.append(transaction, buildUserAccessChangedAuditEvent(actor, persisted.id, {
        targetLoginSnapshot: persisted.login,
        previousRole: current.role,
        role: persisted.role,
        previousPermissions,
        permissions: effectivePermissions(persisted),
      }));
      if (productAccessChanged) await this.audit.append(transaction, buildUserVehicleAccessChangedAuditEvent(actor, persisted.id, {
        targetLoginSnapshot: persisted.login,
        previousMode: previousVehicleAccess.mode,
        mode: nextVehicleAccess.mode,
        previousGroupGrantCount: previousVehicleAccess.groupIds.length,
        groupGrantCount: nextVehicleAccess.groupIds.length,
        previousVehicleGrantCount: previousVehicleAccess.vehicleIds.length,
        vehicleGrantCount: nextVehicleAccess.vehicleIds.length,
        addedGroupGrantCount: changedGrantCount(previousVehicleAccess.groupIds, nextVehicleAccess.groupIds).added,
        removedGroupGrantCount: changedGrantCount(previousVehicleAccess.groupIds, nextVehicleAccess.groupIds).removed,
        addedVehicleGrantCount: changedGrantCount(previousVehicleAccess.vehicleIds, nextVehicleAccess.vehicleIds).added,
        removedVehicleGrantCount: changedGrantCount(previousVehicleAccess.vehicleIds, nextVehicleAccess.vehicleIds).removed,
      }));
      return safeUser(persisted);
    });
  }

  public async disable(actor: AuditUserActor, userId: string): Promise<SafeAdminUser> {
    if (actor.actorUserId === userId) throw new AdminUsersError("SELF_PROTECTED");
    return this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
      await lockAdminCardinality(transaction);
      const current = await transaction.authUser.findUnique({ where: { id: userId }, include: ADMIN_USER_INCLUDE });
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
      return safeUser(await transaction.authUser.findUniqueOrThrow({ where: { id: userId }, include: ADMIN_USER_INCLUDE }));
    });
  }

  public async enable(actor: AuditUserActor, userId: string): Promise<SafeAdminUser> {
    return this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
      await lockAdminCardinality(transaction);
      const current = await transaction.authUser.findUnique({ where: { id: userId }, include: ADMIN_USER_INCLUDE });
      if (!current) throw new AdminUsersError("NOT_FOUND");
      if (current.disabled) {
        await transaction.authUser.update({ where: { id: userId }, data: { disabled: false } });
        await this.audit.append(transaction, buildUserEnabledAuditEvent(actor, userId, current.login));
      }
      return safeUser(await transaction.authUser.findUniqueOrThrow({ where: { id: userId }, include: ADMIN_USER_INCLUDE }));
    });
  }

  public async resetPassword(actor: AuditUserActor, userId: string): Promise<OneTimePasswordResult> {
    if (actor.actorUserId === userId) throw new AdminUsersError("SELF_PROTECTED");
    const temporaryPassword = this.security.generatePassword();
    const material = await this.security.hashPassword(temporaryPassword);
    const user = await this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
      const current = await transaction.authUser.findUnique({ where: { id: userId }, include: ADMIN_USER_INCLUDE });
      if (!current) throw new AdminUsersError("NOT_FOUND");
      await transaction.authUser.update({ where: { id: userId }, data: { passwordHashVersion: material.version, passwordSalt: new Uint8Array(material.salt), passwordHash: new Uint8Array(material.hash), passwordChangedAt: new Date(), mustChangePassword: true } });
      await transaction.authSession.deleteMany({ where: { userId } });
      await this.audit.append(transaction, buildUserPasswordResetAuditEvent(actor, userId, current.login));
      return transaction.authUser.findUniqueOrThrow({ where: { id: userId }, include: ADMIN_USER_INCLUDE });
    });
    return Object.freeze({ user: safeUser(user), temporaryPassword });
  }
}
