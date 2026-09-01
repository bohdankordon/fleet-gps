export type FleetMapFeatureId = string | number;
export type FleetMapScreenPoint = Readonly<{ x: number; y: number }>;
export type FleetMapHoverCandidate = Readonly<{
  id: FleetMapFeatureId;
  coordinate: readonly [number, number];
}>;

type FleetMapFeatureStateWriter = Readonly<{
  setFeatureState(target: Readonly<{ source: string; id: FleetMapFeatureId }>, state: Readonly<{ hover: boolean }>): void;
}>;

const DISTANCE_TIE_EPSILON_SQ = 1e-9;

function featureIdSortKey(id: FleetMapFeatureId): string {
  return `${typeof id}:${String(id)}`;
}

export function selectNearestMapFeature(
  candidates: readonly FleetMapHoverCandidate[],
  cursor: FleetMapScreenPoint,
  project: (coordinate: readonly [number, number]) => FleetMapScreenPoint,
  maxDistance: number,
): FleetMapFeatureId | null {
  const closestDistanceById = new Map<FleetMapFeatureId, number>();
  for (const candidate of candidates) {
    const projected = project(candidate.coordinate);
    const dx = projected.x - cursor.x;
    const dy = projected.y - cursor.y;
    const distanceSq = dx * dx + dy * dy;
    if (!Number.isFinite(distanceSq) || distanceSq > maxDistance * maxDistance) continue;
    const previous = closestDistanceById.get(candidate.id);
    if (previous === undefined || distanceSq < previous) closestDistanceById.set(candidate.id, distanceSq);
  }

  let nearestId: FleetMapFeatureId | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;
  for (const [id, distanceSq] of closestDistanceById) {
    const distanceDelta = distanceSq - nearestDistanceSq;
    if (distanceDelta < -DISTANCE_TIE_EPSILON_SQ || (Math.abs(distanceDelta) <= DISTANCE_TIE_EPSILON_SQ && (nearestId === null || featureIdSortKey(id) < featureIdSortKey(nearestId)))) {
      nearestId = id;
      nearestDistanceSq = distanceSq;
    }
  }
  return nearestId;
}

export function updateFleetMapHoverState(
  writer: FleetMapFeatureStateWriter,
  source: string,
  previousId: FleetMapFeatureId | null,
  nextId: FleetMapFeatureId | null,
): FleetMapFeatureId | null {
  if (previousId === nextId) return previousId;
  if (previousId !== null) writer.setFeatureState({ source, id: previousId }, { hover: false });
  if (nextId !== null) writer.setFeatureState({ source, id: nextId }, { hover: true });
  return nextId;
}
