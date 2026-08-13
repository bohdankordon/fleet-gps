# GPS history retention planning (Stage 19A)

Stage 19A adds a completely read-only retention audit to the existing `/admin/history` page. `GET /api/system/position-history/retention-plan` calculates policy truth from the server current instant, reuses the Stage 18C canonical latest-occurred Tuesday 02:00 UTC function, and subtracts exactly 90 elapsed 24-hour days. The page-selected history `?to=` value is not sent to this endpoint and cannot change its canonical anchor or cutoff. The Nest and Next responses use `Cache-Control: no-store`, require effective `historyAdmin.view`, and expose aggregate numbers and timestamps only.

Observation policy eligibility is strictly `observedAt < policyCutoff`; an observation exactly at the cutoff remains protected. Stage 14 checkpoint target ranges retain their existing closed/inclusive `[rangeFrom, rangeTo]` meaning:

- `FULLY_OBSOLETE`: `rangeTo < policyCutoff`.
- `BOUNDARY_OVERLAP`: `rangeFrom < policyCutoff` and `rangeTo >= policyCutoff`.
- `PROTECTED`: `rangeFrom >= policyCutoff`.

Consequently, a checkpoint ending exactly at the cutoff is boundary-overlapping, not fully obsolete. `PENDING`, `RUNNING`, and `COMPLETED` are independent facts and are reported within each range class.

The planner uses one set-based PostgreSQL aggregate statement for all observation and checkpoint facts. It does not acquire advisory lock `1706170003`, contact eQuGPS, invoke a worker or population executor, create a durable run, or write observations/checkpoints. A browser plan may become slightly stale while population progresses; any future destructive execution must re-evaluate facts under its own coordinated safety boundary instead of trusting an earlier plan.

The count of observations older than the policy cutoff is not an assertion that all those rows are immediately safe to delete. Boundary-overlapping checkpoint targets remain explicitly protected because they also cover the protected cutoff instant or a newer interval. No Stage 19B deletion algorithm has been finalized: Stage 19A does not split, truncate, rewind, rewrite, or remove checkpoints and does not delete observations.

A future coordinated design may consider fully obsolete observations/checkpoints, but it must never leave stale completed-checkpoint truth for deleted history. Preserving the ability to repopulate after a future 90-to-365-day expansion remains mandatory.

There is no retention scheduler, automatic cleanup, durable retention job, delete/cleanup button, policy-days selector, environment setting, provider request, schema change, migration, or new permission in Stage 19A.
