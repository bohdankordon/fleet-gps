"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { fleetActivityReportDateHref } from "../lib/fleet-activity-report/fleet-activity-report-navigation";
import { FleetActivityReportWorkspace } from "./fleet-activity-report-client";
import type { ReportPageState } from "../lib/fleet-activity-report/fleet-activity-report-page-loader";

/** Router.refresh preserves mounted local comparison controls and adds no history. */
export function ReportNavigation(props: ReportPageState) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());
  const navigate = (date: string) => {
    if (date === props.initialDate) refresh();
    else startTransition(() => router.push(fleetActivityReportDateHref(date), { scroll: false }));
  };
  return <FleetActivityReportWorkspace {...props} pending={pending} onRefresh={refresh} onDate={navigate} />;
}
