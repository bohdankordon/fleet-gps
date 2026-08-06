# City geofence (Stage 6A.2)

## Offline Vinnytsia city candidate (Stage 6A.2B)

The reviewable dataset is data/geofences/vinnytsia-city/vinnytsia-city.geojson. It is raw, unsimplified Polygon geometry from OpenStreetMap relation 361818, retrieved through Nominatim at 2026-08-06T12:51:43.279Z. Its SHA-256 is c4fdffa2367c055bc985db9bf38178533c6047a21a7e1088da950fbf5d42c88f. This is the city relation (administrative, admin_level=9), not the wider Vinnytsia urban hromada relation 12411968 (admin_level=7).

Run npm run vinnytsia-boundary:verify after building the API for an offline production-validator, checksum, and control-point check. It uses no network, Nest, Prisma, or database. The DB setting remains null, and import apply needs separate review. OSM quality can change, so re-retrieval requires a new checksum and review. Licence and attribution are ODbL-1.0 and © OpenStreetMap contributors; see docs/data-licenses.md.

`ApplicationSettings.cityGeofenceGeoJson` is the local PostgreSQL business setting for one city boundary. It accepts only a raw GeoJSON `Polygon` whose positions use `[longitude, latitude]`; `Feature`, `FeatureCollection`, `MultiPolygon`, network sources, and filenames in production APIs are not accepted.

The pure classifier uses a deterministic planar point-in-polygon algorithm. It supports a closed outer linear ring, holes, concave polygons, horizontal and vertical segments. This is an MVP tradeoff appropriate to one city boundary: it does not perform spherical/geodesic calculations or use PostGIS. A tiny fixed algorithm epsilon is used only for floating-point point-on-segment stability and is not a speed tolerance or UI setting.

The result is `INSIDE`, `OUTSIDE`, `BOUNDARY`, `UNCONFIGURED`, or `INVALID_POINT`. Boundary is separate from inside/outside, including hole boundaries. The speed-zone policy maps `INSIDE` and `BOUNDARY` to `CITY`, `OUTSIDE` to `OUTSIDE_CITY`, and unconfigured/invalid points to `UNKNOWN`. Boundary therefore uses the conservative city limit in a future speed rule. A `null` polygon never means outside city and must not activate an outside-city threshold.

`CityGeofenceService` rereads `AlertSettingsService` for every classification, uses its immutable polygon snapshot, and has no cache. It returns no geometry, raw point, settings row, threshold, or database detail. `CityGeofenceManagementService` shares the existing `validateGeoJsonPolygon` function, validates before writing, and uses a targeted update of the existing singleton only. It is an internal preparation for a future authenticated settings UI; this stage has no HTTP write endpoint.

The read-only diagnostic endpoint is `GET /api/system/city-geofence`. It returns configuration availability, the `CITY` boundary policy, and the settings update time only.

## Controlled local import

`npm run city-geofence:import -- --file <path> --dry-run` validates a local strict-UTF-8 JSON file (maximum 5 MB, checked after reading) without loading `.env`, initializing Nest/Prisma, or touching the database. Its `geofence configured after operation` output is always `false`: dry-run does not change state. `--apply` is explicit and required for a write; it loads root `.env`, forces the scheduler off for an isolated `CityGeofenceModule` application context, then restores the prior scheduler environment. `--clear --apply` clears the setting. File and clear are mutually exclusive, duplicate/unknown flags are rejected, and apply is never performed by default. Output contains only mode and safe aggregate counts, never coordinates, raw JSON, path, database details, or errors.

The compiled smoke compares a before/after safe fingerprint of the `ApplicationSettings` row (`updatedAt` plus whether geofence JSON is null), so its `database writes: 0` confirms this read-only workflow did not alter settings. It also blocks any non-localhost fetch before it can leave the process.

The runtime never queries OpenStreetMap, Overpass, Nominatim, or any other external geofence service. The separately controlled Vinnytsia candidate, source, licence, and checksum are documented below; it is still not imported.
