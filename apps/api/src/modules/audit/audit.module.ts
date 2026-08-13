import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuditEventRepository } from "./audit.repository";

@Module({
  imports: [DatabaseModule],
  providers: [AuditEventRepository],
  exports: [AuditEventRepository],
})
export class AuditModule {}
