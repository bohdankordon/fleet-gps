import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseModule } from "../database/database.module";
import { AuditModule } from "./audit.module";
import { AuditEventRepository } from "./audit.repository";

test("audit module provides and exports only the append-only repository", () => {
  assert.deepEqual(Reflect.getMetadata("imports", AuditModule), [DatabaseModule]);
  assert.deepEqual(Reflect.getMetadata("providers", AuditModule), [AuditEventRepository]);
  assert.deepEqual(Reflect.getMetadata("exports", AuditModule), [AuditEventRepository]);
  assert.equal(Reflect.getMetadata("controllers", AuditModule) ?? undefined, undefined);
});
