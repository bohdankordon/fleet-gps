import "server-only";
import { parseWebConfig } from "../web-config";
import type { VehicleTrackRange } from "../vehicle-track/vehicle-track-range";
import { FleetActivityReportContractError, parseFleetActivityReport, type FleetActivityReportResponse } from "./fleet-activity-report-contract";
import { FleetActivityReportBadRequestError, FleetActivityReportUnavailableError } from "./fleet-activity-report-errors";
import { authenticatedApiFetch } from "@/lib/auth/auth-cookie";
export async function fetchFleetActivityReport(range: VehicleTrackRange, fetcher: typeof fetch = authenticatedApiFetch): Promise<FleetActivityReportResponse> { const config = parseWebConfig(process.env); const url = new URL(`${config.apiInternalBaseUrl}/api/reports/fleet-activity`); url.searchParams.set("from", range.from); url.searchParams.set("to", range.to); const response = await fetcher(url, { cache: "no-store", headers: { Accept: "application/json" } }); if (response.status === 400) throw new FleetActivityReportBadRequestError(); if (!response.ok) throw new FleetActivityReportUnavailableError(); try { return parseFleetActivityReport(await response.json()); } catch (error) { if (error instanceof FleetActivityReportContractError) throw error; throw new FleetActivityReportContractError(); } }
