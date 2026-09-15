import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { AuthRole, VehicleAccessMode } from "../../generated/prisma/enums";
import { DatabaseService } from "../database/database.service";
import type { GroupFilter, VehicleScope } from "./vehicle-access.types";

export class VehicleScopeSubjectNotFoundError extends Error {
  public constructor() { super("Vehicle scope subject does not exist"); this.name = "VehicleScopeSubjectNotFoundError"; }
}

export const UNRESTRICTED_VEHICLE_SCOPE: VehicleScope = Object.freeze({ kind: "UNRESTRICTED" });

export const UNGROUPED_GROUP_FILTER_VALUE = "ungrouped";

const GROUP_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseGroupFilterParam(value: unknown): GroupFilter | null {
  if (value === undefined) return Object.freeze({ kind: "ALL" });
  if (value === UNGROUPED_GROUP_FILTER_VALUE) return Object.freeze({ kind: "UNGROUPED" });
  if (typeof value === "string" && GROUP_ID_PATTERN.test(value)) return Object.freeze({ kind: "GROUP", groupId: value });
  return null;
}

export function groupVehicleWhere(filter: GroupFilter): Prisma.VehicleWhereInput {
  if (filter.kind === "ALL") return {};
  if (filter.kind === "UNGROUPED") return { groupId: null };
  return { groupId: filter.groupId };
}

export function groupAlertEventWhere(filter: GroupFilter): Prisma.AlertEventWhereInput {
  if (filter.kind === "ALL") return {};
  if (filter.kind === "UNGROUPED") return { vehicle: { groupId: null } };
  return { vehicle: { groupId: filter.groupId } };
}

export function selectedVehicleWhere(userId: string): Prisma.VehicleWhereInput {
  return {
    OR: [
      { accessGrants: { some: { userId } } },
      { group: { is: { userGrants: { some: { userId } } } } },
    ],
  };
}

export function applyVehicleScope(scope: VehicleScope, where: Prisma.VehicleWhereInput = {}): Prisma.VehicleWhereInput {
  return scope.kind === "UNRESTRICTED" ? where : { AND: [where, scope.where] };
}

export function applyAlertEventScope(scope: VehicleScope, where: Prisma.AlertEventWhereInput = {}): Prisma.AlertEventWhereInput {
  return scope.kind === "UNRESTRICTED" ? where : { AND: [where, { vehicle: scope.where }] };
}

export function applyObservationScope(scope: VehicleScope, where: Prisma.VehiclePositionObservationWhereInput = {}): Prisma.VehiclePositionObservationWhereInput {
  return scope.kind === "UNRESTRICTED" ? where : { AND: [where, { vehicle: scope.where }] };
}

export function usersWithProductAccessToVehicleWhere(vehicleId: string): Prisma.AuthUserWhereInput {
  return {
    OR: [
      { role: AuthRole.ADMIN },
      { vehicleAccessMode: VehicleAccessMode.ALL },
      {
        AND: [
          { vehicleAccessMode: VehicleAccessMode.SELECTED },
          {
            OR: [
              { vehicleGrants: { some: { vehicleId } } },
              { vehicleGroupGrants: { some: { group: { vehicles: { some: { id: vehicleId } } } } } },
            ],
          },
        ],
      },
    ],
  };
}

export function authorizedNotificationSelectionWhere(userId: string, scope: VehicleScope): Prisma.UserNotificationVehicleWhereInput {
  return scope.kind === "UNRESTRICTED" ? { userId } : { userId, vehicle: scope.where };
}

@Injectable()
export class VehicleScopeService {
  public constructor(private readonly database: DatabaseService) {}

  public async resolve(userId: string): Promise<VehicleScope> {
    const user = await this.database.getClient().authUser.findUnique({ where: { id: userId }, select: { role: true, vehicleAccessMode: true } });
    if (!user) throw new VehicleScopeSubjectNotFoundError();
    if (user.role === AuthRole.ADMIN || user.vehicleAccessMode === VehicleAccessMode.ALL) return UNRESTRICTED_VEHICLE_SCOPE;
    return Object.freeze({ kind: "FILTERED", where: selectedVehicleWhere(userId) });
  }

  public async canAccess(userId: string, vehicleId: string): Promise<boolean> {
    return this.database.getClient().$transaction(async (transaction) => {
      const user = await transaction.authUser.findUnique({ where: { id: userId }, select: { role: true, vehicleAccessMode: true } });
      if (!user) throw new VehicleScopeSubjectNotFoundError();
      if (user.role === AuthRole.ADMIN || user.vehicleAccessMode === VehicleAccessMode.ALL) return (await transaction.vehicle.count({ where: { id: vehicleId } })) > 0;
      return (await transaction.vehicle.count({ where: { AND: [{ id: vehicleId }, selectedVehicleWhere(userId)] } })) > 0;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
