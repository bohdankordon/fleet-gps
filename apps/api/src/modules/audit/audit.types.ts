import { AuditActorType, AuditEventType, AuditTargetType, AuthRole } from "../../generated/prisma/enums";
import type { Permission } from "../auth/permissions";

export type AuditUserActor = Readonly<{
  actorType: typeof AuditActorType.USER;
  actorUserId: string;
  actorLoginSnapshot: string;
}>;

export type AuditSystemActor = Readonly<{
  actorType: typeof AuditActorType.SYSTEM;
  actorUserId: null;
  actorLoginSnapshot: null;
}>;

export type AuditActor = AuditUserActor | AuditSystemActor;

export type UserDisabledAuditDetails = Readonly<{
  targetLoginSnapshot: string;
}>;

export type UserCreatedAuditDetails = Readonly<{
  targetLoginSnapshot: string;
  role: AuthRole;
  permissions: readonly Permission[];
}>;

export type UserAccessChangedAuditDetails = Readonly<{
  targetLoginSnapshot: string;
  previousRole: AuthRole;
  role: AuthRole;
  previousPermissions: readonly Permission[];
  permissions: readonly Permission[];
}>;

export type DurablePopulationCreatedAuditDetails = Readonly<{
  to: string;
  windowBudget: number;
  excludeProviderDisabled: boolean;
}>;

export type RetentionExecutedAuditDetails = Readonly<{
  canonicalAnchor: string;
  policyCutoff: string;
  deletedCheckpoints: number;
  deletedObservations: number;
  remainingFullyObsoleteCheckpoints: number;
  remainingExecutableObservationCandidates: number;
  stoppedByBudget: boolean;
}>;

export type ShortPopulationExecutedAuditDetails = Readonly<{
  to: string;
  windowBudget: number;
  excludeProviderDisabled: boolean;
  committedWindows: number;
}>;

export type SettingsUpdatedAuditDetails = Readonly<{
  changes: readonly Readonly<{ field: string; previous: string | number | boolean | null; next: string | number | boolean | null }>[];
}>;

export type AuditEventSpec =
  | Readonly<{
      eventType: typeof AuditEventType.USER_CREATED;
      actor: AuditUserActor;
      targetType: typeof AuditTargetType.USER;
      targetId: string;
      details: UserCreatedAuditDetails;
    }>
  | Readonly<{
      eventType: typeof AuditEventType.USER_ACCESS_CHANGED;
      actor: AuditUserActor;
      targetType: typeof AuditTargetType.USER;
      targetId: string;
      details: UserAccessChangedAuditDetails;
    }>
  | Readonly<{
      eventType: typeof AuditEventType.USER_DISABLED;
      actor: AuditUserActor;
      targetType: typeof AuditTargetType.USER;
      targetId: string;
      details: UserDisabledAuditDetails;
    }>
  | Readonly<{
      eventType: typeof AuditEventType.USER_ENABLED | typeof AuditEventType.USER_PASSWORD_RESET;
      actor: AuditUserActor;
      targetType: typeof AuditTargetType.USER;
      targetId: string;
      details: UserDisabledAuditDetails;
    }>
  | Readonly<{
      eventType: typeof AuditEventType.OWN_PASSWORD_CHANGED;
      actor: AuditUserActor;
      targetType: typeof AuditTargetType.USER;
      targetId: string;
      details: Readonly<Record<string, never>>;
    }>
  | Readonly<{
      eventType: typeof AuditEventType.SHORT_POPULATION_EXECUTED;
      actor: AuditUserActor;
      targetType: typeof AuditTargetType.POSITION_HISTORY;
      targetId: null;
      details: ShortPopulationExecutedAuditDetails;
    }>
  | Readonly<{
      eventType: typeof AuditEventType.DURABLE_POPULATION_CREATED;
      actor: AuditUserActor;
      targetType: typeof AuditTargetType.POSITION_HISTORY_POPULATION_RUN;
      targetId: string;
      details: DurablePopulationCreatedAuditDetails;
    }>
  | Readonly<{
      eventType: typeof AuditEventType.SYSTEM_POPULATION_CREATED;
      actor: AuditSystemActor;
      targetType: typeof AuditTargetType.POSITION_HISTORY_POPULATION_RUN;
      targetId: string;
      details: DurablePopulationCreatedAuditDetails;
    }>
  | Readonly<{
      eventType: typeof AuditEventType.RETENTION_EXECUTED;
      actor: AuditUserActor;
      targetType: typeof AuditTargetType.POSITION_HISTORY_RETENTION;
      targetId: null;
      details: RetentionExecutedAuditDetails;
    }>
  | Readonly<{
      eventType: typeof AuditEventType.AUTOMATIC_RETENTION_EXECUTED;
      actor: AuditSystemActor;
      targetType: typeof AuditTargetType.POSITION_HISTORY_RETENTION;
      targetId: null;
      details: RetentionExecutedAuditDetails;
    }>
  | Readonly<{
      eventType: typeof AuditEventType.SETTINGS_UPDATED;
      actor: AuditUserActor;
      targetType: typeof AuditTargetType.APPLICATION_SETTINGS;
      targetId: "1";
      details: SettingsUpdatedAuditDetails;
    }>
  | Readonly<{
      eventType: typeof AuditEventType.TELEGRAM_LINKED | typeof AuditEventType.TELEGRAM_DISCONNECTED;
      actor: AuditUserActor;
      targetType: typeof AuditTargetType.USER;
      targetId: string;
      details: Readonly<Record<string, never>>;
    }>;

export type AuditEventDetails = AuditEventSpec["details"];
