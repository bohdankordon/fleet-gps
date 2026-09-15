import { z } from "zod";

const count = z.number().int().nonnegative();
const alertSchema = z.strictObject({
  type: z.enum(["SPEEDING", "INACTIVITY"]),
  openedAt: z.string().datetime({ offset: true }),
});
const vehicleSchema = z.strictObject({
  vehicle: z.strictObject({ id: z.string().uuid(), name: z.string(), group: z.strictObject({ id: z.string().uuid(), name: z.string() }).nullable() }),
  alerts: z.array(alertSchema).min(1).max(2),
});

export const openAlertMapResponseSchema = z.strictObject({
  generatedAt: z.string().datetime({ offset: true }),
  summary: z.strictObject({
    totalOpenAlerts: count,
    vehiclesWithOpenAlerts: count,
    speeding: count,
    inactivity: count,
  }),
  vehicles: z.array(vehicleSchema),
}).superRefine((response, context) => {
  const vehicleIds = new Set<string>();
  let speeding = 0;
  let inactivity = 0;
  for (const entry of response.vehicles) {
    if (vehicleIds.has(entry.vehicle.id)) context.addIssue({ code: "custom", message: "Duplicate vehicle." });
    vehicleIds.add(entry.vehicle.id);
    const alertTypes = new Set<string>();
    for (const alert of entry.alerts) {
      if (alertTypes.has(alert.type)) context.addIssue({ code: "custom", message: "Duplicate OPEN alert type." });
      alertTypes.add(alert.type);
      if (alert.type === "SPEEDING") speeding += 1;
      else inactivity += 1;
    }
  }
  if (response.summary.vehiclesWithOpenAlerts !== vehicleIds.size
    || response.summary.speeding !== speeding
    || response.summary.inactivity !== inactivity
    || response.summary.totalOpenAlerts !== speeding + inactivity) {
    context.addIssue({ code: "custom", message: "Alert summary does not match vehicles." });
  }
});

export type OpenAlertMapResponse = z.infer<typeof openAlertMapResponseSchema>;
export type OpenAlertMapVehicle = OpenAlertMapResponse["vehicles"][number];
export type OpenAlertMapAlert = OpenAlertMapVehicle["alerts"][number];

export class OpenAlertMapContractError extends Error {
  public constructor() {
    super("Invalid OPEN alert map response.");
    this.name = "OpenAlertMapContractError";
  }
}

export function parseOpenAlertMapResponse(value: unknown): OpenAlertMapResponse {
  const parsed = openAlertMapResponseSchema.safeParse(value);
  if (!parsed.success) throw new OpenAlertMapContractError();
  return parsed.data;
}
