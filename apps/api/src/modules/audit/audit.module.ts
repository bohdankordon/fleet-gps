import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuditEventRepository } from "./audit.repository";
import { AuditReadController } from "./audit-read.controller";
import { AuditReadService } from "./audit-read.service";
import { AUDIT_READ_REPOSITORY } from "./audit-read.tokens";
import { PrismaAuditReadRepository } from "./prisma-audit-read.repository";

@Module({
  imports: [DatabaseModule],
  controllers: [AuditReadController],
  providers: [AuditEventRepository, PrismaAuditReadRepository, { provide: AUDIT_READ_REPOSITORY, useExisting: PrismaAuditReadRepository }, AuditReadService],
  exports: [AuditEventRepository],
})
export class AuditModule {}
