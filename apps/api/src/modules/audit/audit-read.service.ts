import { Inject, Injectable } from "@nestjs/common";
import { AuditActorType, AuditEventType, AuditTargetType } from "../../generated/prisma/enums";
import { normalizeUuid } from "../../common/uuid.validation";
import { LOGIN_PATTERN } from "../auth/login";
import { parseAuditEventDetails } from "./audit-events";
import type { AuditReadQuery } from "./audit-read.query";
import type { AuditReadRepository, StoredAuditReadRow } from "./audit-read.repository";
import { AUDIT_READ_REPOSITORY } from "./audit-read.tokens";
import type { AuditReadActor, AuditReadDetails, AuditReadItem, AuditReadResponse, AuditReadTarget } from "./audit-read.types";
import { encodeAuditReadCursor } from "./audit-read.query";

export class AuditReadStateError extends Error {
  public constructor() {
    super("Invalid persisted audit read state");
    this.name = "AuditReadStateError";
  }
}

function actor(row: StoredAuditReadRow): AuditReadActor {
  const systemEvent = row.eventType === AuditEventType.SYSTEM_POPULATION_CREATED || row.eventType === AuditEventType.AUTOMATIC_RETENTION_EXECUTED;
  if (row.actorType === AuditActorType.SYSTEM && row.actorLoginSnapshot === null && systemEvent) return Object.freeze({ type: AuditActorType.SYSTEM });
  if (row.actorType === AuditActorType.USER && typeof row.actorLoginSnapshot === "string" && LOGIN_PATTERN.test(row.actorLoginSnapshot) && !systemEvent) {
    return Object.freeze({ type: AuditActorType.USER, login: row.actorLoginSnapshot });
  }
  throw new AuditReadStateError();
}

function target(row: StoredAuditReadRow): AuditReadTarget {
  const id = row.targetId === null ? null : normalizeUuid(row.targetId);
  const valid = (() => {
    switch (row.eventType) {
      case AuditEventType.USER_CREATED:
      case AuditEventType.USER_ACCESS_CHANGED:
      case AuditEventType.USER_DISABLED:
      case AuditEventType.USER_ENABLED:
      case AuditEventType.USER_PASSWORD_RESET:
      case AuditEventType.OWN_PASSWORD_CHANGED:
        return row.targetType === AuditTargetType.USER && id !== null;
      case AuditEventType.SHORT_POPULATION_EXECUTED:
        return row.targetType === AuditTargetType.POSITION_HISTORY && row.targetId === null;
      case AuditEventType.DURABLE_POPULATION_CREATED:
      case AuditEventType.SYSTEM_POPULATION_CREATED:
        return row.targetType === AuditTargetType.POSITION_HISTORY_POPULATION_RUN && id !== null;
      case AuditEventType.RETENTION_EXECUTED:
      case AuditEventType.AUTOMATIC_RETENTION_EXECUTED:
        return row.targetType === AuditTargetType.POSITION_HISTORY_RETENTION && row.targetId === null;
      default:
        return false;
    }
  })();
  if (!valid) throw new AuditReadStateError();
  return Object.freeze({ type: row.targetType, id });
}

function details(row: StoredAuditReadRow): AuditReadDetails {
  try {
    const validated = parseAuditEventDetails(row.eventType, row.details);
    return Object.freeze({ status: "AVAILABLE", ...validated }) as AuditReadDetails;
  } catch {
    return Object.freeze({ status: "UNAVAILABLE" });
  }
}

function item(row: StoredAuditReadRow): AuditReadItem {
  const id = normalizeUuid(row.id);
  if (id === null || !(row.createdAt instanceof Date) || !Number.isFinite(row.createdAt.getTime())) throw new AuditReadStateError();
  return Object.freeze({ id, createdAt: row.createdAt.toISOString(), eventType: row.eventType, actor: actor(row), target: target(row), details: details(row) });
}

@Injectable()
export class AuditReadService {
  public constructor(@Inject(AUDIT_READ_REPOSITORY) private readonly repository: AuditReadRepository) {}

  public async list(query: AuditReadQuery): Promise<AuditReadResponse> {
    const page = await this.repository.list(query);
    const items = Object.freeze(page.rows.map(item));
    const last = page.rows.at(-1);
    const nextCursor = page.hasMore && last !== undefined ? encodeAuditReadCursor({ createdAt: last.createdAt, id: last.id }) : null;
    return Object.freeze({ items, nextCursor, hasMore: page.hasMore });
  }
}

export const auditReadServiceInternals = Object.freeze({ item });
