import type { FleetPersistenceResult, FleetSnapshot } from "./fleet.types";

export interface FleetRepository {
  persistSnapshot(snapshot: FleetSnapshot): Promise<FleetPersistenceResult>;
}
