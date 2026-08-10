import { VehicleDetailsContractError, isVehicleDetailsId, type VehicleDetailsResponse } from "./vehicle-details-contract";
import { VehicleDetailsBackendBadRequestError, VehicleDetailsBackendNotFoundError } from "./vehicle-details-errors";

type Fetcher = (vehicleId: string) => Promise<VehicleDetailsResponse>;
function safe(status: 400 | 404 | 502 | 503): Response { return Response.json({ statusCode: status, error: status === 400 ? "Bad Request" : status === 404 ? "Not Found" : status === 502 ? "Bad Gateway" : "Service Unavailable" }, { status }); }
export function createVehicleDetailsRouteHandler(fetchDetails: Fetcher) { return async (_request: Request, context: { params: Promise<{ vehicleId: string }> }): Promise<Response> => { const { vehicleId } = await context.params; if (!isVehicleDetailsId(vehicleId)) return safe(400); try { return Response.json(await fetchDetails(vehicleId), { status: 200 }); } catch (error) { if (error instanceof VehicleDetailsBackendBadRequestError) return safe(400); if (error instanceof VehicleDetailsBackendNotFoundError) return safe(404); if (error instanceof VehicleDetailsContractError) return safe(502); return safe(503); } }; }
