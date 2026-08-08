# Fleet alert ingestion

`ALERT_INGESTION_ENABLED` controls the fleet-to-alert bridge and defaults to `false`. Enabling it adds no scheduler timer: the existing fleet interval still calls `FleetSyncService`, which invokes alert ingestion only after the `Vehicle` and `VehicleCurrentState` snapshot transaction has committed.

The bridge accepts only enabled vehicles with a position whose `valid` value is `true`, whose `outdated` value is `false`, and whose fix time, latitude, longitude, and speed are present. Zero speed is valid. A fix time more than the shared 60-second future-skew allowance beyond that vehicle's `fetchedAt` is skipped before journaling or detector mutation.

`fixTime` is the alert observation's `observedAt`; `fetchedAt` is never substituted. Consequently repeated fleet cycles containing the same current position keep the same journal identity and are deduplicated by alert ingestion.

Eligible vehicles are attempted independently. If any attempt fails, all candidates in the snapshot are still attempted and then the first original failure in deterministic candidate order fails the fleet job. The already committed fleet snapshot is not rolled back; a later fleet cycle can repeat the source position or recover a pending journal row.
