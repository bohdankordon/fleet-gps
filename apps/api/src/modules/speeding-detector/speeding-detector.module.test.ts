import assert from "node:assert/strict";
import test from "node:test";
import { SpeedingDetectorModule } from "./speeding-detector.module";
import { SpeedingDetectorService } from "./speeding-detector.service";
import { SpeedingDetectorStateMachine } from "./speeding-detector.state-machine";

test("module registers and exports the detector services without controllers", () => {
  const metadata = Reflect.getMetadata("imports", SpeedingDetectorModule) as readonly unknown[];
  const providers = Reflect.getMetadata("providers", SpeedingDetectorModule) as readonly unknown[];
  const exports = Reflect.getMetadata("exports", SpeedingDetectorModule) as readonly unknown[];
  assert.equal(metadata.length, 2); assert.deepEqual(providers, [SpeedingDetectorStateMachine, SpeedingDetectorService]); assert.deepEqual(exports, [SpeedingDetectorStateMachine, SpeedingDetectorService]);
});
