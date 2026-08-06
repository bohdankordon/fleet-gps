# Vinnytsia city boundary dataset

This is a reviewable, offline candidate dataset for future city-versus-outside-city classification. It is not applied to PostgreSQL: ApplicationSettings.cityGeofenceGeoJson remains null, and city-geofence:import --apply has not been run.

## Scope and source selection

The dataset is the boundary for **місто Вінниця / Vinnytsia city**, not the Vinnytsia urban territorial hromada. The selected OpenStreetMap object is relation [361818](https://www.openstreetmap.org/relation/361818): Nominatim returned it as a boundary=administrative relation with admin_level=9, place=city, name:prefix=місто, and the display name “Вінниця, Вінницька міська громада, Вінницький район, Вінницька область, Україна”.

The relevant hromada candidate was separately checked and rejected: relation [12411968](https://www.openstreetmap.org/relation/12411968), “Вінницька міська громада”, has admin_level=7, place=municipality, and a larger bounding box. It includes settlements such as Вінницькі Хутори and Десна, whose control points are outside this city polygon. The wider Vinnytsia oblast relation 90726 was also rejected.

The official [Vinnytsia City Council geoportal](https://map.vmr.gov.ua/) is a visual/reference source only. Its public portal description lists a “межі населених пунктів” layer. No geoportal API was scraped or used to produce this file, and this repository does not claim that the geoportal offers downloadable GeoJSON. The official portal confirms that a settlement-boundaries layer exists, but its interactive map did not render in the Codex environment. Direct visual comparison remains pending project-owner manual verification; this repository makes no claim that the official polygon matches the OSM candidate.

## Retrieval and integrity

The candidate was retrieved at 2026-08-06T12:51:43.279Z from the public Nominatim service using a manual search for Vinnytsia, Ukraine, with format=jsonv2, polygon_geojson=1, addressdetails=1, extratags=1, limit=10, and the named User-Agent taxi-gps-stage-6a2b-boundary-research/1.0 (offline dataset preparation). Nominatim did not expose a version header in the saved research result. The repository retains only selected metadata, not the full Nominatim response.

The selected result had osm_type=relation, osm_id=361818, category=boundary, type=administrative, display name “Вінниця, Вінницька міська громада, Вінницький район, Вінницька область, Україна”, and bounding box 49.1873426..49.2865952 / 28.3679759..28.5920400. Its OSM tags included boundary=administrative, name=Вінниця, admin_level=9, place=city, and name:prefix=місто. Nominatim did not return a name:uk field for this object.

Nominatim returned raw Polygon geometry. Only the external response wrapper was removed; coordinates were not simplified, buffered, reprojected, manually edited, or otherwise geometrically changed. The file has one ring and 653 positions. Its SHA-256 is:

    c4fdffa2367c055bc985db9bf38178533c6047a21a7e1088da950fbf5d42c88f

Run npm run vinnytsia-boundary:verify after building the API to validate the strict UTF-8 file, production Polygon validator, metadata, checksums, and control points entirely offline. The verifier makes no network request and initializes neither Nest nor Prisma. The import dry-run remains separate:

    npm run city-geofence:import -- --file data/geofences/vinnytsia-city/vinnytsia-city.geojson --dry-run

## Control points and limitations

Inside points are public references for Maidan Nezalezhnosti, Vinnytsia railway station, and the Pirogov National Museum-Estate. Outside points use public settlement-centre references for Вінницькі Хутори and Десна (both identified by manual Nominatim research as places in the Vinnytsia urban hromada) plus a remote non-residential reference point. Boundary points are exact vertices from distinct parts of the outer ring. They are test fixtures, not vehicle, user, or private-home coordinates.

OpenStreetMap is an operational candidate, not an official state register; its geometry and tags can change. Any re-retrieval requires a new checksum, control-point review, and explicit review before import. Attribution is required: © OpenStreetMap contributors, licensed under ODbL 1.0.
