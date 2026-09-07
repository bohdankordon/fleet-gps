import { CheckCircleFilled, ClockCircleFilled, WarningFilled } from "@ant-design/icons";
import type { AlertEvent } from "../lib/alert-events/alert-events-contract";

type EventIdentity = Pick<AlertEvent, "type" | "status">;
type SemanticTokens = Readonly<{ colorSuccess: string; colorError: string; colorWarning: string }>;

export function eventStatusColor(status: EventIdentity["status"]) {
  return status === "OPEN" ? "red" : "green";
}

/** The accepted Vehicle Overview Recent Events grammar, shared without changing its output. */
export function eventSemanticPresentation(event: EventIdentity, token: SemanticTokens) {
  const accent = event.status === "RESOLVED" ? token.colorSuccess : event.type === "SPEEDING" ? token.colorError : token.colorWarning;
  const marker = event.status === "RESOLVED"
    ? <CheckCircleFilled aria-hidden style={{ color: token.colorSuccess }} />
    : event.type === "SPEEDING"
      ? <WarningFilled aria-hidden style={{ color: token.colorError }} />
      : <ClockCircleFilled aria-hidden style={{ color: token.colorWarning }} />;
  return { accent, marker, statusColor: eventStatusColor(event.status) };
}
