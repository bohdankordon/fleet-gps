import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { EquGpsModule } from "../equgps/equgps.module";
import { PositionHistoryBackfillService } from "./position-history-backfill.service";
import { PositionHistoryFleetBackfillService } from "./position-history-fleet-backfill.service";
import { POSITION_HISTORY_BACKFILL_CLOCK, POSITION_HISTORY_BACKFILL_REPOSITORY, POSITION_HISTORY_BACKFILL_SLEEPER, POSITION_HISTORY_FLEET_BACKFILL_REPOSITORY } from "./position-history-backfill.tokens";
import type { PositionHistoryBackfillClock, PositionHistoryBackfillSleeper } from "./position-history-backfill.types";
import { PrismaPositionHistoryFleetBackfillRepository } from "./prisma-position-history-fleet-backfill.repository";
import { PrismaPositionHistoryBackfillRepository } from "./prisma-position-history-backfill.repository";

@Module({
  imports: [DatabaseModule, EquGpsModule],
  providers: [
    { provide: POSITION_HISTORY_BACKFILL_REPOSITORY, useExisting: PrismaPositionHistoryBackfillRepository },
    { provide: POSITION_HISTORY_FLEET_BACKFILL_REPOSITORY, useExisting: PrismaPositionHistoryFleetBackfillRepository },
    { provide: POSITION_HISTORY_BACKFILL_CLOCK, useValue: { now: (): Date => new Date() } satisfies PositionHistoryBackfillClock },
    { provide: POSITION_HISTORY_BACKFILL_SLEEPER, useValue: { sleep: (durationMs: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, durationMs)) } satisfies PositionHistoryBackfillSleeper },
    PrismaPositionHistoryBackfillRepository,
    PrismaPositionHistoryFleetBackfillRepository,
    PositionHistoryBackfillService,
    PositionHistoryFleetBackfillService,
  ],
  exports: [PositionHistoryBackfillService, PositionHistoryFleetBackfillService],
})
export class PositionHistoryBackfillModule {}
