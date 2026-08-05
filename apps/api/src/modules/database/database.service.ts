import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "../../generated/prisma/client";
import type { DatabaseConfig } from "../../config/api-config";
import { DATABASE_CLIENT_FACTORY, DATABASE_CONFIG } from "./database.tokens";

type DatabaseClientFactory = (config: DatabaseConfig) => PrismaClient;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly client: PrismaClient;
  private disconnected = false;

  public constructor(@Inject(DATABASE_CLIENT_FACTORY) clientFactory: DatabaseClientFactory, @Inject(DATABASE_CONFIG) config: DatabaseConfig) { this.client = clientFactory(config); }
  public getClient(): PrismaClient { return this.client; }
  public async ping(): Promise<void> { await this.client.$queryRaw`SELECT 1`; }
  public async disconnect(): Promise<void> { if (this.disconnected) return; this.disconnected = true; try { await this.client.$disconnect(); } catch {} }
  public async onModuleDestroy(): Promise<void> { await this.disconnect(); }
}
