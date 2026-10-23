# WindSight API field guide

Base URL for local development: `http://localhost:8000`. All application endpoints use GET and have no request body or authentication. Interactive requests and exact machine-readable schemas are available at `/docs` and `/openapi.json`; `/redoc` provides another generated reference.

## Conventions and shared metadata

- Dates use `YYYY-MM-DD`. Timestamps include a timezone and responses normalize them to UTC (`Z`). January GMT equals UTC.
- Decision day D maps to delivery day D+1. Supported decisions are January 1–31, 2026; delivery is January 2–February 1.
- Power and error values are MW, not MWh. Percentages are 0–100.
- Every field shown in a response is returned. A nullable field can contain `null` when unavailable; `null` is never replaced with zero. Empty collections are `[]`.
- Request parameters marked optional can be omitted. Response-field presence does not mean every field must be displayed in the dashboard; audit fields support explanation and verification.
- Analytical requests read the prepared local snapshot. They do not fetch or ingest Elexon data.

Fetch `/api/v1/metadata` once when opening the analytical dashboard. The five analytical result endpoints return this compact reference instead of repeating the full `context` block:

```json
{
  "meta": {
    "snapshot_id": "<64-character content SHA-256>",
    "decision_cutoff_gmt": "09:50"
  }
}
```

| Field | Type | Meaning and use |
| --- | --- | --- |
| `meta.snapshot_id` | string | Fingerprint of normalized forecast/outturn records, storage schema and stored ingestion scope; equals `/metadata` → `snapshot.content_sha256`. Links results to saved provenance and identifies data/scope changes. It is not a database filename or an ID to submit in requests. |
| `meta.decision_cutoff_gmt` | string | Current configured decision deadline, `HH:MM` GMT. Identifies the selection policy used to calculate the result. The same source data can produce different results at another cutoff. |

Refresh cached metadata if either value differs from the cached metadata. The snapshot fingerprint includes the stored ingestion cutoff and acquisition scope, but does not identify the currently configured analysis cutoff, retrieval time or calculation-code version. Snapshot replacement between separate requests is possible; matching these references avoids combining results from different data or cutoff settings.

## GET `/`

**Request:** no parameters.

**Response:** HTTP 200, HTML displaying “Welcome to the WindSight API” and a `/docs` link. This is a human-friendly entry point, not a JSON data endpoint.

## GET `/api/v1/health`

**Request:** no parameters.

**Response example:**

```json
{
  "status": "ok",
  "service": "windsight",
  "phase": "ingestion",
  "data_status": "snapshot_ready"
}
```

| Field | Type | Meaning and use |
| --- | --- | --- |
| `status` | `"ok"` | API liveness. Used by startup checks and the frontend connection indicator. |
| `service` | `"windsight"` | Identifies the responding service. Helps detect an incorrectly configured API URL. |
| `phase` | `"ingestion"` | Existing scaffold compatibility marker. It is not an analytical-readiness signal and does not mean ingestion is running. |
| `data_status` | string enum | `not_ingested`: no snapshot; `snapshot_ready`: stored ingestion report says complete; `snapshot_incomplete`: stored report says incomplete; `snapshot_invalid`: report cannot be read or validated. Helps the UI display the appropriate setup message. |

Health remains HTTP 200 when data is unavailable because the API itself is alive. This is a lightweight report check, not a full analytical integrity check. Use `/data-quality` for coverage under the current cutoff and the analytical endpoints to verify that the snapshot can be used.

## GET `/api/v1/config`

**Request:** no parameters; works before ingestion.

**Response structure:**

```json
{
  "decision_cutoff_gmt": "09:50",
  "cutoff_reference_url": "https://support.nordpoolgroup.com/support/solutions/articles/8000088463-about-the-n2ex-day-ahead-auction",
  "cutoff_is_assumed": true,
  "decision_date_from": "2026-01-01",
  "decision_date_to": "2026-01-31",
  "delivery_date_from": "2026-01-02",
  "delivery_date_to": "2026-02-01"
}
```

| Field | Type | Meaning and use |
| --- | --- | --- |
| `decision_cutoff_gmt` | string | Configured `HH:MM` deadline. Drives the UI assumption label without hardcoding it in React. |
| `cutoff_reference_url` | string URL | Reference supporting the assumed deadline; enables a source link. |
| `cutoff_is_assumed` | boolean | Marks the deadline as an assumption rather than a confirmed client requirement. |
| `decision_date_from` | date | Earliest supported buying decision; minimum date-picker value. |
| `decision_date_to` | date | Latest supported buying decision; maximum date-picker value. |
| `delivery_date_from` | date | First corresponding next-day delivery date; explains the D→D+1 scope. |
| `delivery_date_to` | date | Last delivery date, inclusive; includes February 1 for the January 31 decision. |

