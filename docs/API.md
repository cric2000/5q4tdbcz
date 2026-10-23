# API field guide

Local base: `http://localhost:8000`. All endpoints below use **GET**, with no body or authentication. [Swagger](http://localhost:8000/docs) and `/openapi.json` provide exact response types, required fields and executable examples. This guide explains their purpose.

Dates are `YYYY-MM-DD`; timestamps normalize to UTC (`Z`). Supported buying dates are January 1–31, 2026, for January 2–February 1 delivery. Power/errors are MW, percentages are 0–100, and missing values are `null`, never substituted with zero.

## Endpoints and response structure

Paths below are relative to `/api/v1`.

| Endpoint | Request | Top-level response fields |
| --- | --- | --- |
| `/health` | No parameters | `status`, `service`, `phase`, `data_status` — liveness and snapshot state |
| `/config` | No parameters | Policy fields below; available without a snapshot |
| `/metadata` | No parameters | Policy, methodology, `sources`, `snapshot`, `limitations` |
| `/decisions/{decision_date}` | Required buying date in path | `meta`, `decision_date`, `delivery_date`, `cutoff`, `hours`, `metrics` — 24-hour replay |
| `/decisions/{decision_date}/prior-accuracy` | Required buying date in path | `meta`, `decision_date`, `cutoff`, `delivery_start`, `delivery_end`, `metrics` — earlier available evidence |
| `/accuracy` | Optional inclusive `from`, `to`; defaults January 1 and 31 | `meta`, `decision_date_from`, `decision_date_to`, `metrics`, `error_histogram`, `worst_hours` |
| `/accuracy/daily` | Same `from`/`to` | `meta`, `decision_date_from`, `decision_date_to`, `days` |
| `/evolution` | Required `target_time`: timezone-aware exact delivery hour | `meta`, `decision_date`, `delivery_date`, `cutoff`, `comparison`, `publications` |
| `/data-quality` | No parameters | `meta`, `current_coverage`, `missing_hours`, `ingestion` — full-scope diagnostics |

The API-only root `/` returns a welcome page with a `/docs` link. The combined application serves React at `/` and the welcome page at `/api`.

```bash
curl http://localhost:8000/api/v1/decisions/2026-01-14/prior-accuracy
curl 'http://localhost:8000/api/v1/accuracy?from=2026-01-01&to=2026-01-31'
curl --get --data-urlencode 'target_time=2026-01-15T00:00:00Z' http://localhost:8000/api/v1/evolution
```

`from <= to` and both dates must be in scope. Evolution normalizes timezone offsets and then requires an exact hour between January 2 at 00:00 and February 1 at 23:00 UTC. URL-encode positive-offset `+` characters, or use `--data-urlencode`.

## Shared references and dates

Analytical results return a compact `meta` object instead of repeating metadata. Refresh metadata if either reference differs; do not combine inconsistent results.

| Field | Meaning |
| --- | --- |
| `meta.snapshot_id` | Source-content fingerprint, equal to metadata's `snapshot.content_sha256`. Identifies source records and stored scope, not calculation-code version. |
| `meta.decision_cutoff_gmt` | Configured `HH:MM` deadline used for the calculation. The same source snapshot can yield different results under another cutoff. |
| `decision_date` | Buying day; identifies the original forecast deadline. |
| `delivery_date` | Following day; identifies when generation is delivered. |
| `cutoff` | Full UTC buying deadline. Forecast publication equality is eligible. |
| `decision_date_from`, `decision_date_to` | Effective inclusive buying-date range, confirming the analyzed scope. |

## Operational and metadata fields

Health's `status` is `ok`, `service` is `windsight`, and `phase` is the legacy `ingestion` compatibility marker, not progress. `data_status` is `not_ingested`, `snapshot_ready`, `snapshot_incomplete` or `snapshot_invalid`. Health stays HTTP 200 for liveness and does not replace analytical validation.

`/config` returns the following policy fields. `/metadata` includes them too.

| Field | Meaning |
| --- | --- |
| `decision_cutoff_gmt` | Configured deadline; default `09:50`, displayed consistently by the UI. |
| `cutoff_reference_url` | Source supporting the deadline assumption. |
| `cutoff_is_assumed` | `true`; the client has not confirmed this deadline. |
| `decision_date_from`, `decision_date_to` | Inclusive buying-date bounds for inputs. |
| `delivery_date_from`, `delivery_date_to` | Inclusive corresponding delivery-date bounds. |

Additional `/metadata` fields:

| Field | Meaning |
| --- | --- |
| `timezone`, `power_unit` | `UTC`, `MW`; timestamp and value labels. |
| `comparison_resolution_minutes` | `60`; each comparison represents one hour. |
| `actuals_are_retrospective` | Actual generation is reported after its original forecast decision; the prior summary separately checks later availability. |
| `actual_aggregation` | Description of the two-half-hour mean. |
| `error_definition` | Description of forecast minus actual and its sign. |
| `percentile_method` | Description of linear interpolation at `(n - 1) * quantile`. |
| `limitations` | Interpretation and data-coverage caveats. |
| `sources` | Array of `dataset` (name), `documentation_url` (official reference), `native_resolution` (sampling/target interval), `unit` (`MW`). |
| `snapshot` | Provenance fields below. |

| `snapshot` field | Meaning |
| --- | --- |
| `schema_version` | Local storage format version. |
| `content_sha256` | Normalized source-record/scope identity; matches analytical references. |
| `retrieved_at` | Acquisition timestamp; not forecast publication time or proof of the latest upstream revision. |
| `snapshot_created_at` | Local database creation timestamp. |
| `publication_start`, `publication_end_exclusive` | Forecast acquisition window, with an exclusive end. |
| `forecast_records` | Number of stored versions, counting revisions separately. |
| `forecast_target_hours` | Distinct delivery targets with any acquired forecast. |
| `outturn_half_hours` | Stored actual samples; two are required per complete hour. |

## Replay and prior accuracy

Replay's `hours` contains 24 ordered hourly comparisons, including missing rows. Its `metrics` summarizes that delivery day **retrospectively**.

Prior accuracy uses only completed earlier delivery hours. Both stored actual half-hours must have publication times at or before the selected `cutoff`; each forecast keeps its own original buying deadline. Unfinished hours and later actual publications cannot contribute errors.

| Prior-accuracy field | Meaning |
| --- | --- |
| `delivery_start` | First candidate completed hour, or null if none exists. |
| `delivery_end` | Exclusive end of candidate hours, never after cutoff; null for an empty window. |
| `metrics` | Matched statistics and coverage within that window. Missing/unpublished actuals reduce matched coverage. |

At the default cutoff, January 14 has 297 matched earlier hours and MAE **2,124.3 MW**. January 1 has null bounds, zero expected/matched hours and null error statistics. Candidate hours can also exist with no matched pairs; the UI shows insufficient history. Earlier actual vintages absent from the snapshot are not reconstructed.

## Range analysis and publication history

`/accuracy` is a retrospective review. `metrics` uses all matched hours, not an average of daily averages. `worst_hours` contains up to ten hourly comparisons, ordered by descending absolute error then target time. `error_histogram` contains signed-error bins:

| Histogram field | Meaning |
| --- | --- |
| `lower_mw` | Inclusive lower error boundary. |
| `upper_mw` | Upper boundary. |
| `count` | Matched hours in this bin; chart bar height. Counts sum to matched hours. |
| `upper_inclusive` | Only the final bin includes its upper boundary. |

`/accuracy/daily` returns chronological `days`, each with `decision_date`, `delivery_date`, `cutoff` and `metrics`, including days with no matches. These supply the daily trend and coverage table.

`/evolution` returns one hourly `comparison` and all acquired `publications` for that target in chronological order. The history is bounded by the snapshot acquisition window.

| Publication field | Meaning |
| --- | --- |
| `publish_time` | Version availability; chart x-axis. |
| `generation_mw` | Forecast power in that version; chart y-axis. |
| `available_at_cutoff` | Publication was at or before the original buying deadline. |
| `selected_as_of` | Latest eligible publication used for replay; at most one is true. |
| `value_changed_from_previous` | Value differs from the preceding acquired version. Null for the first; false means unchanged republication, not a proven new model run. |

## Hourly comparison fields

Shared by replay `hours`, range `worst_hours`, evolution `comparison` and quality `missing_hours`.

| Field | Meaning and use |
| --- | --- |
| `target_time` | UTC hour start; key for chart points, rows and history links. |
| `forecast_mw` | Latest eligible forecast for that exact target; forecast line. |
| `forecast_published_at` | Selected publication time; deadline audit. |
| `forecast_age_hours_at_cutoff` | Hours between publication and original cutoff; audit field, not time until delivery. |
| `actual_half_hours_mw` | Two readings: target start and 30 minutes later. Each may be null. |
| `actual_mw` | Mean of both readings; null unless both exist. Actual line. |
| `error_mw` | Forecast minus actual; signed-error bars. Null without a matched pair. |
| `absolute_error_mw` | Absolute error; ranks miss size without direction. |
| `status` | `matched` or `missing_data`. |
| `missing_reasons` | Array containing `missing_forecast`, `no_eligible_forecast`, `missing_actual_first_half`, and/or `missing_actual_second_half`; empty for matched hours. |

`missing_forecast` means no acquired forecast. `no_eligible_forecast` means history exists but every publication is too late. Zero forecast/actual values are valid.

## Coverage and metric fields

Coverage appears in `metrics.coverage` and quality's `current_coverage`.

| Coverage field | Meaning |
| --- | --- |
| `expected_hours` | Candidate hours in this response's scope; denominator for coverage. |
| `matched_hours` | Hours with eligible forecast and both actual samples; statistical sample size. |
| `coverage_percent` | `100 * matched / expected`; null only when expected is zero. |
| `missing_forecast_hours` | Hours without any acquired forecast. |
| `no_eligible_forecast_hours` | Hours with history but no eligible publication; excludes wholly absent history. |
| `incomplete_actual_hours` | Hours lacking one or both usable actual readings. |

Missing-reason counts may overlap. Prior accuracy counts not-yet-published actuals as unavailable.

Let `e = forecast - actual`, `a = abs(e)` and `n = matched_hours`.

| Metric field | Meaning and use |
| --- | --- |
| `coverage` | The coverage object above. |
| `mae_mw` | Mean of `a`; average gap size. |
| `rmse_mw` | Square root of mean `e²`; emphasizes larger misses. |
| `bias_mw` | Mean of `e`; average direction. Positive means overforecast. |
| `p50_absolute_error_mw` | Median absolute gap. |
| `p90_absolute_error_mw` | 90th percentile absolute gap; describes larger observed misses. |
| `max_absolute_error_mw` | Largest absolute gap. |
| `overforecast_hours`, `underforecast_hours`, `exact_hours` | Counts of `e > 0`, `e < 0`, `e == 0`; no rounding tolerance. |
| `overforecast_percent`, `underforecast_percent`, `exact_percent` | Corresponding counts divided by `n`, multiplied by 100. |

With no matches, the six error measures and three percentages are null; direction counts are zero. Percentiles interpolate linearly and do not define guaranteed future error intervals.

## Data-quality diagnostics

`/data-quality` returns current full-scope coverage, missing hourly comparisons and the stored `ingestion` report. The report's cutoff may differ from the current runtime policy.

| `ingestion` field | Meaning |
| --- | --- |
| `decision_cutoff_gmt` | Deadline used when ingesting. |
| `expected_hours`, `expected_outturn_half_hours` | Expected hourly targets and half-hour samples. |
| `eligible_forecast_hours`, `complete_actual_hours`, `comparable_hours` | Hours with eligible forecasts, complete actuals, or both. |
| `missing_forecast_targets` | Targets with no acquired forecast. |
| `missing_eligible_forecasts` | Targets with no eligible forecast, including wholly absent history. |
| `missing_outturn_half_hours` | Missing individual actual sample timestamps. |
| `complete`, `conflicts` | Coverage success and conflicting-key count; published valid snapshots have zero conflicts. |
| `forecast_identical_duplicates`, `outturn_identical_duplicates` | Deduplicated identical source records. |
| `forecast_rows_outside_delivery_scope`, `non_wind_rows_filtered` | Excluded forecast targets and non-WIND actual records. |
| `request_count` | Successful acquisition batches, not dashboard requests or retry attempts. |
| `notes` | Validation/interpretation explanations. |
| `daily` | Stored daily availability, with fields below. |

Each `daily` item contains `decision_date`, `delivery_date`, `expected_hours`, `eligible_forecast_hours`, `outturn_half_hours` (available samples), `complete_actual_hours` and `comparable_hours`. These localize coverage gaps by day.

## Errors and client flow

Invalid parameters return **422** with code `invalid_request`. Missing/invalid snapshots return **503** with `snapshot_missing`/`snapshot_invalid`. The response is `{"error":{"code":"...","message":"...","issues":[]}}`. Each issue has `location` (parameter path), `message` (explanation) and `type` (validation category). Unknown routes use the framework's standard 404 response.

Missing observations within a usable snapshot return HTTP 200 with nulls/reasons. Requests never ingest data or create a database.

The UI loads health/config, then metadata. A buying-date change requests replay and prior accuracy; a summary failure leaves the forecast usable. Range analysis coordinates aggregate/daily requests; publication inspection and hour selection do not refetch. Abandoned requests are cancelled, stale results hidden, and snapshot/cutoff references checked before combining evidence.
