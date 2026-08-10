# Historical vehicle track map UI

`/vehicles/<vehicleId>/track` is an SSR-backed contextual page linked from the vehicle card. It is not a top-level navigation item and it does not call eQuGPS, run synchronization, or write history/current state.

## Exact track and sampled overview

The page derives its mode only from absolute elapsed time in the canonical `?from=<absolute ISO>&to=<absolute ISO>` range:

- up to and including 24 hours: `Точный трек`, loaded through the same-origin exact BFF and `GET /api/vehicles/:vehicleId/track`;
- more than 24 hours and up to and including 7 days: `Сэмплированный обзор`, loaded through the same-origin overview BFF and `GET /api/vehicles/:vehicleId/track/overview`;
- more than 7 days: local invalid-range state without a track request.

No mode query parameter is used, so a shared or reloaded URL deterministically selects the same API. Presets request the latest 1 hour, 6 hours, 24 hours, 3 days, or 7 days using a freshly captured clock. Exactly 24 hours remains exact; 24 hours plus one millisecond selects overview.

The exact BFF preserves the Stage 11C contract: all persisted observations, at most 10,000 points, no sampling, and a maximum 24-hour range. The overview BFF accepts at most 7 days and strictly validates the Stage 12A sampled contract, including `sampled: true`, segment metadata, counts, ordering, timestamps, coordinates, nullable quality, and cross-field totals. Both BFFs forward only `vehicleId`, `from`, and `to`; unknown fields and malformed backend bodies are rejected. Safe status mapping is 400 invalid request, 404 unknown vehicle, mode-specific 422, 502 malformed backend contract, and 503 unavailable.

## Custom Europe/Kyiv period

Minute-precision native inputs labelled `С` and `До` interpret wall-clock input in `Europe/Kyiv`, never the browser or server timezone. Successful values become canonical absolute UTC query parameters. The existing nonexistent and ambiguous DST-time rules are unchanged. Validation requires `from < to` and an absolute elapsed duration no longer than 7 days; the boundary is independent of civil-day length.

The loaded range is separate from the editable draft. Presets and successful custom loads synchronize the draft. Incomplete or dirty edits do not alter the loaded range, manual refresh, mode, or URL. Manual refresh reloads the last successfully selected absolute interval.

## Presentation truthfulness

Exact presentation preserves API order and every validated observation. It does not sort, deduplicate, interpolate, smooth, snap, cluster, or sample. The Stage 11D conservative rule connects adjacent exact observations only when their timestamp gap is no more than 300 seconds; a larger gap creates a line break.

Overview presentation uses the server `segments[]` as the sole continuity authority. Every returned sampled point is displayed without client sampling, sorting, or deduplication. Each server segment with two or more points becomes exactly one LineString, even when adjacent sampled timestamps are more than 300 seconds apart. Separate server segments are never joined. Consequently the client never recomputes overview gaps from sampled timestamps.

The visible badge describes the currently displayed last-good data, not a failed requested mode. Exact summary shows points, start, end, and conservative gaps. Overview summary separately shows raw saved points, returned points, start, end, raw-derived gaps, and segment count. It also reports the exact raw `qualityWarningCount`; this is not presented as the number of visible warning markers. The overview disclaimer states that intermediate GPS points may be omitted and that gaps were calculated from the complete saved observation set.

## Request, camera, and selection state

Exact and overview share one discriminated load state and one request lifecycle with a single-flight guard, AbortController, generation checks, safe retry, and last-good retention. A failed new range leaves the previous exact or overview map visible and reports the failure separately. Exact 422 asks for a smaller exact period; overview 422 reports too many separate sections and does not retry automatically.

New ranges and exact/overview transitions fit the loaded track. Same-range manual refresh preserves pan and zoom. Overview selection is ephemeral and has no invented internal ID; same-mode same-range refresh retains it only when the complete public point tuple still matches. A mode or range change clears stale selection unless that same safe tuple match applies.

MapLibre keeps the established same-origin worker bootstrap and stable GeoJSON source/layer identifiers. Mode changes update those sources with `setData`; they do not recreate the map or add duplicate layers. Layer order, city-geofence fallback, endpoint emphasis, quality styling, responsive controls, and accessible map descriptions remain shared with the exact presentation.
