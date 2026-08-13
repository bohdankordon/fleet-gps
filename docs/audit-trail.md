# Audit trail

Stage 20A provides durable, append-only administration and security audit persistence. `AuditEvent` rows are product records: product code creates them but does not update, delete, prune, or retain them.

## Catalog and current writers

The approved catalog is:

- `USER_CREATED`
- `USER_ACCESS_CHANGED`
- `USER_DISABLED`
- `USER_ENABLED`
- `USER_PASSWORD_RESET`
- `OWN_PASSWORD_CHANGED`
- `SHORT_POPULATION_EXECUTED`
- `DURABLE_POPULATION_CREATED`
- `RETENTION_EXECUTED`
- `SYSTEM_POPULATION_CREATED`
- `AUTOMATIC_RETENTION_EXECUTED`

Stage 20A writes only `USER_DISABLED`, `DURABLE_POPULATION_CREATED`, and `RETENTION_EXECUTED`. Stage 20B will integrate the remaining approved events. Stage 20C is reserved for ADMIN audit viewing.

## Actors, targets, and details

Actors are `USER` or `SYSTEM`. A newly-created USER event has the authenticated user ID and a preserved login snapshot using the application's login format. SYSTEM events have neither value; historical USER rows may later have a null actor ID because deletion of an AuthUser uses `SET NULL` while preserving the login snapshot. No fake SYSTEM user is created.

Targets are generic: `USER`, `POSITION_HISTORY`, `POSITION_HISTORY_POPULATION_RUN`, or `POSITION_HISTORY_RETENTION`. They do not add generic target foreign keys.

Details are strict per-event allowlists:

- `USER_DISABLED`: `targetLoginSnapshot`
- `DURABLE_POPULATION_CREATED`: `to`, `windowBudget`, `excludeProviderDisabled`
- `RETENTION_EXECUTED`: `canonicalAnchor`, `policyCutoff`, `deletedCheckpoints`, `deletedObservations`, `remainingFullyObsoleteCheckpoints`, `remainingExecutableObservationCandidates`, `stoppedByBudget`

Audit details never contain passwords, temporary passwords, session tokens, cookies, provider tokens or URLs, raw payloads or errors, stack traces, GPS coordinates or fingerprints, external device IDs, or Telegram values.

## Transaction behavior

`USER_DISABLED` writes its audit event in the same transaction as disabling the target and revoking that target's sessions. `DURABLE_POPULATION_CREATED` writes in the same transaction as its browser-created durable run.

Manual retention writes `RETENTION_EXECUTED` only after a bounded destructive invocation returns a normal factual result with deletions. Retention deliberately is not one giant transaction: short committed checkpoint-first deletion batches preserve its 5000/25000 limits and partial crash safety. If a final audit append or process fails after batches committed, the destructive work is not compensated and a corresponding audit event may be absent.

There is no audit for 401/403 responses, login failures, GET requests, or scheduler no-work outcomes. Stage 20A has no audit UI or public API, and no audit deletion or retention product feature.
