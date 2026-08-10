export class CityGeofenceBackendUnavailableError extends Error {
  public constructor() {
    super("City geofence backend is unavailable.");
    this.name = "CityGeofenceBackendUnavailableError";
  }
}
