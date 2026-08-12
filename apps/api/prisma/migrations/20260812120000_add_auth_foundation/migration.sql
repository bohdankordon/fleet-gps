CREATE TYPE "AuthRole" AS ENUM ('ADMIN', 'USER');

CREATE TABLE "auth_users" (
    "id" UUID NOT NULL,
    "login" VARCHAR(64) NOT NULL,
    "normalized_login" VARCHAR(64) NOT NULL,
    "password_hash" BYTEA NOT NULL,
    "password_salt" BYTEA NOT NULL,
    "password_hash_version" INTEGER NOT NULL,
    "role" "AuthRole" NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "password_changed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_user_permissions" (
    "user_id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    CONSTRAINT "auth_user_permissions_pkey" PRIMARY KEY ("user_id", "key")
);

CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_users_normalized_login_key" ON "auth_users"("normalized_login");
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

ALTER TABLE "auth_user_permissions" ADD CONSTRAINT "auth_user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
