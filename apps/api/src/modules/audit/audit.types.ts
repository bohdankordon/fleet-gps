import { AuditActorType, AuditEventType, AuditTargetType } from "../../generated/prisma/enums";

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

export type AuditEventSpec =
  | Readonly<{
      eventType: typeof AuditEventType.USER_DISABLED;
      actor: AuditUserActor;
      targetType: typeof AuditTargetType.USER;
      targetId: string;
      details: UserDisabledAuditDetails;
    }>
  | Readonly<{
      eventType: typeof AuditEventType.DURABLE_POPULATION_CREATED;
      actor: AuditUserActor;
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
    }>;
