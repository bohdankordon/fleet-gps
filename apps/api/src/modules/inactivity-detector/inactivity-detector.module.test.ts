import assert from "node:assert/strict";
import test from "node:test";
import { InactivityDetectorModule } from "./inactivity-detector.module";
import { InactivityDetectorService } from "./inactivity-detector.service";
import { InactivityDetectorStateMachine } from "./inactivity-detector.state-machine";

test("module registers and exports detector services without controllers or scheduler wiring", () => {
  const imports = Reflect.getMetadata("imports", InactivityDetectorModule) as readonly unknown[];
  const providers = Reflect.getMetadata("providers", InactivityDetectorModule) as readonly unknown[];
  const exports = Reflect.getMetadata("exports", InactivityDetectorModule) as readonly unknown[];
  assert.equal(imports.length, 1); assert.deepEqual(providers, [InactivityDetectorStateMachine, InactivityDetectorService]); assert.deepEqual(exports, [InactivityDetectorStateMachine, InactivityDetectorService]);
});
