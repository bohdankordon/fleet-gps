-- Vehicle group display color is presentation metadata only. It never affects
-- Product Vehicle Access, group grants, or notification eligibility.
CREATE TYPE "VehicleGroupColor" AS ENUM ('BLUE', 'CYAN', 'GREEN', 'GOLD', 'ORANGE', 'PURPLE', 'MAGENTA', 'GRAY');

-- Existing groups deterministically become BLUE; the column default keeps
-- every future group colored without application-level backfill.
ALTER TABLE "vehicle_groups" ADD COLUMN "color" "VehicleGroupColor" NOT NULL DEFAULT 'BLUE';

ALTER TYPE "AuditEventType" ADD VALUE 'VEHICLE_GROUP_UPDATED';
