-- Product vehicle access is independent from functional permissions.
CREATE TYPE "VehicleAccessMode" AS ENUM ('ALL', 'SELECTED');

ALTER TYPE "AuditEventType" ADD VALUE 'VEHICLE_GROUP_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE 'VEHICLE_GROUP_RENAMED';
ALTER TYPE "AuditEventType" ADD VALUE 'VEHICLE_GROUP_MEMBERSHIP_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE 'VEHICLE_GROUP_DELETED';
ALTER TYPE "AuditEventType" ADD VALUE 'USER_VEHICLE_ACCESS_CHANGED';
ALTER TYPE "AuditTargetType" ADD VALUE 'VEHICLE_GROUP';

ALTER TABLE "auth_users"
  ADD COLUMN "vehicle_access_mode" "VehicleAccessMode" NOT NULL DEFAULT 'ALL';

ALTER TABLE "auth_users"
  ADD CONSTRAINT "auth_users_admin_vehicle_access_check"
  CHECK ("role" = 'USER' OR "vehicle_access_mode" = 'ALL');

CREATE TABLE "vehicle_groups" (
  "id" UUID NOT NULL,
  "name" VARCHAR(128) NOT NULL,
  "normalized_name" VARCHAR(128) GENERATED ALWAYS AS (lower("name")) STORED,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "vehicle_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vehicle_groups_name_canonical_check"
    CHECK ("name" = btrim("name") AND char_length("name") > 0)
);

CREATE UNIQUE INDEX "vehicle_groups_normalized_name_key"
  ON "vehicle_groups"("normalized_name");

ALTER TABLE "vehicles" ADD COLUMN "group_id" UUID;
CREATE INDEX "vehicles_group_id_idx" ON "vehicles"("group_id");
ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "vehicle_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "auth_user_vehicle_group_grants" (
  "user_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_user_vehicle_group_grants_pkey" PRIMARY KEY ("user_id", "group_id")
);

CREATE INDEX "auth_user_vehicle_group_grants_group_id_idx"
  ON "auth_user_vehicle_group_grants"("group_id");

ALTER TABLE "auth_user_vehicle_group_grants"
  ADD CONSTRAINT "auth_user_vehicle_group_grants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_user_vehicle_group_grants"
  ADD CONSTRAINT "auth_user_vehicle_group_grants_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "vehicle_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "auth_user_vehicle_grants" (
  "user_id" UUID NOT NULL,
  "vehicle_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_user_vehicle_grants_pkey" PRIMARY KEY ("user_id", "vehicle_id")
);

CREATE INDEX "auth_user_vehicle_grants_vehicle_id_idx"
  ON "auth_user_vehicle_grants"("vehicle_id");

ALTER TABLE "auth_user_vehicle_grants"
  ADD CONSTRAINT "auth_user_vehicle_grants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_user_vehicle_grants"
  ADD CONSTRAINT "auth_user_vehicle_grants_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grant rows are canonical only for USER + SELECTED. These database guards
-- prevent dormant ACL state even when writes bypass the application service.
CREATE FUNCTION "assert_selected_vehicle_access_grant"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "auth_users"
    WHERE "id" = NEW."user_id"
      AND "role" = 'USER'
      AND "vehicle_access_mode" = 'SELECTED'
  ) THEN
    RAISE EXCEPTION 'vehicle access grants require USER + SELECTED state'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "auth_user_vehicle_group_grants_state_check"
BEFORE INSERT OR UPDATE ON "auth_user_vehicle_group_grants"
FOR EACH ROW EXECUTE FUNCTION "assert_selected_vehicle_access_grant"();

CREATE TRIGGER "auth_user_vehicle_grants_state_check"
BEFORE INSERT OR UPDATE ON "auth_user_vehicle_grants"
FOR EACH ROW EXECUTE FUNCTION "assert_selected_vehicle_access_grant"();

CREATE FUNCTION "assert_canonical_auth_user_vehicle_access"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."role" <> 'USER' OR NEW."vehicle_access_mode" <> 'SELECTED')
     AND (
       EXISTS (SELECT 1 FROM "auth_user_vehicle_group_grants" WHERE "user_id" = NEW."id")
       OR EXISTS (SELECT 1 FROM "auth_user_vehicle_grants" WHERE "user_id" = NEW."id")
     ) THEN
    RAISE EXCEPTION 'ALL or ADMIN state cannot retain vehicle access grants'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "auth_users_vehicle_access_state_check"
BEFORE UPDATE OF "role", "vehicle_access_mode" ON "auth_users"
FOR EACH ROW EXECUTE FUNCTION "assert_canonical_auth_user_vehicle_access"();
