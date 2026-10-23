# My understanding and implementation approach

**Current status: all three analytical views are deployed and verified.** The public application is [windsight-five.vercel.app](https://windsight-five.vercel.app). This document explains the technical choices, observed results and limitations.

## What I understand the customer needs

I am building a historical pilot for a GB electricity utility making day-ahead buying decisions. I want to reconstruct the national wind forecast available before a decision, then compare it with reported wind output after delivery. I cannot calculate the utility’s actual electricity purchase quantity because the allowed datasets do not include its demand, existing contracts or prices.

I use React, Python and Docker, and limit calculations to January 2026 buying decisions and Elexon national wind data. I keep the client’s decision-support needs separate from implementation assumptions.

## Sources, inference and my choice

The official source pages were checked during setup. Elexon’s JavaScript documentation was inspected in a browser.

| Source | What the documentation supports | My interpretation / choice |
| --- | --- | --- |
| [Elexon WINDFOR stream](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream) | Identifies this as wind generation forecast; exposes publication and target timestamps and MW generation. | I preserve `publishTime` as information availability and `startTime` as the delivery target. I plan to select the latest eligible publication separately for every hourly target. |
| [Elexon FUELHH stream](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) | Describes generation outturn for GB by fuel type, updated every half hour with mean MW for each half hour. It disallows combining settlement-date and publication-date filters. | I will filter WIND and fetch by settlement date. I will average the two adjacent half-hour readings for each complete hour before comparison; this alignment is my analytical choice. |
| [Nord Pool N2EX guide](https://support.nordpoolgroup.com/support/solutions/articles/8000088463-about-the-n2ex-day-ahead-auction) | The guide, dated July 26, 2022, gives next-day physical delivery and a 09:50 GMT gate closure. | I use this as a reference scenario for a missing client deadline. I do not claim it is a universal UK rule or current operational market specification. |

I interpret January **decision dates** as January 1–31, with next-day delivery January 2–February 1. This follows my chosen D→D+1 model. Ingestion has now verified source availability for all 744 target hours, including all 24 February 1 hours for the January 31 decision. January GMT equals UTC, and timestamps are normalized to timezone-aware UTC instants.

## The implemented calculation

For each hour h on D+1, I choose the WINDFOR record with maximum `publishTime` satisfying `publishTime <= cutoff(D)`. An exactly-equal publication is eligible. A missing eligible forecast stays missing. Later revisions remain available in the evolution API but are excluded from the original decision replay.

I calculate `actual_hourly_average_mw = (actual[h] + actual[h+30min]) / 2` only when both outturn observations exist. Signed error is forecast minus that hourly mean, with positive values meaning overforecast. MAE, RMSE, bias, P50/P90 absolute error and over/under/exact shares use valid pairs only. Coverage uses all 744 expected hours, and the live data has 744 matches.

I distinguish missing forecasts, forecasts published only after the cutoff, and missing actual half-hours. Zero generation remains valid. With no matched pairs, error metrics and over/under shares are null. Percentiles use linear interpolation at `(n - 1) * quantile`; they describe observed errors, not a promise about tomorrow.

I also recognize a comparison limitation: WINDFOR and FUELHH can represent different wind populations. Their difference does not isolate model error or establish a financial loss. MW is power; MWh requires an explicit duration.

## Application foundation

I chose React/TypeScript/Vite and FastAPI with Pydantic settings. The API exposes service health, snapshot status and pilot configuration, with no data ingestion at startup. Configuration is returned by the API so the React page does not duplicate the deadline. The application distinguishes ready, missing, incomplete and invalid snapshots. Ready and valid incomplete snapshots open the analytical workspace with Decision Replay, Accuracy & Risk and Forecast Evolution. Status text is derived during React rendering rather than synchronized through another Effect.

The API-only root serves a welcome page linking to `/docs`. The combined public deployment serves React at `/` and the API welcome at `/api`.

I use `WINDSIGHT_DECISION_CUTOFF_GMT`, validated as `HH:MM`, with a default of `09:50`. Docker reads `.env` through Compose; direct Uvicorn uses environment variables. I defer a user-editable deadline control. The interface uses shadcn/ui and Tailwind, described below. The 24-hour replay uses SVG without adding a chart dependency.

For Docker I use Node 24 and Python 3.14. The default development configuration mounts source files and runs Vite hot module replacement alongside Uvicorn reload, so routine edits do not require an image rebuild. Vite proxies API requests to the backend service over the Docker network; direct host development defaults to loopback.

The explicit production configuration builds React and serves it through unprivileged Nginx, without source mounts or reload workers. It includes the validated snapshot and manifest; the API runs with a read-only filesystem. Development prefers its independently ingested database and otherwise reads the bundled snapshot on a fresh checkout. The host also has Node 24 and Python 3.14, so this avoids an unnecessary runtime mismatch. Images are version-family tags, not immutable digests; package dependencies are pinned and frozen. The separate Vercel deployment also passed anonymous HTTP checks; Compose and hosted behavior were verified independently.

## Design choices

| Finding | Decision | Status / evidence |
| --- | --- | --- |
| Cutoff is an assumption | Central backend configuration and source-linked UI disclosure | Config and UI setup checks |
| Health could be mistaken for analytical readiness | Report snapshot status separately; validate analytical responses before rendering | Health, API contract and UI state tests |
| Historical page needs no external API call at runtime | Keep ingestion offline and separate | Startup has no Elexon dependency |

## Ingestion decisions and observed evidence

I inspected bounded live examples before implementing acquisition. A January 1 WINDFOR publication window returned 584 rows across eight publication times and 73 hourly targets. A single January 2 FUELHH settlement date returned 48 WIND rows. This established the actual stream response shape and the usefulness of explicit publication filters. The [Elexon developer portal](https://developer.data.elexon.co.uk/) describes stream endpoints as JSON responses without server-side result caps; I still enforce small request windows and local byte/row limits instead of assuming arbitrary responses are safe or inventing pagination.

I fetch daily publication windows from December 29 through February 2 and retain targets only in January 2–February 1. This includes earlier forecasts needed by January 1 decisions and later publications for revision analysis. The acquired history is bounded; I do not claim it is every publication ever made. I request FUELHH separately for each settlement date and filter WIND. Settlement-date and publication-date filters are never combined.

I validate dataset identity, numeric generation, timezone-aware timestamps, hourly forecast targets, half-hourly outturn and settlement date/period alignment. Source timestamps with fractional seconds are rejected explicitly rather than silently truncated. I normalize accepted instants to whole-second UTC text for chronologically sortable SQLite keys. An identical key/value can deduplicate; a conflicting value fails ingestion. Equal values at distinct forecast publication times remain distinct history.

I use SQLite primary keys `(target_time, publish_time)` for forecasts and `target_time` for WIND outturn. Every request stores its exact URL/filters, retrieval time, decoded response checksum, counts and observed time ranges. A separate normalized content fingerprint excludes retrieval time, so rebuilding unchanged source records has the same identity. I build and check a temporary database before an atomic replacement. Failures and incomplete coverage preserve the previous database unless an explicit diagnostic option permits incompleteness.

The live snapshot contains **18,104 forecast versions across 744 targets and 1,488 outturn half-hours**. All 744 hours have at least one publication eligible at the configured cutoff and both outturn half-hours. Every decision day has 24 comparable hours; no missing periods or conflicting keys were found. A second live acquisition reproduced the same content fingerprint and row counts. These counts apply to this decision scope and do not reuse the earlier research ZIP figures.

The ingestion availability report still asks only whether an eligible forecast and two actual samples exist. A separate analytical layer now selects the exact eligible records, computes hourly means and calculates errors. I keep those responsibilities distinct so changing the configured cutoff recomputes current analysis without rewriting the source snapshot.

## Analytical design and observed results

I separated pure selection/statistics functions, a read-only repository, service orchestration, typed response models and route handlers. Each request uses one read-only SQLite connection, validates snapshot schema/counts and closes the connection afterward. Requests never fetch Elexon data. The per-request connection permits sequential FastAPI worker handoffs without being shared between requests.

Decision replay, aggregate accuracy, daily accuracy, evolution, metadata and data quality are available under `/api/v1`. Shared source links, the cutoff assumption, UTC scope, units, snapshot freshness and limitations live in `/api/v1/metadata`. Analytical responses reference that source content through `meta.snapshot_id` and retain `meta.decision_cutoff_gmt`, since the same source snapshot can produce different results under different cutoffs. The frontend can fetch metadata once and refresh it if either reference changes. The [API field guide](API.md) documents every endpoint and response field. Date ranges are inclusive decision dates. Invalid inputs return structured 422 responses; missing or invalid snapshots return actionable 503 responses without filesystem paths. Incomplete but valid snapshots can still be analyzed, with explicit missing reasons.

The evolution API shows all acquired publications in chronological order, marks the one selected at the cutoff and distinguishes unchanged values from genuine value changes. A repeated publication does not prove a new model run. The data-quality endpoint separates the ingestion report's original cutoff from coverage recomputed using current configuration.

I first checked a fixture with errors **+10, −20 and 0 MW**: MAE 10 MW, RMSE √(500/3), bias −10/3 MW, P50 10 MW and P90 18 MW. A fourth unmatched hour changes coverage to 75% while leaving error statistics based on the three valid pairs. This makes the expected outputs independently understandable.

On the real snapshot, all 744 hours match at the assumed 09:50 GMT cutoff. The observed MAE is **2,013.01 MW**, RMSE **2,505.94 MW**, bias **+1,729.93 MW**, P50 absolute error **1,608 MW**, P90 **4,143.85 MW** and maximum absolute error **6,833 MW**. There are 627 overforecast and 117 underforecast hours. I cross-checked these results with a separate SQL window-function selection and Decimal calculations, and verified that all 31 daily responses reconcile with the aggregate.

For the January 14 decision and January 15 midnight target, the selected 09:30 publication is 15,828 MW. The actual half-hours are 14,602 and 14,311 MW. Their mean is **14,456.5 MW**, making the signed error **+1,371.5 MW**. The first half-hour alone would give a different result and is not the canonical hourly comparison.

These figures compare Elexon series that may represent different wind populations. I do not describe the positive bias as proven intrinsic model bias, a utility procurement shortfall or a financial loss. All three analytical views and production data packaging are implemented and publicly deployed.

## Decision Replay interface

The page starts with the buyer’s question, a brief purpose explanation and three steps. One restricted buying-date control drives a plain-language daily summary, next-day labels, forecast/actual lines, two primary measures and the optional detailed views. The main measures explain the average gap and its direction. Signed-error bars, additional accuracy statistics and the 24-row evidence table sit in expandable sections, with definitions beside the numbers. I keep the configured deadline, retrospective nature of actuals and data coverage visible. The verified January 14 midnight example appears as 15,828 MW forecast, 14,456.5 MW actual and +1,371.5 MW error. January 31 shows February 1 delivery and prevents advancing outside the scope.

I render hourly comparisons with SVG: dashed forecast and solid actual lines distinguish series beyond color, error direction uses a labeled zero baseline, and missing observations restart paths rather than joining across gaps. Valid zero values are drawn. Every chart hour can be inspected by pointer or keyboard, with arrow/Home/End navigation and the same selection available from table buttons. The expandable table supplies full numerical evidence, including both actual half-hours, selected publication time and age at the decision deadline. The hour inspector also describes the selected difference in words, and the graph explains MW and the two lines without requiring technical terminology. On narrow screens the chart switches to a compact layout showing all 24 hours, with fewer time ticks and readable labels. The full evidence table scrolls inside its panel. A media-query subscription uses React’s external-store hook so viewport changes do not trigger data refetching.

Effects only synchronize network requests with mounted views. The selected date and selected hour are local interaction state; labels, paths and KPI values derive directly from props during render. A shared request hook aborts on unmount/date changes, clears timeout handles, ignores stale responses and supports direct retry actions. Changing date unmounts the old result view so its metrics and chart cannot appear under a new date while loading.

The client validates the fields it consumes, including the 24 exact target hours and D→D+1 mapping. Metadata loads once per analytical workspace. A snapshot or cutoff mismatch blocks rendering and offers a metadata refresh, avoiding results paired with another policy's explanation. No calculations are duplicated in React, and no synthetic fallback data is used in the application. Synthetic response fixtures live only in the test directory.

## Interface redesign

I use shadcn/ui components generated from the official registry, backed by Radix, with Tailwind CSS 4.3.3 and its Vite integration. Shared components include Button, Card, Badge, Input, Accordion, Alert, Tooltip, Separator and Skeleton. Theme tokens define a green/charcoal palette with a contrasting blue-grey actual-generation series, while Tailwind utilities handle layout and responsive behavior. Custom CSS is limited to base rules and SVG chart styling. Lucide icons are bundled with the application.

The first screen states the use case and the two core benefits: the latest forecast available at the deadline and measured historical differences. A primary anchor leads to the date controls. Desktop places the chart beside its interpretation; mobile stacks the numbered steps and fits the full day in one plot. The business-context accordion starts open, and deeper evidence remains optional. Statistics and data requests retain their existing definitions and cancellation safeguards. Dependencies are pinned, and Docker was rebuilt once to include them.

## Accuracy and publication-history interfaces

Accuracy & Risk requests the aggregate and daily APIs together for an inclusive buying-date range. Draft inputs become an applied range only after validation. The result confirms its actual range, and new requests hide the old range’s metrics while pending. Both API references must match each other and the loaded metadata. The client checks daily D→D+1 mapping, coverage, histogram counts and boundaries, and outlier ordering. The server remains responsible for analytical calculations.

The view leads with average gap, average direction and P90, each explained in everyday language. It shows direction frequencies, a daily MAE trend, signed-error distribution and the ten largest misses. Missing days break the trend; zero remains valid. Tables expose daily coverage and distribution intervals. An outlier opens the exact delivery hour in Forecast Evolution and focuses the analytical workspace.

Forecast Evolution uses delivery-day and UTC-hour controls with January 2–February 1 boundaries. Publication positions use actual elapsed timestamps, rather than array indices. Steps connect published values without inventing intermediate forecasts. A vertical marker uses the configured buying deadline, and later publications are shaded. The domain always contains the deadline, including histories entirely before or after it. A filled point identifies the latest eligible publication; eligibility includes equality. A solid horizontal actual line is explicitly retrospective.

Publication selection is local event state and does not refetch. Pointer, arrow/Home/End keys, previous/next buttons and the full table share the same inspector. The inspector distinguishes changed values, unchanged republications and the first acquired value. The client rejects malformed chronological ordering, inaccurate eligibility/selection flags or comparison values inconsistent with the selected publication. Changing a delivery hour aborts the old request, hides old results and resets selection to the chosen as-of publication. Empty history, no eligible forecast, incomplete actuals and zeros have distinct states.

The interface keeps the green/charcoal theme and existing shadcn/Tailwind components without another chart or routing dependency. These views describe historical wind assumptions; they do not claim calibrated future uncertainty, model-run timing, purchase quantities or financial savings.

## Verification

Current verification produced **124 passing backend tests and 50 passing frontend tests**, with no failures or skips. Backend tests cover ingestion, mathematical fixtures, before/equal/after cutoff, changed configuration, exact targets, incomplete actuals, zero generation, January 31→February 1, empty samples, percentile interpolation, typed API contracts, structured errors, read-only access and SQLite worker handoffs. Frontend tests cover date/input/button interactions, inclusive range filters, coordinated results, histogram and outlier navigation, actual chronological publication spacing, deadline equality, unchanged republications, missing/empty/zero states, discontinuous chart paths, keyboard/table selection, setup states, invalid contracts, reference mismatches, request cancellation, late responses, timeout and retry.

Ruff checks, TypeScript checking, the production build, Docker startup and the Vite/Nginx API proxies passed. The running page was checked at desktop and narrow-screen widths. One development test dependency emits a deprecation warning about its `httpx` integration.

The Docker development reload workflow was checked with temporary source edits that were then restored. A React text change appeared in the open browser through hot module replacement without a page refresh. A Python change appeared in the API response through Uvicorn reload while the backend container identity remained unchanged.

All three views were verified against the Elexon-derived snapshot through the existing Docker/Vite proxy at desktop and mobile widths. CI, snapshot packaging and both local production-serving arrangements are implemented. The public Vercel deployment passed anonymous HTTP smoke and browser checks of all three views. The [hosted workflow passed for release commit `37069a8`](https://github.com/cric2000/wind-energy/actions/runs/39994365814), including regression, build, snapshot, portable-server and production Docker checks. Final local regression and public HTTP checks also passed after that commit.

## Production preparation and release verification

The release asset is a separate SQLite backup under `backend/snapshot/`, with a manifest containing both file and normalized-source checksums. Offline validation recomputes coverage, counts, scope and content identity; checks SQLite integrity; and rejects conflicts, incomplete coverage or mismatched provenance. Ingestion and validation share one fingerprint implementation. Numeric MW values are normalized to floats in the canonical representation so integer-valued fixtures survive SQLite round trips; the real source fingerprint is unchanged. Runtime requests continue to use read-only, per-request database connections. No startup ingestion or external data fetch was added.

The production Docker stage validates and bundles this asset. CI executes backend/frontend regressions, source checks, the frontend build, offline snapshot validation and HTTP smoke tests for both the portable server and production Compose. The portable `index.py` entrypoint uses FastAPI’s frontend support to serve the compiled React files alongside the API; its `/api` welcome page leaves `/` for the product. API routes keep priority and missing asset/API paths remain errors. The snapshot cannot be served through the public frontend directory.

Vercel configuration targets Python 3.14, Node 24 and the existing locked Python dependencies. The documented static-asset integration prepares CDN delivery for the public compiled frontend while analytical requests reach the Python function. The local portable-server check independently verifies application behavior, rather than treating a successful Docker build as proof of hosting. Production Docker HTTP smoke also verifies the Nginx API proxy and documentation routes. The hosted workflow result is tied to the release commit; later changes require their own run. The approved `windsight` project was published through a local-source CLI upload. Its stable domain is [windsight-five.vercel.app](https://windsight-five.vercel.app). The hosted install explicitly installs both locked Python dependencies and frontend packages, because a custom install command replaces the default dependency installation. The hosted build validated the snapshot and compiled React successfully. Anonymous smoke verified both compiled assets, all 744 comparisons, matching source identity, replay/evolution consistency, the February 1 boundary, documentation, expected errors and no downloadable database. Browser checks confirmed all three views. The project is now connected to the GitHub repository with `main` as the production branch, so pushes trigger automatic Vercel builds and production deployments. GitHub Actions verifies changes independently; it is not a deployment gate in this integration.
