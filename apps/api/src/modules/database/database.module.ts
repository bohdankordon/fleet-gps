import { Module } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import type { ApiConfig, DatabaseConfig } from "../../config/api-config";
import { ApiConfigModule } from "../../config/api-config.module";
import { API_CONFIG } from "../../config/api-config.tokens";
import { DatabaseReadinessService } from "./database-readiness.service";
import { DatabaseService } from "./database.service";
import { DATABASE_CLIENT_FACTORY, DATABASE_CONFIG } from "./database.tokens";

@Module({
  imports: [ApiConfigModule],
  providers: [
    { provide: DATABASE_CONFIG, useFactory: (config: ApiConfig): DatabaseConfig => config.database, inject: [API_CONFIG] },
    { provide: DATABASE_CLIENT_FACTORY, useFactory: () => (config: DatabaseConfig): PrismaClient => new PrismaClient({ adapter: new PrismaPg({ connectionString: config.url, max: config.poolMax, connectionTimeoutMillis: config.connectionTimeoutMs, idleTimeoutMillis: config.idleTimeoutMs }) }) },
    DatabaseService,
    DatabaseReadinessService,
  ],
  exports: [DatabaseService, DatabaseReadinessService],
})
export class DatabaseModule {}
