import { z } from "zod";

export const durableRunBudgets = [500, 1000, 5000] as const;
export type DurableRunBudget = (typeof durableRunBudgets)[number];

const absoluteTimestamp = z.string().datetime({ offset: true });
export const createDurableRunRequestSchema = z.object({
  to: absoluteTimestamp,
  windowBudget: z.union([z.literal(500), z.literal(1000), z.literal(5000)]),
  excludeProviderDisabled: z.boolean(),
}).strict();

export const safeDurableRunSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED"]),
  initiatorType: z.enum(["USER", "SYSTEM"]),
  to: absoluteTimestamp,
  excludeProviderDisabled: z.boolean(),
  windowBudget: z.number().int().positive(),
  committedWindows: z.number().int().nonnegative(),
  createdAt: absoluteTimestamp,
  startedAt: absoluteTimestamp.nullable(),
  finishedAt: absoluteTimestamp.nullable(),
  failureCategory: z.enum(["EXECUTION", "WORKER", "UNKNOWN"]).nullable(),
}).strict();


export const recentDurableRunsSchema = z.array(safeDurableRunSchema.refine((run) => run.status === "SUCCEEDED" || run.status === "FAILED")).max(10);

export type CreateDurableRunRequest = z.infer<typeof createDurableRunRequestSchema>;
export type SafeDurableRun = z.infer<typeof safeDurableRunSchema>;

// Explicit no-active-run HTTP contract (Phase 0 correctness).
// SUCCESS + NO ACTIVE RUN is HTTP 200 with { active: null } as valid JSON,
// distinct from READ FAILURE (non-2xx / transport / contract error).
// Never rely on framework-specific null/empty-body behavior.
export const activeDurableRunResponseSchema = z.object({ active: safeDurableRunSchema.nullable() }).strict();
export type ActiveDurableRunResponse = z.infer<typeof activeDurableRunResponseSchema>;
