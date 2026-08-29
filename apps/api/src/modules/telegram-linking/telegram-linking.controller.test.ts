import assert from "node:assert/strict";
import test from "node:test";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { AuthRole } from "../../generated/prisma/enums";
import { AuthService } from "../auth/auth.service";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { PermissionGuard } from "../auth/permission.guard";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { AccountNotificationsController, AdminTelegramController, TelegramProductWebhookController } from "./telegram-linking.controller";
import { TelegramLinkingError, TelegramLinkingService } from "./telegram-linking.service";

const token = (character: string) => character.repeat(43);
function principal(role: AuthRole, id: string, mustChangePassword = false): AuthenticatedPrincipal {
  return Object.freeze({ id, login: `${id}.login`, role, permissions: [], mustChangePassword, sessionTokenHash: new Uint8Array(32) });
}

async function appWith(service: Partial<TelegramLinkingService>, identities: Readonly<Record<string, AuthenticatedPrincipal>> = {}): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    controllers: [AccountNotificationsController, AdminTelegramController, TelegramProductWebhookController],
    providers: [
      Reflector,
      { provide: TelegramLinkingService, useValue: service },
      { provide: AuthService, useValue: { authenticate: async (value: string) => identities[value] ?? null } },
      AuthenticationGuard,
      PermissionGuard,
      { provide: APP_GUARD, useClass: AuthenticationGuard },
      { provide: APP_GUARD, useClass: PermissionGuard },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api");
  await app.listen(0, "127.0.0.1");
  return app;
}

function url(app: INestApplication, path: string): string {
  return `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}${path}`;
}

test("public webhook requires its secret, bounded JSON content, and acknowledges syntactically valid Telegram updates", async () => {
  const seen: unknown[] = [];
  const app = await appWith({ verifySecret: (value: string | null) => value === "expected-secret", consume: async (update: unknown) => { seen.push(update); return "LINKED"; } });
  const update = { update_id: 4_000_000_001, message: { chat: { id: 4_000_000_002, type: "private" }, from: { id: 4_000_000_003 }, text: "/start token" } };
  const post = (body: string | null, headers: Record<string, string> = {}) => fetch(url(app, "/api/telegram/product/webhook"), { method: "POST", headers, ...(body === null ? {} : { body }) });
  try {
    for (const secret of [undefined, "wrong", ""]) {
      const headers = { "content-type": "application/json", ...(secret === undefined ? {} : { "x-telegram-bot-api-secret-token": secret }) };
      assert.equal((await post(JSON.stringify(update), headers)).status, 401);
    }
    assert.equal(seen.length, 0);
    assert.equal((await post(JSON.stringify(update), { "x-telegram-bot-api-secret-token": "expected-secret", "content-type": "text/plain" })).status, 400);
    assert.equal((await post("{", { "x-telegram-bot-api-secret-token": "expected-secret", "content-type": "application/json" })).status, 400);
    const accepted = await post(JSON.stringify(update), { "x-telegram-bot-api-secret-token": "expected-secret", "content-type": "application/json" });
    assert.equal(accepted.status, 200); assert.deepEqual(await accepted.json(), { ok: true });
    assert.deepEqual(seen, [{ updateId: 4_000_000_001n, chatId: 4_000_000_002n, userId: 4_000_000_003n, chatType: "private", text: "/start token" }]);
    for (const body of [{ update_id: "bad" }, {}, null, [], { update_id: 1, message: { chat: {}, from: {} } }]) assert.ok([200, 400].includes((await post(JSON.stringify(body), { "x-telegram-bot-api-secret-token": "expected-secret", "content-type": "application/json" })).status));
    assert.equal((await fetch(url(app, "/api/telegram/product/webhook"))).status >= 400, true);
    assert.equal((await fetch(url(app, "/api/telegram/product/webhook"), { method: "PUT" })).status >= 400, true);
  } finally { await app.close(); }
});

