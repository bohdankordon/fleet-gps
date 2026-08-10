# Historical vehicle track map UI

`/vehicles/<vehicleId>/track` is an SSR-backed contextual page linked from the vehicle card. It is not a top-level navigation item. The browser calls the same-origin Next BFF, which validates and forwards only `vehicleId`, `from`, and `to` to the Stage 11C Nest endpoint. The page never calls eQuGPS, runs synchronization, or writes history/current state.

Without query boundaries the server captures one clock instant and requests the preceding six hours. Supplying both valid absolute boundaries preserves that explicit range; one missing or invalid boundary produces a safe invalid-range state with working presets. Presets request the latest 1, 6, or 24 hours using a fresh explicit clock. Manual refresh keeps the current absolute interval. There is no polling.

The strict BFF contract allows at most 10,000 points and rejects unknown fields, invalid UUIDs/timestamps/coordinates/quality, negative speed, and inconsistent summaries. Safe status mapping is 400 invalid request, 404 unknown vehicle, 422 too dense, 502 malformed backend contract, and 503 unavailable. Initial 422 keeps controls usable; refresh failures and 422 preserve the last-good map. Requests use one AbortController, a single-flight guard, and generation checks.

The presentation model preserves API order and every validated persisted point. It does not sort, deduplicate, interpolate, smooth, snap, cluster, or sample. Adjacent observations are connected only when their absolute timestamp gap is from zero through 300 seconds. A gap above 300 seconds breaks the line and increments the presentation-only gap count; this is not a trip or stop classification.

MapLibre uses the existing same-origin worker bootstrap and OpenFreeMap Positron style. The track page creates stable GeoJSON line and point sources once, then updates them with `setData`. Layer order is city geofence, track line, normal points, quality-warning points, start/end emphasis, selected emphasis, then basemap symbol labels. Provider-invalid or outdated observations remain visible as warning points with a text legend. Null quality is unknown, not bad.

Start and end use labelled, differently sized visual emphasis. A one-point track creates one `single` endpoint and explains that start and end coincide. Clicking a point shows time, speed, and provider quality text without coordinates or persistence/provider identifiers. Selection uses an ephemeral validated-array index; a same-range refresh preserves it only when the complete presentation tuple still matches.

Initial/new ranges fit the track; one point uses a useful fixed zoom. Empty tracks fit the configured city geofence or the existing Vinnytsia fallback. Same-range refresh preserves manual pan/zoom. Geofence load is optional and performed once; it never classifies historical points.
