import assert from "node:assert/strict";
import test from "node:test";
import { AppModule } from "../../app.module";
import { AlertEvaluationModule } from "../alert-evaluation";
import { AlertSettingsModule } from "../alert-settings/alert-settings.module";
import { DatabaseModule } from "../database";
import { InactivityDetectorService } from "../inactivity-detector";
import { SpeedingDetectorService } from "../speeding-detector";
import { AlertIngestionModule } from "./alert-ingestion.module";
import { AlertObservationIngestionService } from "./alert-observation-ingestion.service";
import { AlertObservationRepository } from "./alert-observation.repository";

test("ingestion module has no controller, scheduler, startup hook, or duplicate detector providers", () => {
  assert.deepEqual(Reflect.getMetadata("imports", AlertIngestionModule), [DatabaseModule, AlertSettingsModule, AlertEvaluationModule]);
  assert.deepEqual(Reflect.getMetadata("providers", AlertIngestionModule), [AlertObservationRepository, AlertObservationIngestionService]);
  assert.deepEqual(Reflect.getMetadata("exports", AlertIngestionModule), [AlertObservationIngestionService]);
  assert.equal(Reflect.getMetadata("controllers", AlertIngestionModule) ?? undefined, undefined);
  const providers = Reflect.getMetadata("providers", AlertIngestionModule) as readonly unknown[];
  assert.equal(providers.includes(SpeedingDetectorService), false); assert.equal(providers.includes(InactivityDetectorService), false);
  assert.equal("onModuleInit" in AlertObservationIngestionService.prototype, false);
});

test("AppModule integrates ingestion exactly once without replacing existing modules", () => {
  const imports = Reflect.getMetadata("imports", AppModule) as readonly unknown[];
  assert.equal(imports.filter((value) => value === AlertIngestionModule).length, 1);
  assert.equal(imports.filter((value) => value === AlertEvaluationModule).length, 1);
});
