import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseModule } from "../database/database.module";
import { AuditModule } from "./audit.module";
import { AuditEventRepository } from "./audit.repository";
import { AuditReadController } from "./audit-read.controller";
import { AuditReadService } from "./audit-read.service";
import { AUDIT_READ_REPOSITORY } from "./audit-read.tokens";
import { PrismaAuditReadRepository } from "./prisma-audit-read.repository";

test("audit module keeps the writer append-only while composing one internal read endpoint", () => {
  assert.deepEqual(Reflect.getMetadata("imports", AuditModule), [DatabaseModule]);
  assert.deepEqual(Reflect.getMetadata("controllers", AuditModule), [AuditReadController]);
  assert.deepEqual(Reflect.getMetadata("providers", AuditModule), [AuditEventRepository, PrismaAuditReadRepository, { provide: AUDIT_READ_REPOSITORY, useExisting: PrismaAuditReadRepository }, AuditReadService]);
  assert.deepEqual(Reflect.getMetadata("exports", AuditModule), [AuditEventRepository]);
});