This endpoint supports the existing landing page even without a snapshot. These policy fields also appear in `/metadata`, so analytical screens can obtain them together with provenance in one request. This request does not change configuration.

## GET `/api/v1/metadata`

**Request:** no parameters. Requires a valid snapshot.

**Response structure** (type notation; `Source` and `Snapshot` are expanded below):

```ts
{
  decision_date_from: string;
  decision_date_to: string;
  delivery_date_from: string;
  delivery_date_to: string;
  decision_cutoff_gmt: string;
  cutoff_is_assumed: boolean;
  cutoff_reference_url: string;
  timezone: "UTC";
  power_unit: "MW";
  comparison_resolution_minutes: 60;
  actuals_are_retrospective: boolean;
  actual_aggregation: string;
  error_definition: string;
  percentile_method: string;
  sources: Source[];
  snapshot: Snapshot;
  limitations: string[];
}
```

| Field | Meaning and use |
| --- | --- |
| `decision_date_from`, `decision_date_to` | Inclusive supported decision-date bounds; constrain filters and date pickers. |
| `delivery_date_from`, `delivery_date_to` | Inclusive corresponding delivery-date bounds; explain why February 1 is included. |
| `decision_cutoff_gmt` | Current `HH:MM` forecast-availability cutoff; explains which revisions qualify. |
| `cutoff_is_assumed` | Whether the cutoff is an assumption; drives the assumption disclosure. |
| `cutoff_reference_url` | Source link for that assumption. |
| `timezone` | `UTC`; ensures timestamp labels and comparisons use one clock. |
| `power_unit` | `MW`; chart-axis and KPI units. |
| `comparison_resolution_minutes` | `60`; each comparison represents one delivery hour. |
| `actuals_are_retrospective` | `true`; actual generation was observed after the decision, preventing misleading claims about information available when buying. |
| `actual_aggregation` | Text explaining the mean of both half-hour MW readings; supports tooltips and audit explanations. |
| `error_definition` | Text defining forecast minus actual, positive meaning overforecast; establishes the meaning of chart signs and colors. |
| `percentile_method` | Text describing linear interpolation at `(n - 1) * quantile`; makes P50/P90 reproducible. |
| `sources` | Source descriptions for WINDFOR and FUELHH WIND; attribution and native-resolution explanation. |
| `snapshot` | Source-content identity, acquisition window, freshness and row counts; supports provenance checks and saved exports. |
| `limitations` | Explanation strings about the assumed deadline, potentially different wind populations, retrospective actuals, absent procurement/financial inference, bounded revision history and unchanged republications. Display in methodology/help content. |

Each `sources[]` item:

| Field | Type | Meaning and use |
| --- | --- | --- |
| `dataset` | string | Dataset name; identifies forecast versus outturn source. |
| `documentation_url` | string URL | Official source reference for attribution and verification. |
| `native_resolution` | string | Source sampling/target resolution; explains why actuals need hourly aggregation. |
| `unit` | `"MW"` | Source unit; guards against presenting power as energy. |

The `snapshot` object:

| Field | Type | Meaning and use |
| --- | --- | --- |
| `schema_version` | integer | Local snapshot storage format version; supports reproducibility and compatibility diagnosis. It is not the API version. |
| `content_sha256` | string | Fingerprint of normalized records, storage schema and stored ingestion scope; compare with result `meta.snapshot_id`. |
| `retrieved_at` | UTC timestamp | Acquisition run's retrieval timestamp; freshness label. This is not forecast publication time or proof of the latest upstream revision. |
| `snapshot_created_at` | UTC timestamp | When the local snapshot was built; audit provenance. |
| `publication_start` | UTC timestamp | Inclusive start of the forecast-publication acquisition window; defines how far back stored revision history can reach. |
| `publication_end_exclusive` | UTC timestamp | Exclusive end of that window; makes the history boundary explicit. |
| `forecast_records` | integer | Number of stored forecast versions; revisions count separately. |
| `forecast_target_hours` | integer | Number of distinct delivery hours with any stored forecast; does not imply an eligible pre-cutoff forecast for each hour. |
| `outturn_half_hours` | integer | Number of stored WIND half-hour readings; two are needed for each complete hourly actual. |

