import type { AuditActorType, AuditEventType, AuditTargetType, AuthRole, VehicleAccessMode, VehicleGroupColor } from "../../generated/prisma/enums";
import type { Permission } from "../auth/permissions";

export const AUDIT_READ_PAGE_SIZE = 50;

export type AuditReadActor =
  | Readonly<{ type: typeof AuditActorType.USER; login: string }>
  | Readonly<{ type: typeof AuditActorType.SYSTEM }>;

export type AuditReadTarget = Readonly<{ type: AuditTargetType; id: string | null }>;

export type AuditReadDetails =
  | Readonly<{ status: "UNAVAILABLE" }>
  | Readonly<{ status: "AVAILABLE"; targetLoginSnapshot: string; role: AuthRole; permissions: readonly Permission[] }>
  | Readonly<{ status: "AVAILABLE"; targetLoginSnapshot: string; previousRole: AuthRole; role: AuthRole; previousPermissions: readonly Permission[]; permissions: readonly Permission[] }>
  | Readonly<{ status: "AVAILABLE"; targetLoginSnapshot: string }>
  | Readonly<{ status: "AVAILABLE" }>
  | Readonly<{ status: "AVAILABLE"; to: string; windowBudget: number; excludeProviderDisabled: boolean; committedWindows: number }>
  | Readonly<{ status: "AVAILABLE"; to: string; windowBudget: number; excludeProviderDisabled: boolean }>
  | Readonly<{ status: "AVAILABLE"; canonicalAnchor: string; policyCutoff: string; deletedCheckpoints: number; deletedObservations: number; remainingFullyObsoleteCheckpoints: number; remainingExecutableObservationCandidates: number; stoppedByBudget: boolean }>
  | Readonly<{ status: "AVAILABLE"; changes: readonly Readonly<{ field: string; previous: string | number | boolean | null; next: string | number | boolean | null }>[] }>
  | Readonly<{ status: "AVAILABLE"; name: string; color: VehicleGroupColor }>
  | Readonly<{ status: "AVAILABLE"; previousName: string; name: string }>
  | Readonly<{ status: "AVAILABLE"; previousName: string; name: string; previousColor: VehicleGroupColor; color: VehicleGroupColor }>
  | Readonly<{ status: "AVAILABLE"; name: string; addedCount: number; removedCount: number }>
  | Readonly<{ status: "AVAILABLE"; name: string; vehicleCount: number; userGrantCount: number }>
  | Readonly<{ status: "AVAILABLE"; targetLoginSnapshot: string; previousMode: VehicleAccessMode | null; mode: VehicleAccessMode; previousGroupGrantCount: number; groupGrantCount: number; previousVehicleGrantCount: number; vehicleGrantCount: number; addedGroupGrantCount: number; removedGroupGrantCount: number; addedVehicleGrantCount: number; removedVehicleGrantCount: number }>;

export type AuditReadItem = Readonly<{
  id: string;
  createdAt: string;
  eventType: AuditEventType;
  actor: AuditReadActor;
  target: AuditReadTarget;
  details: AuditReadDetails;
}>;

export type AuditReadResponse = Readonly<{
  items: readonly AuditReadItem[];
  nextCursor: string | null;
  hasMore: boolean;
}>;
