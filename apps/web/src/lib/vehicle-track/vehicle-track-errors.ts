export class VehicleTrackBackendBadRequestError extends Error { public constructor() { super("Vehicle track request rejected."); this.name = "VehicleTrackBackendBadRequestError"; } }
export class VehicleTrackBackendNotFoundError extends Error { public constructor() { super("Vehicle not found."); this.name = "VehicleTrackBackendNotFoundError"; } }
export class VehicleTrackBackendTooDenseError extends Error { public constructor() { super("Vehicle track is too dense."); this.name = "VehicleTrackBackendTooDenseError"; } }
export class VehicleTrackBackendUnavailableError extends Error { public constructor() { super("Vehicle track unavailable."); this.name = "VehicleTrackBackendUnavailableError"; } }