## GET `/api/v1/decisions/{decision_date}`

**Request:** `GET /api/v1/decisions/2026-01-01`

| Parameter | Location | Required? | Validation and purpose |
| --- | --- | --- | --- |
| `decision_date` | path | Yes | `YYYY-MM-DD`, January 1–31, 2026. Chooses the historical buying day to replay. |

**Response structure:**

```ts
{
  meta: AnalysisReference;
  decision_date: string;
  delivery_date: string;
  cutoff: string;
  hours: HourlyComparison[];
  metrics: MetricSummary;
}
```

| Field | Meaning and use |
| --- | --- |
| `meta` | Snapshot/cutoff reference described above; checks consistency with cached metadata. |
| `decision_date` | Selected buying day; page title and selected-date confirmation. |
| `delivery_date` | Next day; labels when the electricity is delivered. |
| `cutoff` | Full UTC deadline on the decision day. A forecast is eligible when `publish_time <= cutoff`. Supports publication-age checks and cutoff explanation. |
| `hours` | Always 24 ordered hourly comparison rows, including missing rows; drives forecast/actual charts and the details table. |
| `metrics` | Matched-pair statistics plus coverage for those 24 hours; daily KPI cards. |

The shared `HourlyComparison` and `MetricSummary` fields are expanded below.

## GET `/api/v1/accuracy`

**Request:** `GET /api/v1/accuracy?from=2026-01-01&to=2026-01-31`

| Parameter | Required? | Default | Validation and purpose |
| --- | --- | --- | --- |
| `from` | No | `2026-01-01` | Inclusive decision-date start; selects the beginning of the analysis window. |
| `to` | No | `2026-01-31` | Inclusive decision-date end; selects the end of the analysis window. |

Each supplied date must be in January and use `YYYY-MM-DD`; `from <= to`. Omitting only one parameter keeps the other parameter's default. These are decision dates, not delivery dates. No request-time cutoff override exists; the server's configured cutoff is used.

**Response structure:**

```ts
{
  meta: AnalysisReference;
  decision_date_from: string;
  decision_date_to: string;
  metrics: MetricSummary;
  error_histogram: HistogramBin[];
  worst_hours: HourlyComparison[];
}
```

| Field | Meaning and use |
| --- | --- |
| `meta` | Source-content and cutoff reference. |
| `decision_date_from`, `decision_date_to` | Effective inclusive filter bounds; confirm what period the metrics describe. |
| `metrics` | Statistics over all matched hours in the range; aggregate KPI cards. Daily averages should not replace these hour-weighted calculations. |
| `error_histogram` | Signed-error distribution; shows frequency and direction of over/underforecast. Normally 20 symmetric bins; one bin for all-zero errors, empty if no matches. |
| `worst_hours` | Up to ten matched hours ranked by descending absolute error, ties by ascending target time. Links the largest misses to Replay/Evolution. |

Each histogram bin:

| Field | Type | Meaning and use |
| --- | --- | --- |
| `lower_mw` | number | Inclusive signed-error lower boundary; chart bin start. |
| `upper_mw` | number | Signed-error upper boundary; chart bin end. |
| `count` | integer | Matched hours in the bin; bar height. All bin counts sum to matched hours. |
| `upper_inclusive` | boolean | Whether the upper boundary belongs to this bin. Only the last bin includes it, ensuring the maximum is counted once. |

## GET `/api/v1/accuracy/daily`

**Request:** `GET /api/v1/accuracy/daily?from=2026-01-01&to=2026-01-31`

`from` and `to` have exactly the same types, defaults and validation as `/accuracy`.

**Response structure:**

```ts
{
  meta: AnalysisReference;
  decision_date_from: string;
  decision_date_to: string;
  days: {
    decision_date: string;
    delivery_date: string;
    cutoff: string;
    metrics: MetricSummary;
  }[];
}
```

| Field | Meaning and use |
| --- | --- |
| `meta` | Source-content and configured cutoff reference. |
| `decision_date_from`, `decision_date_to` | Effective inclusive filter bounds. |
| `days` | One chronological entry per decision date, including dates without matched data; daily trend chart and table. |
| `days[].decision_date` | Buying date; trend x-axis and Replay link. |
| `days[].delivery_date` | Corresponding next-day delivery date; avoids confusing decision and delivery. |
| `days[].cutoff` | Full UTC deadline used for that day's selection; audit detail. |
| `days[].metrics` | Statistics and coverage for that day's 24 hours; compares daily performance. |