test("account linking routes derive identity from the authenticated session and expose only safe projections", async () => {
  const calls: string[] = [];
  const user = principal(AuthRole.USER, "00000000-0000-4000-8000-000000000001"); const admin = principal(AuthRole.ADMIN, "00000000-0000-4000-8000-000000000002"); const mustChange = principal(AuthRole.USER, "00000000-0000-4000-8000-000000000003", true);
  const app = await appWith({
    status: async (userId: string) => { calls.push(`status:${userId}`); return { status: "CONNECTED", pendingExpiresAt: null }; },
    preferences: async (userId: string) => { calls.push(`preferences:${userId}`); return { enabled: false, speedingEnabled: true, inactivityEnabled: true, vehicleScope: "ALL", selectedVehicleIds: [], revision: 0, canSelectVehicles: false, vehicles: [] }; },
    createLink: async (userId: string) => { calls.push(`link:${userId}`); if (userId === "rate-id") throw new TelegramLinkingError("RATE_LIMITED"); return { status: "LINK_PENDING", expiresAt: "2026-08-29T00:10:00.000Z", telegramUrl: "https://t.me/TaxiGpsTestBot?start=abc_DEF-123" }; },
    disconnect: async (_actor: unknown, _userId: string, targetId?: string) => { calls.push(`disconnect:${targetId ?? _userId}`); return { status: "NOT_CONNECTED", pendingExpiresAt: null }; },
  }, { [token("u")]: user, [token("a")]: admin, [token("m")]: mustChange, [token("r")]: principal(AuthRole.USER, "rate-id") });
  const request = (path: string, method = "GET", session?: string, body?: string) => fetch(url(app, path), { method, headers: { ...(session ? { cookie: `taxi_session=${session}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body === undefined ? {} : { body }) });
  try {
    assert.equal((await request("/api/account/notifications")).status, 401);
    assert.equal((await request("/api/account/notifications", "GET", token("m"))).status, 403);
    const status = await request("/api/account/notifications?userId=other", "GET", token("u"));
    assert.equal(status.status, 200); const statusBody = await status.json() as Record<string, unknown>;
    assert.deepEqual(statusBody, { status: "CONNECTED", pendingExpiresAt: null, preferences: { enabled: false, speedingEnabled: true, inactivityEnabled: true, vehicleScope: "ALL", selectedVehicleIds: [], revision: 0, canSelectVehicles: false, vehicles: [] } });
    for (const forbidden of ["telegramUserId", "telegramChatId", "tokenHash", "secret"]) assert.equal(JSON.stringify(statusBody).includes(forbidden), false);
    const link = await request("/api/account/notifications/telegram/link", "POST", token("u"));
    const linkText = await link.text(); if (link.status !== 201) assert.fail(linkText); const linkBody = JSON.parse(linkText) as Record<string, string>;
    assert.match(linkBody.telegramUrl ?? "", /^https:\/\/t\.me\/TaxiGpsTestBot\?start=[A-Za-z0-9_-]+$/);
    assert.equal(JSON.stringify(linkBody).includes("secret"), false);
    assert.equal((await request("/api/account/notifications/telegram/link", "POST", token("r"))).status, 429);
    const disconnect = await request("/api/account/notifications/telegram/disconnect", "POST", token("u")); if (disconnect.status !== 201) assert.fail(await disconnect.text());
    assert.equal((await request("/api/account/notifications/telegram/disconnect", "POST", token("m"))).status, 403);
    assert.deepEqual(calls, [`status:${user.id}`, `preferences:${user.id}`, `link:${user.id}`, "link:rate-id", `disconnect:${user.id}`]);
    assert.equal((await request(`/api/admin/users/${user.id}/telegram/disconnect`, "POST", token("u"))).status, 403);
    assert.equal((await request(`/api/admin/users/${user.id}/telegram/disconnect`, "POST", token("a"), JSON.stringify({ unwanted: true }))).status, 400);
    assert.equal((await request(`/api/admin/users/${user.id}/telegram/disconnect`, "POST", token("a"), "{}")).status, 201);
    assert.equal(calls.at(-1), `disconnect:${user.id}`);
  } finally { await app.close(); }
});
