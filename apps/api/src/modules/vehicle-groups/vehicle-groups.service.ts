import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client";
import { normalizeUuid } from "../../common/uuid.validation";
import { AuditEventRepository, buildVehicleGroupCreatedAuditEvent, buildVehicleGroupDeletedAuditEvent, buildVehicleGroupMembershipChangedAuditEvent, buildVehicleGroupRenamedAuditEvent, type AuditUserActor } from "../audit";
import { DatabaseService } from "../database/database.service";
import type { VehicleGroupDetail, VehicleGroupSummary } from "./vehicle-groups.types";

export type VehicleGroupsErrorCode = "INVALID_INPUT" | "DUPLICATE_NAME" | "NOT_FOUND" | "INVALID_VEHICLE_REFERENCE";
export class VehicleGroupsError extends Error {
  public constructor(public readonly code: VehicleGroupsErrorCode) { super(code); this.name = "VehicleGroupsError"; }
}

const DETAIL_INCLUDE = Object.freeze({
  vehicles: Object.freeze({ orderBy: Object.freeze([{ name: "asc" }, { id: "asc" }]), select: Object.freeze({ id: true, name: true, externalDeviceId: true, disabled: true }) }),
  _count: Object.freeze({ select: Object.freeze({ vehicles: true, userGrants: true }) }),
}) as unknown as Prisma.VehicleGroupInclude;

function record(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new VehicleGroupsError("INVALID_INPUT");
  return input as Record<string, unknown>;
}

function exactKeys(input: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(input).length !== allowed.length || Object.keys(input).some((key) => !allowed.includes(key))) throw new VehicleGroupsError("INVALID_INPUT");
}

function groupName(input: unknown): string {
  if (typeof input !== "string") throw new VehicleGroupsError("INVALID_INPUT");
  const name = input.trim();
  if (name.length === 0 || name.length > 128) throw new VehicleGroupsError("INVALID_INPUT");
  return name;
}

function vehicleIds(input: unknown): readonly string[] {
  if (!Array.isArray(input)) throw new VehicleGroupsError("INVALID_INPUT");
  const ids = input.map((value) => normalizeUuid(value));
  if (ids.some((id) => id === null) || new Set(ids).size !== ids.length) throw new VehicleGroupsError("INVALID_INPUT");
  return Object.freeze((ids as string[]).sort());
}

