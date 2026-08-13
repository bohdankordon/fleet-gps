import { Injectable } from "@nestjs/common";
import type { AuditEvent, Prisma, PrismaClient } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { parseAuditEventSpec } from "./audit-events";
import type { AuditEventSpec } from "./audit.types";

export type AuditClient = Pick<PrismaClient, "auditEvent"> | Pick<Prisma.TransactionClient, "auditEvent">;

@Injectable()
export class AuditEventRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async append(client: AuditClient, event: AuditEventSpec): Promise<AuditEvent> {
    const spec = parseAuditEventSpec(event);
    return client.auditEvent.create({ data: this.toCreateInput(spec) });
  }

  public async appendWithDatabase(event: AuditEventSpec): Promise<AuditEvent> {
    return this.append(this.database.getClient(), event);
  }

  private toCreateInput(spec: AuditEventSpec): Prisma.AuditEventUncheckedCreateInput {
    return {
      eventType: spec.eventType,
      actorType: spec.actor.actorType,
      actorUserId: spec.actor.actorUserId,
      actorLoginSnapshot: spec.actor.actorLoginSnapshot,
      targetType: spec.targetType,
      targetId: spec.targetId,
      details: spec.details as Prisma.InputJsonValue,
    };
  }
}
