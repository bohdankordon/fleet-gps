-- Per-user product Telegram linking. No legacy alert-delivery data is changed.
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'TELEGRAM_LINKED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'TELEGRAM_DISCONNECTED';
CREATE TYPE "TelegramConnectionStatus" AS ENUM ('CONNECTED', 'BROKEN', 'DISCONNECTED');

CREATE TABLE "telegram_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "telegram_user_id" BIGINT,
  "telegram_chat_id" BIGINT,
  "status" "TelegramConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "connection_revision" INTEGER NOT NULL DEFAULT 1,
  "linked_at" TIMESTAMPTZ(6), "broken_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "telegram_connections_user_key" UNIQUE ("user_id"),
  CONSTRAINT "telegram_connections_telegram_user_key" UNIQUE ("telegram_user_id"),
  CONSTRAINT "telegram_connections_telegram_chat_key" UNIQUE ("telegram_chat_id"),
  CONSTRAINT "telegram_connections_user_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE
);

CREATE TABLE "telegram_link_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL,
  "token_hash" BYTEA NOT NULL, "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6), "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_link_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "telegram_link_tokens_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "telegram_link_tokens_user_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE
);
CREATE INDEX "telegram_link_tokens_user_expiry_idx" ON "telegram_link_tokens"("user_id", "expires_at");

CREATE TABLE "telegram_webhook_receipts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "update_id" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_webhook_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "telegram_webhook_receipts_update_key" UNIQUE ("update_id")
);
