import { landingFor, type AuthUser } from "./auth-contract";
import { parseVehicleTrackRange } from "../vehicle-track/vehicle-track-range";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRIPS_PATH = /^\/vehicles\/([0-9a-f-]+)\/trips$/i;

/** Only the event investigation route is eligible for login continuation. */
export function parseReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || /[\\#\u0000-\u001f\u007f]/.test(value)) return null;
  const question = value.indexOf("?");
  if (question < 0) return null;
  const path = value.slice(0, question);
  const match = TRIPS_PATH.exec(path);
  if (!match || !UUID.test(match[1]!)) return null;
  try {
    const query = new URLSearchParams(value.slice(question + 1));
    if ([...query.keys()].length !== 3 || [...query.keys()].some((key) => !["from", "to", "event"].includes(key))) return null;
    const event = query.get("event");
    const range = parseVehicleTrackRange(query.get("from"), query.get("to"));
    if (!event || !UUID.test(event) || !range) return null;
    return `${path.toLowerCase()}?${new URLSearchParams({ from: range.from, to: range.to, event: event.toLowerCase() })}`;
  } catch { return null; }
}

export function tripEventReturnTo(vehicleId: string, query: Readonly<Record<string, string | string[] | undefined>>): string | null {
  if (typeof query.from !== "string" || typeof query.to !== "string" || typeof query.event !== "string") return null;
  return parseReturnTo(`/vehicles/${vehicleId}/trips?${new URLSearchParams({ from: query.from, to: query.to, event: query.event })}`);
}

export function tripEventLoginRedirect(returnTo: string | null, authKind: "authenticated" | "unauthenticated" | "unavailable"): string | null {
  return returnTo !== null && authKind === "unauthenticated" ? `/login?${new URLSearchParams({ returnTo })}` : null;
}

export function postAuthDestination(user: AuthUser, returnTo: unknown): string {
  return user.mustChangePassword ? landingFor(user) : parseReturnTo(returnTo) ?? landingFor(user);
}
