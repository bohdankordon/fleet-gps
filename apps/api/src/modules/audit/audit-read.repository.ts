import type { AuditActorType, AuditEventType, AuditTargetType } from "../../generated/prisma/enums";
import type { AuditReadQuery } from "./audit-read.query";

export type StoredAuditReadRow = Readonly<{
  id: string;
  eventType: AuditEventType;
  actorType: AuditActorType;
  actorLoginSnapshot: string | null;
  targetType: AuditTargetType;
  targetId: string | null;
  details: unknown;
  createdAt: Date;
}>;

export type StoredAuditReadPage = Readonly<{ rows: readonly StoredAuditReadRow[]; hasMore: boolean }>;

export interface AuditReadRepository {
  list(query: AuditReadQuery): Promise<StoredAuditReadPage>;
}