## GET `/api/v1/evolution`

**Request:** `GET /api/v1/evolution?target_time=2026-01-15T00:00:00Z`

| Parameter | Required? | Validation and purpose |
| --- | --- | --- |
| `target_time` | Yes | Timezone-aware timestamp identifying one exact UTC delivery hour from `2026-01-02T00:00:00Z` through `2026-02-01T23:00:00Z`. Selects the hour whose forecast history is shown. Offsets are normalized to UTC; minutes, seconds and fractional seconds must then be zero. |

For positive timezone offsets, URL-encode the `+` as `%2B`, or use `curl --get --data-urlencode 'target_time=2026-01-15T01:00:00+01:00' ...`.

**Response structure:**

```ts
{
  meta: AnalysisReference;
  decision_date: string;
  delivery_date: string;
  cutoff: string;
  comparison: HourlyComparison;
  publications: {
    publish_time: string;
    generation_mw: number;
    available_at_cutoff: boolean;
    selected_as_of: boolean;
    value_changed_from_previous: boolean | null;
  }[];
}
```

| Field | Meaning and use |
| --- | --- |
| `meta` | Source-content and configured cutoff reference. |
| `decision_date` | Day before the selected delivery hour; connects history to the original buying decision. |
| `delivery_date` | UTC date of the selected target; page label. |
| `cutoff` | Full UTC decision deadline; vertical marker on the publication-history chart. |
| `comparison` | The selected hour's original cutoff-based forecast/actual comparison; links history to the replay result. Its `target_time` identifies the requested delivery hour. |
| `publications` | All acquired versions for this exact target, ordered by publication time; revision chart. Can be empty if no forecast was acquired for this target. |
| `publications[].publish_time` | When the version became available; history x-axis. |
| `publications[].generation_mw` | Forecast MW in that version; history y-axis. |
| `publications[].available_at_cutoff` | Whether publication time is at or before cutoff; separates known information from later revisions. |
| `publications[].selected_as_of` | Whether this is the latest eligible version actually used for replay. At most one is true. |
| `publications[].value_changed_from_previous` | Whether MW differs from the preceding acquired version. First version is `null`; `false` marks unchanged republication. Helps avoid treating every publication as a changed forecast or proven model run. |

The publication history is bounded by metadata's acquisition window. Post-cutoff revisions are shown for retrospective explanation and excluded from the original decision's metrics.

## GET `/api/v1/data-quality`

**Request:** no parameters. Covers the full supported decision window.

**Response structure:**

```ts
{
  meta: AnalysisReference;
  current_coverage: CoverageSummary;
  missing_hours: HourlyComparison[];
  ingestion: IngestionQuality;
}
```

| Field | Meaning and use |
| --- | --- |
| `meta` | Source-content identity and current cutoff. |
| `current_coverage` | Coverage recomputed using the current cutoff; data-completeness banner and diagnostics. |
| `missing_hours` | Every expected hour with missing forecast/actual information and explicit reasons; investigation table. Empty when all hours match. |
| `ingestion` | Stored acquisition/validation audit, using the cutoff configured when ingestion ran; supports reproducibility without rerunning ingestion. |

The `IngestionQuality` object:

| Field | Type | Meaning and use |
| --- | --- | --- |
| `decision_cutoff_gmt` | string | Cutoff at ingestion time; can differ from `meta.decision_cutoff_gmt`. Explains differences between stored and current coverage. |
| `expected_hours` | integer | Expected delivery hours in the full scope, normally 744; completeness denominator. |
| `expected_outturn_half_hours` | integer | Expected actual samples, normally 1,488; two per hour. |
| `eligible_forecast_hours` | integer | Hours with at least one forecast eligible at the ingestion cutoff. |
| `complete_actual_hours` | integer | Hours with both actual half-hours present. |
| `comparable_hours` | integer | Hours with an eligible forecast and a complete actual pair; stored matched coverage. |
| `missing_forecast_targets` | UTC timestamp array | Targets with no acquired forecast at all; diagnoses absent source history. |
| `missing_eligible_forecasts` | UTC timestamp array | Targets with no eligible forecast at the ingestion cutoff, including targets with no forecast at all. Helps distinguish availability from actual-data gaps. |
| `missing_outturn_half_hours` | UTC timestamp array | Missing individual actual sample times; pinpoints gaps. |
| `complete` | boolean | Whether the stored availability checks covered every expected hour; validates the ingestion outcome. |
| `conflicts` | integer | Conflicting duplicate source keys detected; valid published snapshots have zero because ingestion rejects conflicts. |
| `forecast_identical_duplicates` | integer | Identical forecast key/value duplicates deduplicated; acquisition audit. |
| `outturn_identical_duplicates` | integer | Identical actual key/value duplicates deduplicated; acquisition audit. |
| `forecast_rows_outside_delivery_scope` | integer | Forecast rows acquired but excluded because their target was outside the required delivery window; explains raw-versus-stored counts. |
| `non_wind_rows_filtered` | integer | Non-WIND outturn rows excluded; confirms source filtering. |
| `request_count` | integer | Successful acquired request batches recorded in the snapshot; provenance, not dashboard request count or HTTP retry attempts. |
| `daily` | daily coverage object array | Stored availability by decision date; localizes missing coverage. |
| `notes` | string array | Additional validation/interpretation explanations; diagnostics and provenance display. |

