import assert from "node:assert/strict";
import test from "node:test";
import { AppModule } from "../../app.module";
import { PositionHistoryContinuousIngestionModule } from "./position-history-continuous-ingestion.module";
import fs from "node:fs";
import path from "node:path";

test("continuous ingestion module is integrated exactly once and has no controller or schema-owned behavior", () => {
  const imports = Reflect.getMetadata("imports", AppModule) as unknown[];
  assert.equal(imports.filter((value) => value === PositionHistoryContinuousIngestionModule).length, 1);
  assert.deepEqual(Reflect.getMetadata("controllers", PositionHistoryContinuousIngestionModule) ?? [], []);
  const names = (Reflect.getMetadata("imports", PositionHistoryContinuousIngestionModule) as Array<{ name: string }>).map(({ name }) => name);
  assert.deepEqual(names, ["ApiConfigModule", "DatabaseModule", "PositionHistoryIngestionCursorModule", "PositionHistoryHistoricalWindowModule", "PositionHistoryHorizonExecutionLockModule", "PositionHistoryReplayGenerationModule"]);
});

test("PR 4B replay remains outside retention and completeness-cursor persistence", () => {
  const folder = path.resolve(__dirname);
  const source = fs.readdirSync(folder).filter((name) => name.endsWith(".js") && !name.endsWith(".test.js")).map((name) => fs.readFileSync(path.join(folder, name), "utf8")).join("\n");
  const replaySource = fs.readdirSync(folder).filter((name) => name.includes("replay") && name.endsWith(".js") && !name.endsWith(".test.js")).map((name) => fs.readFileSync(path.join(folder, name), "utf8")).join("\n");
  assert.doesNotMatch(source, /RetentionService|PositionHistoryRetentionModule/i);
  assert.doesNotMatch(replaySource, /persistContiguousResult|confirmedThrough|coverageFrom|PositionHistoryIngestionCursor/i);
});
