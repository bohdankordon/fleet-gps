import { Module } from "@nestjs/common";
import { Client } from "pg";
import type { ApiConfig } from "../../config/api-config";
import { ApiConfigModule } from "../../config/api-config.module";
import { API_CONFIG } from "../../config/api-config.tokens";
import { POSITION_HISTORY_LOCK_CONNECTION_FACTORY, PositionHistoryHorizonExecutionLockService, type PositionHistoryLockConnectionFactory } from "./position-history-horizon-execution-lock.service";

@Module({
  imports: [ApiConfigModule],
  providers: [
    {
      provide: POSITION_HISTORY_LOCK_CONNECTION_FACTORY,
      useFactory: (config: ApiConfig): PositionHistoryLockConnectionFactory => async () => {
        const client = new Client({ connectionString: config.database.url, connectionTimeoutMillis: config.database.connectionTimeoutMs });
        try { await client.connect(); }
        catch (error) { try { await client.end(); } catch {} throw error; }
        return { query: (text, values) => client.query(text, [...values]), release: async () => { await client.end(); } };
      },
      inject: [API_CONFIG],
    },
    PositionHistoryHorizonExecutionLockService,
  ],
  exports: [PositionHistoryHorizonExecutionLockService],
})
export class PositionHistoryHorizonExecutionLockModule {}
