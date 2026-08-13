import type { AuditActorType, AuditEventType, AuditTargetType, AuthRole } from "../../generated/prisma/enums";
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
  | Readonly<{ status: "AVAILABLE"; canonicalAnchor: string; policyCutoff: string; deletedCheckpoints: number; deletedObservations: number; remainingFullyObsoleteCheckpoints: number; remainingExecutableObservationCandidates: number; stoppedByBudget: boolean }>;

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
