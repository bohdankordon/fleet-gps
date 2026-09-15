import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "../../generated/prisma/client";
import type { ApiConfig } from "../../config/api-config";
import type { AuditEventRepository } from "../audit";
import type { DatabaseService } from "../database/database.service";
import {
  NotificationPreferencesError,
  TelegramLinkingService,
  type TelegramInbound,
} from "./telegram-linking.service";
import { UNRESTRICTED_VEHICLE_SCOPE } from "../vehicle-access/vehicle-access.service";
import type { TelegramLinkRateLimiter } from "./telegram-link-rate-limiter";
import type { TelegramProductBotTransport } from "./telegram-product-bot.transport";

const userId = "00000000-0000-4000-8000-000000000001";
const rawToken = "a".repeat(43);
const preferenceInput = Object.freeze({ expectedRevision: 0, enabled: true, speedingEnabled: false, inactivityEnabled: true });
const config = Object.freeze({ telegramProductLinking: Object.freeze({ enabled: true, botUsername: "FleetGpsTestBot", botToken: "fixture-token", webhookSecret: "fixture-secret" }) }) as ApiConfig;

function knownError(code: string, message = "private persistence details"): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: "7.9.1" });
}

function service(
  client: unknown,
  audit: Partial<AuditEventRepository> = {},
  bot: Partial<TelegramProductBotTransport> = {},
  scopes: unknown = { resolve: async () => UNRESTRICTED_VEHICLE_SCOPE },
): TelegramLinkingService {
  return new TelegramLinkingService(
    { getClient: () => client } as unknown as DatabaseService,
    audit as AuditEventRepository,
    config,
    { check: () => true } as unknown as TelegramLinkRateLimiter,
    {
      sendHelp: async () => undefined,
      sendLinkSuccess: async () => undefined,
      sendLinkFailure: async () => undefined,
      ...bot,
    } as TelegramProductBotTransport,
    scopes as never,
  );
}

function preferenceClient(options: Readonly<{ createError?: unknown; transactionError?: unknown; currentRevision?: number }> = {}) {
  let stored = options.currentRevision === undefined ? null : {
    userId,
    enabled: false,
    speedingEnabled: true,
    inactivityEnabled: true,
    vehicleScope: "ALL",
    revision: options.currentRevision,
  };
  let createCalls = 0;
  let updateCalls = 0;
  const tx = {
    userNotificationPreferences: {
      findUnique: async () => stored,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createCalls += 1;
        if (options.createError !== undefined) throw options.createError;
        stored = { ...data, userId, vehicleScope: "ALL", revision: 1 } as typeof stored;
        return stored;
      },
      updateMany: async () => { updateCalls += 1; return { count: 1 }; },
    },
  };
  const client = {
    $transaction: async (operation: (value: typeof tx) => Promise<unknown>) => {
      if (options.transactionError !== undefined) throw options.transactionError;
      return operation(tx);
    },
    userNotificationPreferences: {
      findUnique: async () => stored === null ? null : { ...stored, vehicles: [] },
    },
  };
  return Object.freeze({ client, createCalls: () => createCalls, updateCalls: () => updateCalls });
}

test("successful first preference save keeps revision-zero input and creates revision one", async () => {
  const setup = preferenceClient();
  const result = await service(setup.client).updatePreferences(userId, [], preferenceInput);
  assert.equal(setup.createCalls(), 1);
  assert.equal(setup.updateCalls(), 0);
  assert.deepEqual(result, {
    enabled: true,
    speedingEnabled: false,
    inactivityEnabled: true,
    vehicleScope: "ALL",
    selectedVehicleIds: [],
    revision: 1,
    canSelectVehicles: false,
    hasDormantSelections: false,
    vehicles: [],
  });
});

test("only a known P2002 first-create race becomes the existing preference conflict", async () => {
  const raw = "private unique constraint details";
  const setup = preferenceClient({ createError: knownError("P2002", raw) });
  await assert.rejects(
    service(setup.client).updatePreferences(userId, [], preferenceInput),
    (error: unknown) => error instanceof NotificationPreferencesError && error.code === "CONFLICT" && !error.message.includes(raw),
  );
  assert.equal(setup.createCalls(), 1);
});

test("generic, timeout-style, and transaction failures are never reduced to preference conflicts", async () => {
  const failures: readonly Readonly<{ createError?: unknown; transactionError?: unknown }>[] = [
    Object.freeze({ createError: new Error("private database rejection") }),
    Object.freeze({ createError: knownError("P2024", "private transaction timeout") }),
    Object.freeze({ transactionError: new Error("private transaction failure") }),
  ];
  for (const options of failures) {
    const setup = preferenceClient(options);
    const expected = options.createError ?? options.transactionError;
    await assert.rejects(service(setup.client).updatePreferences(userId, [], preferenceInput), (error: unknown) => {
      assert.equal(error, expected);
      assert.equal(error instanceof NotificationPreferencesError, false);
      return true;
    });
  }
});

