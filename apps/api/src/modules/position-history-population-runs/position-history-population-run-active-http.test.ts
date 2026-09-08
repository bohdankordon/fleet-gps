import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { Reflector, APP_GUARD } from "@nestjs/core";
import { AuthRole, PositionHistoryPopulationRunInitiatorType, PositionHistoryPopulationRunStatus } from "../../generated/prisma/enums";
import { AuthService } from "../auth/auth.service";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { PermissionGuard } from "../auth/permission.guard";
import { PositionHistoryPopulationRunAdminController } from "./position-history-population-run-admin.controller";
import { PositionHistoryPopulationRunAdminService } from "./position-history-population-run-admin.service";

const token = "u".repeat(43);
const principal = { id: "00000000-0000-4000-8000-000000000001", login: "operator", role: AuthRole.USER, permissions: ["historyAdmin.view"], mustChangePassword: false, sessionTokenHash: new Uint8Array(32) };
const safe = { id: "00000000-0000-4000-8000-000000000123", status: PositionHistoryPopulationRunStatus.RUNNING, initiatorType: PositionHistoryPopulationRunInitiatorType.USER, to: "2026-08-11T02:00:00.000Z", excludeProviderDisabled: true, windowBudget: 1000, committedWindows: 24, createdAt: "2026-08-13T10:00:00.000Z", startedAt: "2026-08-13T10:00:00.000Z", finishedAt: null, failureCategory: null };

async function appWith(activeValue: unknown): Promise<INestApplication> {
  const module = await Test.createTestingModule({ controllers: [PositionHistoryPopulationRunAdminController], providers: [Reflector, { provide: PositionHistoryPopulationRunAdminService, useValue: { active: async () => activeValue, recent: async () => [], create: async () => { throw new Error("not called"); } } }, { provide: AuthService, useValue: { authenticate: async (v: string) => (v === token ? principal : null) } }, AuthenticationGuard, PermissionGuard, { provide: APP_GUARD, useClass: AuthenticationGuard }, { provide: APP_GUARD, useClass: PermissionGuard }] }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api");
  await app.listen(0, "127.0.0.1");
  return app;
}
function url(app: INestApplication, path: string): string { return "http://127.0.0.1:" + (app.getHttpServer().address() as { port: number }).port + path; }

test("Phase0 active 15: no-active-run HTTP response is valid and parseable, never empty body", { timeout: 15000 }, async () => {
  const app = await appWith(null);
  try {
    const res = await fetch(url(app, "/api/system/position-history/population-runs/active"), { headers: { cookie: "taxi_session=" + token } });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.notEqual(text.trim(), "");
    assert.deepEqual(JSON.parse(text), { active: null });
    assert.equal((res.headers.get("content-type") ?? "").includes("application/json"), true);
  } finally { await app.close(); }
});

test("Phase0 active 18: active run remains parseable via envelope", { timeout: 15000 }, async () => {
  const app = await appWith(safe);
  try {
    const res = await fetch(url(app, "/api/system/position-history/population-runs/active"), { headers: { cookie: "taxi_session=" + token } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { active: safe });
  } finally { await app.close(); }
});
