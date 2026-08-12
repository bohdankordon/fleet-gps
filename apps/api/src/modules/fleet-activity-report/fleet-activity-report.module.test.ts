import assert from "node:assert/strict";
import test from "node:test";
import { AppModule } from "../../app.module";
import { DatabaseModule } from "../database/database.module";
import { FleetActivityReportController } from "./fleet-activity-report.controller";
import { FleetActivityReportModule } from "./fleet-activity-report.module";
test("report module is database-only with one read controller and no provider/scheduler imports", () => { assert.deepEqual(Reflect.getMetadata("imports", FleetActivityReportModule), [DatabaseModule]); assert.deepEqual(Reflect.getMetadata("controllers", FleetActivityReportModule), [FleetActivityReportController]); const imports = Reflect.getMetadata("imports", AppModule) as readonly unknown[]; assert.equal(imports.filter((value) => value === FleetActivityReportModule).length, 1); });
