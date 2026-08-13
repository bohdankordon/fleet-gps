import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AuditActorType, AuditEventType, AuditTargetType } from "../../generated/prisma/enums";
import type { DatabaseService } from "../database/database.service";
import { buildUserActor, buildUserDisabledAuditEvent } from "./audit-events";
import { AuditEventRepository } from "./audit.repository";

const actor = buildUserActor("00000000-0000-4000-8000-000000000001", "operator");
const targetId = "00000000-0000-4000-8000-000000000002";

test("append maps the strict spec to scalar AuditEvent fields without exposing unknown payloads", async () => {
  const calls: unknown[] = [];
  const client = { auditEvent: { create: async (args: unknown) => { calls.push(args); return { id: "audit", ...(args as { data: Record<string, unknown> }).data }; } } };
  const repository = new AuditEventRepository({ getClient: () => ({}) } as DatabaseService);
  const event = buildUserDisabledAuditEvent(actor, targetId, "target");
  await repository.append(client as never, event);
  assert.equal(calls.length, 1);
  const data = (calls[0] as { data: Record<string, unknown> }).data;
  assert.deepEqual(data, {
    eventType: AuditEventType.USER_DISABLED,
    actorType: AuditActorType.USER,
    actorUserId: actor.actorUserId,
    actorLoginSnapshot: "operator",
    targetType: AuditTargetType.USER,
    targetId,
    details: { targetLoginSnapshot: "target" },
  });
});

test("appendWithDatabase uses the injected database client and the same strict mapper", async () => {
  const calls: unknown[] = [];
  const database = { getClient: () => ({ auditEvent: { create: async (args: unknown) => { calls.push(args); return { id: "audit", ...(args as { data: Record<string, unknown> }).data }; } } }) } as unknown as DatabaseService;
  const repository = new AuditEventRepository(database);
  await repository.appendWithDatabase(buildUserDisabledAuditEvent(actor, targetId, "target"));
  assert.equal(calls.length, 1);
});

test("repository exposes append-only persistence and no public update/delete surface", () => {
  const source = readFileSync("src/modules/audit/audit.repository.ts", "utf8");
  assert.match(source, /append\(/);
  assert.match(source, /appendWithDatabase\(/);
  assert.doesNotMatch(source, /auditEvent\.(?:update|updateMany|delete|deleteMany|upsert)/);
});
