import { parseAbsoluteTimestamp } from "../vehicle-track/vehicle-track-query-params";
import type { PositionHistoryRetentionExecutionRequest } from "./position-history-retention.types";

export function parsePositionHistoryRetentionExecutionRequest(value: unknown): PositionHistoryRetentionExecutionRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 2 || !Object.hasOwn(body, "expectedCanonicalAnchor") || !Object.hasOwn(body, "expectedPolicyCutoff")) return null;
  const expectedCanonicalAnchor = parseAbsoluteTimestamp(body.expectedCanonicalAnchor);
  const expectedPolicyCutoff = parseAbsoluteTimestamp(body.expectedPolicyCutoff);
  if (expectedCanonicalAnchor === null || expectedPolicyCutoff === null) return null;
  return Object.freeze({ expectedCanonicalAnchor, expectedPolicyCutoff });
}
