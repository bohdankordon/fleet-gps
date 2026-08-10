export type FleetMapBasemapState = Readonly<{ loaded: boolean; error: boolean }>;

export function initialFleetMapBasemapState(): FleetMapBasemapState { return { loaded: false, error: false }; }
export function recordFleetMapBasemapError(state: FleetMapBasemapState): FleetMapBasemapState { return state.loaded ? state : { loaded: false, error: true }; }
export function recordFleetMapBasemapLoad(): FleetMapBasemapState { return { loaded: true, error: false }; }
