export class VehicleDetailsBackendBadRequestError extends Error { public constructor() { super("Vehicle details backend rejected the request."); this.name = "VehicleDetailsBackendBadRequestError"; } }
export class VehicleDetailsBackendNotFoundError extends Error { public constructor() { super("Vehicle not found."); this.name = "VehicleDetailsBackendNotFoundError"; } }
export class VehicleDetailsBackendUnavailableError extends Error { public constructor() { super("Vehicle details backend is unavailable."); this.name = "VehicleDetailsBackendUnavailableError"; } }
