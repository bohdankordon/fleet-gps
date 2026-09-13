-- One durable contiguous-completeness cursor exists per vehicle. Rows are
-- initialized deliberately by application policy, never inferred in SQL.
CREATE TABLE "vehicle_history_ingestion_cursors" (
    "vehicle_id" UUID NOT NULL,
    "coverage_from" TIMESTAMPTZ(6) NOT NULL,
    "confirmed_through" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vehicle_history_ingestion_cursors_pkey" PRIMARY KEY ("vehicle_id")
);

-- Future lag scheduling scans the oldest contiguous boundaries first.
CREATE INDEX "vehicle_history_ingestion_cursors_confirmed_through_idx"
ON "vehicle_history_ingestion_cursors"("confirmed_through");

-- Restriction makes cursor/history ownership explicit if vehicle deletion is
-- ever designed; deletion cannot silently erase the completeness claim.
ALTER TABLE "vehicle_history_ingestion_cursors"
ADD CONSTRAINT "vehicle_history_ingestion_cursors_vehicle_id_fkey"
FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_history_ingestion_cursors"
ADD CONSTRAINT "vehicle_history_ingestion_cursors_progress_valid"
CHECK (
    isfinite("coverage_from")
    AND isfinite("confirmed_through")
    AND isfinite("created_at")
    AND isfinite("updated_at")
    AND "coverage_from" <= "confirmed_through"
);
