import { FleetMapContractError, type FleetMapResponse } from "./fleet-map-contract";

export type FleetMapFetcher = () => Promise<FleetMapResponse>;
export function createFleetMapRouteHandler(fetchFleetMap: FleetMapFetcher) {
  return async (): Promise<Response> => {
    try { return Response.json(await fetchFleetMap(), { status: 200 }); }
    catch (error) {
      if (error instanceof FleetMapContractError) return Response.json({ statusCode: 502, error: "Bad Gateway" }, { status: 502 });
      return Response.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503 });
    }
  };
}
