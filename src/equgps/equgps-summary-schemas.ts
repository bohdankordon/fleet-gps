import { z } from "zod";

const nonnegativeNumber = z.number().nonnegative().nullable().optional();

export const reportSummarySchema = z.object({
  deviceId: z.number().int(),
  deviceName: z.string().nullable().optional(),
  maxSpeed: nonnegativeNumber,
  averageSpeed: nonnegativeNumber,
  distance: nonnegativeNumber,
  spentFuel: nonnegativeNumber,
  engineHours: nonnegativeNumber,
});

export const reportSummariesSchema = z.array(reportSummarySchema);

export type ReportSummary = z.infer<typeof reportSummarySchema>;
