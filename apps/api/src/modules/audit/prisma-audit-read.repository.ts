import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import type { AuditReadQuery } from "./audit-read.query";
import type { AuditReadRepository, StoredAuditReadPage, StoredAuditReadRow } from "./audit-read.repository";
import { AUDIT_READ_PAGE_SIZE } from "./audit-read.types";

const auditReadSelect = {
  id: true,
  eventType: true,
  actorType: true,
  actorLoginSnapshot: true,
  targetType: true,
  targetId: true,
  details: true,
  createdAt: true,
} satisfies Prisma.AuditEventSelect;

@Injectable()
export class PrismaAuditReadRepository implements AuditReadRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async list(query: AuditReadQuery): Promise<StoredAuditReadPage> {
    const createdAt = query.from === undefined && query.to === undefined ? undefined : {
      ...(query.from === undefined ? {} : { gte: query.from }),
      ...(query.to === undefined ? {} : { lte: query.to }),
    };
    const rows = await this.database.getClient().auditEvent.findMany({
      where: {
        ...(query.eventType === undefined ? {} : { eventType: query.eventType }),
        ...(query.actorType === undefined ? {} : { actorType: query.actorType }),
        ...(query.targetType === undefined ? {} : { targetType: query.targetType }),
        ...(createdAt === undefined ? {} : { createdAt }),
        ...(query.cursor === undefined ? {} : {
          OR: [
            { createdAt: { lt: query.cursor.createdAt } },
            { createdAt: query.cursor.createdAt, id: { lt: query.cursor.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: AUDIT_READ_PAGE_SIZE + 1,
      select: auditReadSelect,
    });
    return Object.freeze({ rows: Object.freeze(rows.slice(0, AUDIT_READ_PAGE_SIZE)) as readonly StoredAuditReadRow[], hasMore: rows.length > AUDIT_READ_PAGE_SIZE });
  }
}

export const auditReadSelectForTests = auditReadSelect;
