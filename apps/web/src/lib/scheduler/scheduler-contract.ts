import { z } from "zod";

const isoUtcTimestamp = z.string().datetime({ offset: true }).refine((value) => value.endsWith("Z"));
const counter = z.number().int().nonnegative();
const jobSchema = z.object({
  running: z.boolean(),
  lastAttemptAt: isoUtcTimestamp.nullable(),
  lastSuccessAt: isoUtcTimestamp.nullable(),
  lastFailureAt: isoUtcTimestamp.nullable(),
  lastFailureCategory: z.enum(["equgps", "database", "configuration", "unknown"]).nullable(),
  consecutiveFailures: counter,
  successfulRuns: counter,
  failedRuns: counter,
  skippedOverlaps: counter,
});

export const schedulerStatusResponseSchema = z.object({
  enabled: z.boolean(),
  startedAt: isoUtcTimestamp.nullable(),
  fleetIntervalSeconds: z.number().int().nonnegative(),
  runsIntervalSeconds: z.number().int().nonnegative(),
  fleet: jobSchema,
  runs: jobSchema,
  generatedAt: isoUtcTimestamp,
});

export type SchedulerStatusResponse = z.infer<typeof schedulerStatusResponseSchema>;

export class SchedulerContractError extends Error {
  public constructor() { super("Invalid scheduler response."); this.name = "SchedulerContractError"; }
}

export function parseSchedulerStatusResponse(value: unknown): SchedulerStatusResponse {
  const parsed = schedulerStatusResponseSchema.safeParse(value);
  if (!parsed.success) throw new SchedulerContractError();
  return parsed.data;
}