function duplicate(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function lockGroup(transaction: Prisma.TransactionClient, groupId: string): Promise<void> {
  const rows = await transaction.$queryRaw<readonly Readonly<{ id: string }>[]>`SELECT "id" FROM "vehicle_groups" WHERE "id" = ${groupId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new VehicleGroupsError("NOT_FOUND");
}

function summary(row: any): VehicleGroupSummary {
  return Object.freeze({ id: row.id, name: row.name, vehicleCount: row._count.vehicles, userGrantCount: row._count.userGrants, createdAt: row.createdAt, updatedAt: row.updatedAt });
}

function detail(row: any): VehicleGroupDetail {
  return Object.freeze({ ...summary(row), vehicles: Object.freeze(row.vehicles.map((vehicle: object) => Object.freeze({ ...vehicle }))) });
}

@Injectable()
export class VehicleGroupsService {
  public constructor(private readonly database: DatabaseService, private readonly audit: AuditEventRepository) {}

  public async list(): Promise<readonly VehicleGroupSummary[]> {
    const groups = await this.database.getClient().vehicleGroup.findMany({ orderBy: [{ normalizedName: "asc" }, { id: "asc" }], include: { _count: { select: { vehicles: true, userGrants: true } } } });
    return Object.freeze(groups.map(summary));
  }

  public async detail(groupId: string): Promise<VehicleGroupDetail> {
    const group = await this.database.getClient().vehicleGroup.findUnique({ where: { id: groupId }, include: DETAIL_INCLUDE });
    if (!group) throw new VehicleGroupsError("NOT_FOUND");
    return detail(group);
  }

  public async create(actor: AuditUserActor, input: unknown): Promise<VehicleGroupDetail> {
    const value = record(input); exactKeys(value, ["name"]); const name = groupName(value.name);
    try {
      return await this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
        const created = await transaction.vehicleGroup.create({ data: { name }, include: DETAIL_INCLUDE });
        await this.audit.append(transaction, buildVehicleGroupCreatedAuditEvent(actor, created.id, { name: created.name }));
        return detail(created);
      });
    } catch (error) {
      if (duplicate(error)) throw new VehicleGroupsError("DUPLICATE_NAME");
      throw error;
    }
  }

  public async rename(actor: AuditUserActor, groupId: string, input: unknown): Promise<VehicleGroupDetail> {
    const value = record(input); exactKeys(value, ["name"]); const name = groupName(value.name);
    try {
      return await this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
        await lockGroup(transaction, groupId);
        const current = await transaction.vehicleGroup.findUnique({ where: { id: groupId }, include: DETAIL_INCLUDE });
        if (!current) throw new VehicleGroupsError("NOT_FOUND");
        if (current.name === name) return detail(current);
        const renamed = await transaction.vehicleGroup.update({ where: { id: groupId }, data: { name }, include: DETAIL_INCLUDE });
        await this.audit.append(transaction, buildVehicleGroupRenamedAuditEvent(actor, groupId, { previousName: current.name, name: renamed.name }));
        return detail(renamed);
      });
    } catch (error) {
      if (duplicate(error)) throw new VehicleGroupsError("DUPLICATE_NAME");
      throw error;
    }
  }

  public async replaceVehicles(actor: AuditUserActor, groupId: string, input: unknown): Promise<VehicleGroupDetail> {
    const value = record(input); exactKeys(value, ["vehicleIds"]); const desired = vehicleIds(value.vehicleIds);
    return this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
      await lockGroup(transaction, groupId);
      const current = await transaction.vehicleGroup.findUnique({ where: { id: groupId }, include: DETAIL_INCLUDE });
      if (!current) throw new VehicleGroupsError("NOT_FOUND");
      const referenced = desired.length === 0 ? [] : await transaction.vehicle.findMany({ where: { id: { in: [...desired] } }, select: { id: true } });
      if (referenced.length !== desired.length) throw new VehicleGroupsError("INVALID_VEHICLE_REFERENCE");
      const previous = new Set<string>(current.vehicles.map((vehicle: { id: string }) => vehicle.id));
      const next = new Set(desired);
      const addedCount = desired.filter((id) => !previous.has(id)).length;
      const removedCount = [...previous].filter((id) => !next.has(id)).length;
      if (addedCount === 0 && removedCount === 0) return detail(current);
      await transaction.vehicle.updateMany({ where: { groupId, ...(desired.length > 0 ? { id: { notIn: [...desired] } } : {}) }, data: { groupId: null } });
      if (desired.length > 0) await transaction.vehicle.updateMany({ where: { id: { in: [...desired] } }, data: { groupId } });
      const persisted = await transaction.vehicleGroup.findUniqueOrThrow({ where: { id: groupId }, include: DETAIL_INCLUDE });
      await this.audit.append(transaction, buildVehicleGroupMembershipChangedAuditEvent(actor, groupId, { name: persisted.name, addedCount, removedCount }));
      return detail(persisted);
    });
  }

  public async delete(actor: AuditUserActor, groupId: string): Promise<void> {
    await this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
      await lockGroup(transaction, groupId);
      const current = await transaction.vehicleGroup.findUnique({ where: { id: groupId }, include: { _count: { select: { vehicles: true, userGrants: true } } } });
      if (!current) throw new VehicleGroupsError("NOT_FOUND");
      await transaction.vehicleGroup.delete({ where: { id: groupId } });
      await this.audit.append(transaction, buildVehicleGroupDeletedAuditEvent(actor, groupId, { name: current.name, vehicleCount: current._count.vehicles, userGrantCount: current._count.userGrants }));
    });
  }
}
