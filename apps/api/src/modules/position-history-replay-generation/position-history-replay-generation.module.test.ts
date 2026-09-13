import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { DatabaseModule } from "../database/database.module";
import { PositionHistoryReplayGenerationModule } from "./position-history-replay-generation.module";
import { POSITION_HISTORY_REPLAY_REPOSITORY } from "./position-history-replay-generation.tokens";
import { PositionHistoryReplayRunStateService } from "./position-history-replay-run-state.service";
import { PrismaPositionHistoryReplayRepository } from "./prisma-position-history-replay.repository";

test("replay generation module exports only dormant repository/state foundations", () => {
  assert.deepEqual(Reflect.getMetadata(MODULE_METADATA.IMPORTS, PositionHistoryReplayGenerationModule), [DatabaseModule]);
  const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PositionHistoryReplayGenerationModule) as unknown[];
  assert.ok(providers.includes(PrismaPositionHistoryReplayRepository));
  assert.ok(providers.includes(PositionHistoryReplayRunStateService));
  assert.ok(providers.some((provider) => typeof provider === "object" && provider !== null && (provider as { provide?: unknown }).provide === POSITION_HISTORY_REPLAY_REPOSITORY));
  assert.deepEqual(Reflect.getMetadata(MODULE_METADATA.EXPORTS, PositionHistoryReplayGenerationModule), [POSITION_HISTORY_REPLAY_REPOSITORY, PositionHistoryReplayRunStateService]);
});

test("foundation has no provider, scheduler, continuous-worker, finite-checkpoint, cursor, or startup coupling", () => {
  const moduleSource = readFileSync("src/modules/position-history-replay-generation/position-history-replay-generation.module.ts", "utf8");
  const repositorySource = readFileSync("src/modules/position-history-replay-generation/prisma-position-history-replay.repository.ts", "utf8");
  const stateSource = readFileSync("src/modules/position-history-replay-generation/position-history-replay-run-state.service.ts", "utf8");
  const appModule = readFileSync("src/app.module.ts", "utf8");
  const foundation = `${moduleSource}\n${repositorySource}\n${stateSource}`;
  assert.doesNotMatch(foundation, /EquGps|HistoricalWindow|Schedule|Cron|Interval|VehiclePositionBackfillCheckpoint|VehicleHistoryIngestionCursor|confirmedThrough|coverageFrom/);
  assert.doesNotMatch(appModule, /PositionHistoryReplayGenerationModule/);
});
