export const POSITION_HISTORY_REPLAY_WINDOW_MS = 6 * 60 * 60 * 1_000;
export const POSITION_HISTORY_ADAPTIVE_FETCH_DURATIONS_MS = Object.freeze([
  POSITION_HISTORY_REPLAY_WINDOW_MS,
  3 * 60 * 60 * 1_000,
  60 * 60 * 1_000,
] as const);
// Timeout-specific replay recovery quanta. After an exhausted historical
// timeout, a future quantum for the same logical checkpoint position may start
// from a smaller window: 6h -> 3h -> 1h -> 30m -> 15m. Fifteen minutes is the
// hard recovery floor; a failing 15-minute interval stays truthfully
// incomplete and never shrinks further. These tiers never apply to
// oversized-response subdivision, which remains 6h -> 3h -> 1h with a hard
// safe failure for an oversized one-hour response.
export const POSITION_HISTORY_REPLAY_TIMEOUT_RECOVERY_WINDOWS_MS = Object.freeze([
  POSITION_HISTORY_REPLAY_WINDOW_MS,
  3 * 60 * 60 * 1_000,
  60 * 60 * 1_000,
  30 * 60 * 1_000,
  15 * 60 * 1_000,
] as const);
export const POSITION_HISTORY_REPLAY_TIMEOUT_RECOVERY_MAX_TIER =
  POSITION_HISTORY_REPLAY_TIMEOUT_RECOVERY_WINDOWS_MS.length - 1;
export const POSITION_HISTORY_REPLAY_TIMEOUT_RECOVERY_FLOOR_WINDOW_MS =
  POSITION_HISTORY_REPLAY_TIMEOUT_RECOVERY_WINDOWS_MS[
    POSITION_HISTORY_REPLAY_TIMEOUT_RECOVERY_MAX_TIER
  ]!;
// Within one quantum, oversized-response fallback never subdivides below one
// hour. Sub-hour entries in a timeout-quantum candidate list are the quantum
// maximum itself, never an oversized fallback target.
export const POSITION_HISTORY_REPLAY_OVERSIZED_FALLBACK_FLOOR_WINDOW_MS = 60 * 60 * 1_000;
// Bounded process-local timeout-recovery knowledge shared across equivalent
// checkpoint positions. Optimization only: eviction loses the shortcut and
// falls back to existing per-checkpoint behavior without affecting durable
// correctness.
export const POSITION_HISTORY_REPLAY_TIMEOUT_RECOVERY_MAX_ENTRIES = 500;
// Timeout-specific cross-generation cooldown mirroring the first bounded
// checkpoint backoff. Prevents equivalent generation-scoped checkpoints from
// immediately re-hammering the same pathological logical point.
export const POSITION_HISTORY_REPLAY_TIMEOUT_RECOVERY_COOLDOWN_MS = 60_000;
export const POSITION_HISTORY_REPLAY_DAILY_DAYS = 7;
export const POSITION_HISTORY_REPLAY_ROLLING_DAYS = 90;
export const POSITION_HISTORY_REPLAY_LEASE_DURATION_MS = 120_000;
export const POSITION_HISTORY_REPLAY_HEARTBEAT_MS = 30_000;
export const POSITION_HISTORY_REPLAY_STABLE_FAILURE_BACKOFF_MS = 6 * 60 * 60 * 1_000;
export const POSITION_HISTORY_REPLAY_FAILURE_BACKOFF_MS = Object.freeze([60_000, 120_000, 240_000, 480_000, 960_000, 1_800_000] as const);
export const POSITION_HISTORY_COORDINATED_REQUEST_START_BUDGET = 5;
export const POSITION_HISTORY_CAPACITY_RECENT_STARTS_PER_MINUTE = 20;
export const POSITION_HISTORY_CAPACITY_DAILY_STARTS_PER_MINUTE = 2;
export const POSITION_HISTORY_CAPACITY_ROLLING_STARTS_PER_MINUTE = 4;
export const POSITION_HISTORY_CAPACITY_OVERDUE_DAILY_STARTS_PER_MINUTE = 3;
export const POSITION_HISTORY_CAPACITY_OVERDUE_ROLLING_STARTS_PER_MINUTE = 5;
