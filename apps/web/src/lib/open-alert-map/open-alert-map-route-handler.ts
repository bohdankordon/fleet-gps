import { OpenAlertMapContractError, type OpenAlertMapResponse } from "./open-alert-map-contract";

export type OpenAlertMapFetcher = () => Promise<OpenAlertMapResponse>;

export function createOpenAlertMapRouteHandler(fetchOpenAlertMap: OpenAlertMapFetcher) {
  return async (): Promise<Response> => {
    try {
      return Response.json(await fetchOpenAlertMap(), { status: 200 });
    } catch (error) {
      if (error instanceof OpenAlertMapContractError) return Response.json({ statusCode: 502, error: "Bad Gateway" }, { status: 502 });
      return Response.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503 });
    }
  };
}
