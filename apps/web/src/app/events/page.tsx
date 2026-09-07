import { EventsClient } from "@/components/events-client";
import { InitialEventsError } from "@/components/initial-events-error";
import { fetchAlertEvents, fetchAlertEventsSummary, firstAlertEventsQuery } from "@/lib/alert-events/alert-events-client";
import { parseAlertEventsFilters } from "@/lib/alert-events/alert-events-query";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function EventsPage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const raw = await searchParams; const params = new URLSearchParams(); for (const [key, value] of Object.entries(raw)) if (typeof value === "string") params.set(key, value);
  let filters; try { filters = parseAlertEventsFilters(params); } catch { return <InitialEventsError />; }
  const [events, summary] = await Promise.allSettled([fetchAlertEvents(firstAlertEventsQuery(filters)), fetchAlertEventsSummary()]);
  return <div><EventsClient initialData={events.status === "fulfilled" ? events.value : { items: [], nextCursor: null }} initialError={events.status !== "fulfilled"} initialSummary={summary.status === "fulfilled" ? summary.value : null} initialFilters={filters} /></div>;
}
