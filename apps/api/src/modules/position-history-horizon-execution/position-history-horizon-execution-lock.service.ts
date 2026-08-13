import { Inject, Injectable } from "@nestjs/common";
import type { QueryResult } from "pg";

/** Cross-process mutex for the one fleet-wide browser/CLI-compatible horizon executor. */
export const POSITION_HISTORY_HORIZON_EXECUTION_LOCK_KEY = 1706170003;
export const POSITION_HISTORY_LOCK_CONNECTION_FACTORY = Symbol("POSITION_HISTORY_LOCK_CONNECTION_FACTORY");

export type PositionHistoryLockConnection = Readonly<{
  query<T extends Record<string, unknown>>(text: string, values: readonly unknown[]): Promise<QueryResult<T>>;
  release(destroy?: boolean): Promise<void> | void;
}>;
export type PositionHistoryLockConnectionFactory = () => Promise<PositionHistoryLockConnection>;

export class PositionHistoryHorizonAlreadyRunningError extends Error {
  public constructor() { super("Position history horizon population is already running"); this.name = "PositionHistoryHorizonAlreadyRunningError"; }
}

@Injectable()
export class PositionHistoryHorizonExecutionLockService {
  public constructor(@Inject(POSITION_HISTORY_LOCK_CONNECTION_FACTORY) private readonly connect: PositionHistoryLockConnectionFactory) {}

  public async runExclusive<T>(execute: () => Promise<T>): Promise<T> {
    const connection = await this.connect();
    let acquired = false;
    let destroyConnection = false;
    try {
      const result = await connection.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock($1) AS acquired", [POSITION_HISTORY_HORIZON_EXECUTION_LOCK_KEY]);
      acquired = result.rows[0]?.acquired === true;
      if (!acquired) throw new PositionHistoryHorizonAlreadyRunningError();
      return await execute();
    } finally {
      if (acquired) {
        try { await connection.query<{ released: boolean }>("SELECT pg_advisory_unlock($1) AS released", [POSITION_HISTORY_HORIZON_EXECUTION_LOCK_KEY]); }
        catch { destroyConnection = true; }
      }
      await connection.release(destroyConnection);
    }
  }
}