test("existing revision conflict remains a domain conflict without a create or update", async () => {
  const setup = preferenceClient({ currentRevision: 2 });
  await assert.rejects(
    service(setup.client).updatePreferences(userId, [], preferenceInput),
    (error: unknown) => error instanceof NotificationPreferencesError && error.code === "CONFLICT",
  );
  assert.equal(setup.createCalls(), 0);
  assert.equal(setup.updateCalls(), 0);
});

type LinkMode = "valid" | "missing" | "revoked" | "expired" | "disabled";
type LinkState = { receipt: boolean; connected: number; consumed: number; audits: number };

function linkingSubject(mode: LinkMode = "valid", failFirstUpsert = false) {
  let committed: LinkState = { receipt: false, connected: 0, consumed: 0, audits: 0 };
  let failUpsert = failFirstUpsert;
  let transactions = 0;
  const botCalls: string[] = [];
  const client = {
    $transaction: async (operation: (tx: any) => Promise<unknown>) => {
      transactions += 1;
      const draft = { ...committed };
      const tx = {
        __linkState: draft,
        telegramWebhookReceipt: { create: async () => {
          if (draft.receipt) throw knownError("P2002", "private receipt constraint");
          draft.receipt = true;
        } },
        telegramLinkToken: {
          findUnique: async () => mode === "missing" ? null : {
            id: "link-id",
            userId,
            consumedAt: null,
            revokedAt: mode === "revoked" ? new Date() : null,
            expiresAt: mode === "expired" ? new Date("2000-01-01T00:00:00.000Z") : new Date("2100-01-01T00:00:00.000Z"),
          },
          update: async () => { draft.consumed += 1; },
        },
        authUser: { findUnique: async () => ({ disabled: mode === "disabled", mustChangePassword: false, login: "fleet-user" }) },
        telegramConnection: {
          findFirst: async () => null,
          upsert: async () => {
            if (failUpsert) { failUpsert = false; throw new Error("private transient storage failure"); }
            draft.connected += 1;
          },
        },
      };
      const result = await operation(tx);
      committed = draft;
      return result;
    },
  };
  const audit = { append: async (tx: { __linkState: LinkState }) => { tx.__linkState.audits += 1; } };
  const bot = {
    sendHelp: async () => { botCalls.push("help"); },
    sendLinkSuccess: async () => { botCalls.push("success"); },
    sendLinkFailure: async () => { botCalls.push("failure"); },
  };
  return Object.freeze({
    service: service(client, audit as unknown as AuditEventRepository, bot),
    state: () => ({ ...committed }),
    transactions: () => transactions,
    botCalls,
  });
}

function inbound(overrides: Partial<TelegramInbound> = {}): TelegramInbound {
  return Object.freeze({ updateId: 4_000_000_001n, chatId: 4_000_000_002n, userId: 4_000_000_003n, chatType: "private", text: `/start ${rawToken}`, ...overrides });
}

test("normal link and expected invalid, revoked, expired, disabled, and non-private outcomes stay modelled", async () => {
  const valid = linkingSubject();
  assert.equal(await valid.service.consume(inbound()), "LINKED");
  assert.deepEqual(valid.state(), { receipt: true, connected: 1, consumed: 1, audits: 1 });
  assert.deepEqual(valid.botCalls, ["success"]);

  for (const [mode, outcome] of [["missing", "INVALID"], ["revoked", "INVALID"], ["expired", "INVALID"], ["disabled", "DISABLED"]] as const) {
    const setup = linkingSubject(mode);
    assert.equal(await setup.service.consume(inbound()), outcome);
    assert.deepEqual(setup.state(), { receipt: true, connected: 0, consumed: 0, audits: 0 });
    assert.deepEqual(setup.botCalls, ["failure"]);
  }

  const ignored = linkingSubject();
  assert.equal(await ignored.service.consume(inbound({ chatType: "group" })), "IGNORED");
  assert.equal(ignored.transactions(), 0);
  assert.deepEqual(ignored.botCalls, []);
});

test("transient link persistence failure rolls back its receipt and retry commits exactly once", async () => {
  const setup = linkingSubject("valid", true);
  await assert.rejects(setup.service.consume(inbound()), /private transient storage failure/);
  assert.deepEqual(setup.state(), { receipt: false, connected: 0, consumed: 0, audits: 0 });
  assert.deepEqual(setup.botCalls, []);

  assert.equal(await setup.service.consume(inbound()), "LINKED");
  assert.deepEqual(setup.state(), { receipt: true, connected: 1, consumed: 1, audits: 1 });
  assert.deepEqual(setup.botCalls, ["success"]);

  assert.equal(await setup.service.consume(inbound()), "DUPLICATE");
  assert.deepEqual(setup.state(), { receipt: true, connected: 1, consumed: 1, audits: 1 });
  assert.deepEqual(setup.botCalls, ["success"]);
});