Each `ingestion.daily[]` item:

| Field | Type | Meaning and use |
| --- | --- | --- |
| `decision_date` | date | Buying day; identifies the audited decision. |
| `delivery_date` | date | Next-day delivery day; connects forecast and actual coverage. |
| `expected_hours` | integer | Expected hourly targets for that day, normally 24. |
| `eligible_forecast_hours` | integer | Targets with an eligible forecast at the stored ingestion cutoff. |
| `outturn_half_hours` | integer | Available actual samples that day, normally 48. |
| `complete_actual_hours` | integer | Hours with both actual samples. |
| `comparable_hours` | integer | Hours with both an eligible forecast and complete actuals. |

## Shared hourly comparison fields

Used in `decisions.hours[]`, `accuracy.worst_hours[]`, `evolution.comparison` and `data-quality.missing_hours[]`.

```ts
type HourlyComparison = {
  target_time: string;
  forecast_mw: number | null;
  forecast_published_at: string | null;
  forecast_age_hours_at_cutoff: number | null;
  actual_half_hours_mw: [number | null, number | null];
  actual_mw: number | null;
  error_mw: number | null;
  absolute_error_mw: number | null;
  status: "matched" | "missing_data";
  missing_reasons: string[];
};
```

| Field | Meaning and use |
| --- | --- |
| `target_time` | UTC start of the delivery hour, covering `[target_time, target_time + 1 hour)`. Shared key for chart points, table rows and Evolution links. |
| `forecast_mw` | Latest eligible forecast for this exact target; original decision's forecast line. Null if none qualifies. |
| `forecast_published_at` | Publication timestamp of that selected version; verifies availability at cutoff. Null without a selected forecast. |
| `forecast_age_hours_at_cutoff` | `(cutoff - forecast_published_at)` in hours; shows how old the available information was. This is age at decision, not time until delivery. |
| `actual_half_hours_mw` | Fixed two-element array: reading at target start, then reading 30 minutes later. Each may be null. Provides an audit trail for aggregation. |
| `actual_mw` | Mean of both actual half-hours; null unless both exist. Retrospective actual line. |
| `error_mw` | `forecast_mw - actual_mw`; positive overforecast, negative underforecast. Null unless both values exist. Drives signed-error bars. |
| `absolute_error_mw` | Absolute signed error; ranks miss size without direction. Null without a matched pair. |
| `status` | `matched` when error can be calculated, otherwise `missing_data`; supports gaps and status badges. |
| `missing_reasons` | Explicit reasons for missing data; empty for matched hours. Supports useful explanations rather than showing zero. |

Allowed `missing_reasons`:

| Value | Meaning |
| --- | --- |
| `missing_forecast` | No acquired forecast for this target. |
| `no_eligible_forecast` | Acquired forecasts exist, but all were published after the decision cutoff. |
| `missing_actual_first_half` | No actual reading at target start. |
| `missing_actual_second_half` | No actual reading at target + 30 minutes. |

Multiple reasons can apply to one hour. A valid zero forecast or actual is retained as zero.

## Shared coverage fields

`CoverageSummary` appears inside every `metrics.coverage` and at `data-quality.current_coverage`.

| Field | Type | Meaning and use |
| --- | --- | --- |
| `expected_hours` | integer | All expected hours in this response's scope; coverage denominator. |
| `matched_hours` | integer | Hours with eligible forecast and both actual samples; statistical sample size. |
| `coverage_percent` | number or null | `100 * matched_hours / expected_hours`; coverage KPI. Null only for an empty expected scope. |
| `missing_forecast_hours` | integer | Hours with no acquired forecast at all; source-gap diagnosis. |
| `no_eligible_forecast_hours` | integer | Hours with forecast history but none available at cutoff; cutoff-availability diagnosis. Unlike the ingestion list, this excludes wholly absent forecast history. |
| `incomplete_actual_hours` | integer | Hours missing one or both actual samples; explains unavailable hourly actuals. |

