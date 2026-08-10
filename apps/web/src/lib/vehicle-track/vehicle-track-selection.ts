import type { VehicleTrackPoint } from "./vehicle-track-contract";
import type { VehicleTrackPresentationModel, VehicleTrackPresentationPoint } from "./vehicle-track-presentation";

function samePoint(left: VehicleTrackPoint, right: VehicleTrackPoint): boolean {
  return left.observedAt === right.observedAt && left.latitude === right.latitude && left.longitude === right.longitude && left.speedKph === right.speedKph && left.valid === right.valid && left.outdated === right.outdated;
}
export function selectedVehicleTrackPoint(model: VehicleTrackPresentationModel, key: string | null): VehicleTrackPresentationPoint | null { return key === null ? null : model.points.find((point) => point.key === key) ?? null; }
export function reconcileVehicleTrackSelection(previous: VehicleTrackPresentationModel, next: VehicleTrackPresentationModel, key: string | null, sameRange: boolean): string | null {
  const selected = selectedVehicleTrackPoint(previous, key); if (!sameRange || !selected) return null;
  return next.points.find((candidate) => samePoint(selected.point, candidate.point))?.key ?? null;
}
