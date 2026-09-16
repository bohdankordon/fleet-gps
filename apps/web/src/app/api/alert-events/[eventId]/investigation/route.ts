import { fetchSpeedingEventInvestigation } from "@/lib/alert-events/alert-events-client";
import { AlertEventsContractError } from "@/lib/alert-events/alert-events-contract";
import { AlertEventInvestigationNotFoundError } from "@/lib/alert-events/alert-events-errors";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: Readonly<{ params: Promise<{ eventId: string }> }>): Promise<Response> {
  const { eventId } = await context.params;
  try { return Response.json(await fetchSpeedingEventInvestigation(eventId), { status: 200 }); }
  catch (error) {
    if (error instanceof AlertEventInvestigationNotFoundError) return Response.json({ statusCode: 404, error: "Not Found" }, { status: 404 });
    if (error instanceof AlertEventsContractError) return Response.json({ statusCode: 502, error: "Bad Gateway" }, { status: 502 });
    return Response.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503 });
  }
}
