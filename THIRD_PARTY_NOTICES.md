# Third-party notices

This project is licensed under the MIT License (see [LICENSE](./LICENSE)).
That license covers original Fleet GPS code and documentation. It does not
cover third-party material listed below, which remains under its own terms.

## Traccar API description (historical)

Earlier repository versions vendored `docs/equgps-swagger.json`, a
trimmed and adapted copy of the Traccar v4.3 `swagger.json` API description
(upstream project: Traccar, upstream repository: `traccar/traccar`, upstream
version: v4.3), with only the document title, host, and scheme values adapted
and the remaining endpoints/schema content omitted. The vendored copy was
removed from the current tree; it remains present only in earlier Git history
and tags. Traccar v4.3 is licensed under the Apache License 2.0; the full
license text is bundled locally at
[third_party_licenses/Apache-2.0.txt](./third_party_licenses/Apache-2.0.txt)
(see also the upstream Traccar repository). No statement here implies that
any GPS provider granted an independent open-source license.

## OpenStreetMap geofence data

`data/geofences/vinnytsia-city` contains map data © OpenStreetMap
contributors, licensed under the Open Database License 1.0 (ODbL-1.0).
Public use of this dataset must retain that attribution. See
[docs/data-licenses.md](./docs/data-licenses.md) and
[data/geofences/vinnytsia-city/README.md](./data/geofences/vinnytsia-city/README.md)
for provenance and attribution details.

## Password blocklist derivation

`apps/api/assets/password-policy/common-passwords.bin` is a derived SHA-256
digest index generated from the SecLists common-credentials corpus
(Daniel Miessler SecLists, MIT licensed; source corpus attributed upstream to
the Pwdb project). The repository stores only the derived digest index, not
the upstream plaintext wordlist. See
[apps/api/assets/password-policy/NOTICE.md](./apps/api/assets/password-policy/NOTICE.md)
and `apps/api/assets/password-policy/common-passwords.metadata.json` for the
pinned upstream commit, hashes, and normalization rules.
