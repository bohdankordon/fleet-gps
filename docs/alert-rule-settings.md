# Alert rule settings (Stage 6A.1)

`ApplicationSettings` remains the PostgreSQL singleton (`id = 1`) for application-wide rules. The defaults are persisted in the database: city limit 50 km/h, outside-city limit 90 km/h, tolerance 10 km/h, two speeding confirmations, inactivity distance 300 m, and inactivity duration 60 minutes. Operational `.env` is not a source of business rules.

The effective speeding thresholds are computed at read time, never stored separately: city `citySpeedLimitKph + speedToleranceKph` and outside-city `outsideCitySpeedLimitKph + speedToleranceKph`. With defaults they are 60 and 100 km/h.

`GET /api/system/alert-settings` is read-only and returns the future UI contract. No edit endpoint or UI is included yet. The service reads PostgreSQL on every call without a cache, so a future edit becomes visible without restart. A future detector must read this service once for each batch/cycle.

The city geofence is a nullable PostgreSQL JSON value in exact GeoJSON `Polygon` form. PostGIS is not used. It is currently `null`, which is reported as `configured: false`; no coordinates are invented. Only a configured `Polygon` with closed, finite longitude/latitude rings is accepted by the runtime validation. Feature, FeatureCollection, GeometryCollection, and MultiPolygon are rejected.

This stage has no GPS-position processing, detector, rule background job, Telegram integration, notification, map, or alert-event persistence.

Run the compiled, read-only smoke separately with `npm run alert-settings:smoke`. It disables the scheduler, redirects eQuGPS origins to invalid local-safe values, makes no eQuGPS requests, and performs no database writes.
