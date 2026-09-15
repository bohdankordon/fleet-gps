import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database";
import { applyVehicleScope } from "../vehicle-access/vehicle-access.service";
import type { VehicleScope } from "../vehicle-access/vehicle-access.types";
import {
  MAX_CONNECTED_RAW_GAP_SECONDS,
  MAX_OVERVIEW_POINTS,
  type StoredVehicleTrackOverviewSnapshot,
  type VehicleTrackOverviewQueryRepository,
} from "./vehicle-track-overview-query.repository";

const readTransactionTimeoutMs = 10_000;

type RawOverviewRow = Readonly<{
  rawPointCount: number;
  segmentCount: number;
  qualityWarningCount: number;
  firstObservedAt: Date | null;
  lastObservedAt: Date | null;
  tooFragmented: boolean;
  segmentOrdinal: number | null;
  segmentRawPointCount: number | null;
  segmentFirstObservedAt: Date | null;
  segmentLastObservedAt: Date | null;
  observedAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  valid: boolean | null;
  outdated: boolean | null;
}>;

@Injectable()
export class PrismaVehicleTrackOverviewQueryRepository implements VehicleTrackOverviewQueryRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async getOverviewSnapshot(vehicleId: string, from: Date, to: Date, scope: VehicleScope): Promise<StoredVehicleTrackOverviewSnapshot> {
    return this.database.getClient().$transaction(async (transaction) => {
      const stored = await transaction.vehicle.findFirst({ where: applyVehicleScope(scope, { id: vehicleId }), select: { id: true, name: true, group: { select: { id: true, name: true, color: true } } } });
      const vehicle = stored ? { id: stored.id, name: stored.name, group: stored.group ? { id: stored.group.id, name: stored.group.name, color: stored.group.color } : null } : null;
      if (!vehicle) return { vehicle: null, rawPointCount: 0, segmentCount: 0, qualityWarningCount: 0, firstObservedAt: null, lastObservedAt: null, tooFragmented: false, points: [] };

      const rows = await transaction.$queryRaw<readonly RawOverviewRow[]>`
        WITH ordered AS MATERIALIZED (
          SELECT
            observed_at,
            latitude,
            longitude,
            speed_kph,
            valid,
            outdated,
            fix_fingerprint,
            row_number() OVER (ORDER BY observed_at, fix_fingerprint)::int AS global_ordinal,
            lag(observed_at) OVER (ORDER BY observed_at, fix_fingerprint) AS previous_observed_at
          FROM vehicle_position_observations
          WHERE vehicle_id = ${vehicleId}::uuid
            AND observed_at >= ${from}
            AND observed_at <= ${to}
        ),
        marked AS (
          SELECT *,
            CASE
              WHEN previous_observed_at IS NULL
                OR observed_at - previous_observed_at > make_interval(secs => ${MAX_CONNECTED_RAW_GAP_SECONDS})
              THEN 1 ELSE 0
            END AS segment_start
          FROM ordered
        ),
        segmented AS (
          SELECT *,
            sum(segment_start) OVER (
              ORDER BY observed_at, fix_fingerprint ROWS UNBOUNDED PRECEDING
            )::int AS segment_ordinal
          FROM marked
        ),
        ranked AS (
          SELECT *,
            row_number() OVER (
              PARTITION BY segment_ordinal ORDER BY observed_at, fix_fingerprint
            )::int AS segment_point_ordinal,
            count(*) OVER (PARTITION BY segment_ordinal)::int AS segment_raw_point_count,
            min(observed_at) OVER (PARTITION BY segment_ordinal) AS segment_first_observed_at,
            max(observed_at) OVER (PARTITION BY segment_ordinal) AS segment_last_observed_at
          FROM segmented
        ),
        stats AS (
          SELECT
            count(*)::int AS raw_point_count,
            COALESCE(max(segment_ordinal), 0)::int AS segment_count,
            count(*) FILTER (WHERE valid IS FALSE OR outdated IS TRUE)::int AS quality_warning_count,
            min(observed_at) AS first_observed_at,
            max(observed_at) AS last_observed_at
          FROM ranked
        ),
        prioritized AS (
          SELECT ranked.*, stats.raw_point_count, stats.segment_count,
            (
              global_ordinal = 1
              OR global_ordinal = stats.raw_point_count
              OR (
                segment_point_ordinal = 1
                AND segment_ordinal > 1
                AND segment_ordinal < stats.segment_count
              )
            ) AS mandatory
          FROM ranked CROSS JOIN stats
        ),
        budget AS (
          SELECT count(*) FILTER (WHERE mandatory)::int AS mandatory_count
          FROM prioritized
        ),
        candidates AS (
          SELECT
            global_ordinal,
            row_number() OVER (ORDER BY observed_at, fix_fingerprint)::int AS candidate_ordinal,
            count(*) OVER ()::int AS candidate_count
          FROM prioritized
          WHERE NOT mandatory
        ),
        selected_ordinals AS (
          SELECT global_ordinal
          FROM prioritized
          WHERE (SELECT raw_point_count FROM stats) <= ${MAX_OVERVIEW_POINTS}

          UNION ALL

          SELECT global_ordinal
          FROM prioritized
          WHERE mandatory
            AND (SELECT raw_point_count FROM stats) > ${MAX_OVERVIEW_POINTS}
            AND (SELECT mandatory_count FROM budget) <= ${MAX_OVERVIEW_POINTS}

          UNION ALL

          SELECT global_ordinal
          FROM candidates
          WHERE (SELECT raw_point_count FROM stats) > ${MAX_OVERVIEW_POINTS}
            AND (SELECT mandatory_count FROM budget) <= ${MAX_OVERVIEW_POINTS}
            AND (${MAX_OVERVIEW_POINTS} - (SELECT mandatory_count FROM budget)) > 0
            AND floor(
              candidate_ordinal::numeric
              * (${MAX_OVERVIEW_POINTS} - (SELECT mandatory_count FROM budget))
              / candidate_count
            ) > floor(
              (candidate_ordinal - 1)::numeric
              * (${MAX_OVERVIEW_POINTS} - (SELECT mandatory_count FROM budget))
              / candidate_count
            )
        ),
        selected AS (
          SELECT prioritized.*
          FROM prioritized
          JOIN selected_ordinals USING (global_ordinal)
        )
        SELECT
          stats.raw_point_count AS "rawPointCount",
          stats.segment_count AS "segmentCount",
          stats.quality_warning_count AS "qualityWarningCount",
          stats.first_observed_at AS "firstObservedAt",
          stats.last_observed_at AS "lastObservedAt",
          ((SELECT mandatory_count FROM budget) > ${MAX_OVERVIEW_POINTS}) AS "tooFragmented",
          selected.segment_ordinal AS "segmentOrdinal",
          selected.segment_raw_point_count AS "segmentRawPointCount",
          selected.segment_first_observed_at AS "segmentFirstObservedAt",
          selected.segment_last_observed_at AS "segmentLastObservedAt",
          selected.observed_at AS "observedAt",
          selected.latitude,
          selected.longitude,
          selected.speed_kph AS "speedKph",
          selected.valid,
          selected.outdated
        FROM stats
        LEFT JOIN selected ON TRUE
        ORDER BY selected.segment_ordinal, selected.observed_at, selected.fix_fingerprint
      `;

      const summary = rows[0];
      if (!summary) throw new Error("Overview query returned no summary row.");
      const points = rows.flatMap((row) => row.observedAt === null ? [] : [{
        segmentOrdinal: row.segmentOrdinal!,
        segmentRawPointCount: row.segmentRawPointCount!,
        segmentFirstObservedAt: row.segmentFirstObservedAt!,
        segmentLastObservedAt: row.segmentLastObservedAt!,
        observedAt: row.observedAt,
        latitude: row.latitude!,
        longitude: row.longitude!,
        speedKph: row.speedKph,
        valid: row.valid,
        outdated: row.outdated,
      }]);
      return {
        vehicle,
        rawPointCount: summary.rawPointCount,
        segmentCount: summary.segmentCount,
        qualityWarningCount: summary.qualityWarningCount,
        firstObservedAt: summary.firstObservedAt,
        lastObservedAt: summary.lastObservedAt,
        tooFragmented: summary.tooFragmented,
        points,
      };
    }, { timeout: readTransactionTimeoutMs, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
