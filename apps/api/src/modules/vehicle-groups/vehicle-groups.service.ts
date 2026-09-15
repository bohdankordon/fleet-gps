import { Injectable } from "@nestjs/common";
import { VehicleGroupColor, type Prisma } from "../../generated/prisma/client";
import { normalizeUuid } from "../../common/uuid.validation";
import { AuditEventRepository, buildVehicleGroupCreatedAuditEvent, buildVehicleGroupDeletedAuditEvent, buildVehicleGroupMembershipChangedAuditEvent, buildVehicleGroupUpdatedAuditEvent, type AuditUserActor } from "../audit";
import { DatabaseService } from "../database/database.service";
import type { VehicleGroupDetail, VehicleGroupManagedVehicle, VehicleGroupSummary } from "./vehicle-groups.types";

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
function groupColor(input: unknown): VehicleGroupColor {
  if (typeof input !== "string" || !(Object.values(VehicleGroupColor) as readonly string[]).includes(input)) throw new VehicleGroupsError("INVALID_INPUT");
  return input as VehicleGroupColor;
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
  return Object.freeze({ id: row.id, name: row.name, color: row.color as VehicleGroupColor, vehicleCount: row._count.vehicles, userGrantCount: row._count.userGrants, createdAt: row.createdAt, updatedAt: row.updatedAt });
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
    const value = record(input); exactKeys(value, ["name", "color"]); const name = groupName(value.name); const color = groupColor(value.color);
    try {
      return await this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
        const created = await transaction.vehicleGroup.create({ data: { name, color }, include: DETAIL_INCLUDE });
        await this.audit.append(transaction, buildVehicleGroupCreatedAuditEvent(actor, created.id, { name: created.name, color: created.color as VehicleGroupColor }));
        return detail(created);
      });
    } catch (error) {
      if (duplicate(error)) throw new VehicleGroupsError("DUPLICATE_NAME");
      throw error;
    }
  }

  public async updateDetails(actor: AuditUserActor, groupId: string, input: unknown): Promise<VehicleGroupDetail> {
    const value = record(input);
    const keys = Object.keys(value);
    if (keys.length === 0 || keys.some((key) => key !== "name" && key !== "color")) throw new VehicleGroupsError("INVALID_INPUT");
    const name = value.name === undefined ? undefined : groupName(value.name);
    const color = value.color === undefined ? undefined : groupColor(value.color);
    try {
      return await this.database.getClient().$transaction(async (transaction: Prisma.TransactionClient) => {
        await lockGroup(transaction, groupId);
        const current = await transaction.vehicleGroup.findUnique({ where: { id: groupId }, include: DETAIL_INCLUDE });
        if (!current) throw new VehicleGroupsError("NOT_FOUND");
        const nextName = name ?? current.name;
        const nextColor = (color ?? current.color) as VehicleGroupColor;
        if (current.name === nextName && (current.color as VehicleGroupColor) === nextColor) return detail(current);
        const updated = await transaction.vehicleGroup.update({ where: { id: groupId }, data: { name: nextName, color: nextColor }, include: DETAIL_INCLUDE });
        await this.audit.append(transaction, buildVehicleGroupUpdatedAuditEvent(actor, groupId, { previousName: current.name, name: updated.name, previousColor: current.color as VehicleGroupColor, color: updated.color as VehicleGroupColor }));
        return detail(updated);
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
  public async listVehiclesForAdmin(): Promise<readonly VehicleGroupManagedVehicle[]> {
    const vehicles = await this.database.getClient().vehicle.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, disabled: true, groupId: true } });
    return Object.freeze(vehicles.map((vehicle) => Object.freeze({ ...vehicle })));
  }
}