Missing forecast and missing actual counts can overlap, so their sum is not necessarily the number of unmatched hours.

## Shared metric fields

All error statistics use matched hours only. Let `e = forecast - actual`, `a = abs(e)`, and `n = matched_hours`. All fields below are present in `MetricSummary`.

| Field | Type | Meaning and use |
| --- | --- | --- |
| `coverage` | CoverageSummary | Expected versus matched sample and missing counts; keeps the statistics honest about available data. |
| `mae_mw` | number or null | Mean of `a`; typical absolute miss, useful as the main accuracy KPI. |
| `rmse_mw` | number or null | Square root of mean `e²`; emphasizes larger misses. |
| `bias_mw` | number or null | Mean of `e`; indicates direction of this series comparison. Positive means overforecast. |
| `p50_absolute_error_mw` | number or null | Median absolute error; typical observed magnitude with less sensitivity to extremes. |
| `p90_absolute_error_mw` | number or null | 90th percentile absolute error; describes the upper part of observed error magnitudes. Uses linear interpolation and is not a future prediction interval. |
| `max_absolute_error_mw` | number or null | Largest absolute miss; highlights the worst matched hour. |
| `overforecast_hours` | integer | Count of `e > 0`; frequency of overforecast. |
| `underforecast_hours` | integer | Count of `e < 0`; frequency of underforecast. |
| `exact_hours` | integer | Count of `e == 0`, with no tolerance/rounding rule; exact matches. |
| `overforecast_percent` | number or null | `100 * overforecast_hours / n`; overforecast share of matched hours. |
| `underforecast_percent` | number or null | Corresponding underforecast share. |
| `exact_percent` | number or null | Corresponding exact-match share. |

If there are no matched hours, the six error statistics and three percentages are null, and the three direction counts are zero. Over/under/exact percentages use matched hours, while coverage uses expected hours. The source populations may differ, so these figures do not establish intrinsic model bias, a purchase quantity or financial loss.

## Error responses

Analytical routes document HTTP 422 for invalid requests and HTTP 503 for unavailable/invalid snapshots.

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Request parameters are invalid.",
    "issues": [
      {
        "location": ["query", "target_time"],
        "message": "Field required",
        "type": "missing"
      }
    ]
  }
}
```

| Field | Meaning and use |
| --- | --- |
| `error` | Error envelope; distinguishes a failed request from successful analytical data. |
| `error.code` | Stable category: `invalid_request` (422), `snapshot_missing` (503), or `snapshot_invalid` (503); selects the frontend recovery message. |
| `error.message` | Human-readable explanation; display in an error state. |
| `error.issues` | Parameter-validation details; may be empty for scope errors or snapshot failures. |
| `error.issues[].location` | Parameter path containing strings or array indices, for example `["query", "target_time"]`; associates the problem with an input. |
| `error.issues[].message` | Description of the individual validation failure. |
| `error.issues[].type` | Validator category, such as `missing`; supports input-specific handling without parsing prose. |

Missing analytical data within a valid snapshot is a successful HTTP 200 response with null fields and explicit reasons. It is different from an unusable snapshot, which returns 503. The application does not create or ingest a snapshot in response to a failed request. Unrecognized routes use the framework's standard 404 response, not this analytical error envelope.

## Implemented frontend request flow

1. Application setup: fetch `/health` and `/config` for connectivity, setup status and the assumption label.
2. Selected analytical workspace: fetch `/metadata` for common provenance and methodology.
3. Decision Replay: fetch `/decisions/{decision_date}` when the selected buying day changes.
4. Accuracy & Risk: fetch `/accuracy` and `/accuracy/daily` together with the same inclusive buying-date filters. Validate both references before showing either result.
5. Forecast Evolution: fetch `/evolution?target_time=...` for the chosen delivery hour, including when opening an accuracy outlier. Publication inspection is local state and does not fetch again.
6. Data diagnostics: `/data-quality` remains available through the API; a dedicated diagnostics screen is not implemented.

Keep units, assumption disclosure and source-population limitations available in the UI even though they no longer repeat in each analytical result. Check result `meta` against cached metadata before combining responses.
