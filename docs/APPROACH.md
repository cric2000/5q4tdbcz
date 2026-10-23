# My understanding and implementation approach

**Current status: ingestion implemented and verified.** This document explains the technical choices, implemented behavior and planned analysis.

## What I understand the customer needs

I am building a historical pilot for a GB electricity utility making day-ahead buying decisions. I want to reconstruct the national wind forecast available before a decision, then compare it with reported wind output after delivery. I cannot calculate the utility’s actual electricity purchase quantity because the allowed datasets do not include its demand, existing contracts or prices.

I use React, Python and Docker, and limit the planned calculations to January 2026 buying decisions and Elexon national wind data. I keep the client’s decision-support needs separate from implementation assumptions.

## Sources, inference and my choice

The official source pages were checked during setup. Elexon’s JavaScript documentation was inspected in a browser.

| Source | What the documentation supports | My interpretation / choice |
| --- | --- | --- |
| [Elexon WINDFOR stream](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream) | Identifies this as wind generation forecast; exposes publication and target timestamps and MW generation. | I preserve `publishTime` as information availability and `startTime` as the delivery target. I plan to select the latest eligible publication separately for every hourly target. |
| [Elexon FUELHH stream](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) | Describes generation outturn for GB by fuel type, updated every half hour with mean MW for each half hour. It disallows combining settlement-date and publication-date filters. | I will filter WIND and fetch by settlement date. I will average the two adjacent half-hour readings for each complete hour before comparison; this alignment is my analytical choice. |
| [Nord Pool N2EX guide](https://support.nordpoolgroup.com/support/solutions/articles/8000088463-about-the-n2ex-day-ahead-auction) | The guide, dated July 26, 2022, gives next-day physical delivery and a 09:50 GMT gate closure. | I use this as a reference scenario for a missing client deadline. I do not claim it is a universal UK rule or current operational market specification. |

I interpret January **decision dates** as January 1–31, with next-day delivery January 2–February 1. This follows my chosen D→D+1 model. Ingestion has now verified source availability for all 744 target hours, including all 24 February 1 hours for the January 31 decision. January GMT equals UTC, and timestamps are normalized to timezone-aware UTC instants.

## The calculation I plan to implement

For each hour h on D+1, I will choose the WINDFOR record with maximum `publishTime` satisfying `publishTime <= cutoff(D)`. A missing eligible forecast stays missing. Later revisions will be retained for Forecast Evolution but excluded from the original decision replay.

I will calculate `actual_hourly_average_mw = (actual[h] + actual[h+30min]) / 2` only when both outturn observations exist. Signed error will be forecast minus that hourly mean, with positive values meaning overforecast. MAE, RMSE, bias, P50/P90 absolute error, over/under/exact shares and matched coverage will use valid pairs only. There are 744 expected hours in this decision window; I will report observed completeness.

I have prepared and validated the source snapshot. Its availability checks do not calculate forecast errors; the mathematical comparison remains the next implementation step.

I also recognize a comparison limitation: WINDFOR and FUELHH can represent different wind populations. Their difference does not isolate model error or establish a financial loss. MW is power; MWh requires an explicit duration.

## Application foundation

I chose React/TypeScript/Vite and FastAPI with Pydantic settings. The API exposes service health, snapshot status and pilot configuration, with no data ingestion at startup. Configuration is returned by the API so the React page does not duplicate the deadline. The landing page distinguishes ready, missing, incomplete and invalid snapshots and marks all three analytical views as planned. Status text is derived during React rendering rather than synchronized through another Effect.

The API root serves a simple welcome page with a link to the interactive endpoint documentation at `/docs`.

I use `WINDSIGHT_DECISION_CUTOFF_GMT`, validated as `HH:MM`, with a default of `09:50`. Docker reads `.env` through Compose; direct Uvicorn uses environment variables. I defer a user-editable deadline control, chart dependencies and a broader UI component library until a feature needs them.

For Docker I use Node 24 and Python 3.14. The default development configuration mounts source files and runs Vite hot module replacement alongside Uvicorn reload, so routine edits do not require an image rebuild. Vite proxies API requests to the backend service over the Docker network; direct host development defaults to loopback.

The explicit production configuration builds React and serves it through unprivileged Nginx, without source mounts or reload workers. The host also has Node 24 and Python 3.14, so this avoids an unnecessary runtime mismatch. Images are version-family tags, not immutable digests; package dependencies are pinned and frozen. Hosting on Vercel/Heroku remains a later, separately verified task; Compose does not establish that deployment works.

## Design choices

| Finding | Decision | Status / evidence |
| --- | --- | --- |
| Cutoff is an assumption | Central backend configuration and source-linked UI disclosure | Config and UI setup checks |
| Health could be mistaken for analytical readiness | Report snapshot status separately; keep analytical views explicitly planned | Health and UI state tests |
| Historical page needs no external API call at runtime | Keep ingestion offline and separate | Startup has no Elexon dependency |

## Ingestion decisions and observed evidence

I inspected bounded live examples before implementing acquisition. A January 1 WINDFOR publication window returned 584 rows across eight publication times and 73 hourly targets. A single January 2 FUELHH settlement date returned 48 WIND rows. This established the actual stream response shape and the usefulness of explicit publication filters. The [Elexon developer portal](https://developer.data.elexon.co.uk/) describes stream endpoints as JSON responses without server-side result caps; I still enforce small request windows and local byte/row limits instead of assuming arbitrary responses are safe or inventing pagination.

I fetch daily publication windows from December 29 through February 2 and retain targets only in January 2–February 1. This includes earlier forecasts needed by January 1 decisions and later publications for revision analysis. The acquired history is bounded; I do not claim it is every publication ever made. I request FUELHH separately for each settlement date and filter WIND. Settlement-date and publication-date filters are never combined.

I validate dataset identity, numeric generation, timezone-aware timestamps, hourly forecast targets, half-hourly outturn and settlement date/period alignment. Source timestamps with fractional seconds are rejected explicitly rather than silently truncated. I normalize accepted instants to whole-second UTC text for chronologically sortable SQLite keys. An identical key/value can deduplicate; a conflicting value fails ingestion. Equal values at distinct forecast publication times remain distinct history.

I use SQLite primary keys `(target_time, publish_time)` for forecasts and `target_time` for WIND outturn. Every request stores its exact URL/filters, retrieval time, decoded response checksum, counts and observed time ranges. A separate normalized content fingerprint excludes retrieval time, so rebuilding unchanged source records has the same identity. I build and check a temporary database before an atomic replacement. Failures and incomplete coverage preserve the previous database unless an explicit diagnostic option permits incompleteness.

The live snapshot contains **18,104 forecast versions across 744 targets and 1,488 outturn half-hours**. All 744 hours have at least one publication eligible at the configured cutoff and both outturn half-hours. Every decision day has 24 comparable hours; no missing periods or conflicting keys were found. A second live acquisition reproduced the same content fingerprint and row counts. These counts apply to this decision scope and do not reuse the earlier research ZIP figures.

The availability check asks whether an eligible forecast and two actual samples exist. It deliberately does not select and expose a final forecast curve or calculate hourly means, MAE, RMSE or bias. Those services are the next implementation step. I will continue to disclose any mismatch between the populations represented by the two Elexon series.

## Verification

Current verification produced **60 passing backend tests and 7 passing frontend tests**, with no failures or skips. Backend tests cover source parsing, missing/bad fields, UTC conversion, request bounds and retries, duplicate conflicts, missing half-hours, cutoff availability, the January 31 boundary, atomic database preservation, stable rebuild identity and snapshot health states. Frontend tests cover configuration, ready/missing/incomplete/invalid snapshot messages, loading, failure/retry and malformed responses.

Ruff checks, TypeScript checking, the production build, Docker startup and the Vite/Nginx API proxies passed. The running page was checked at desktop and narrow-screen widths. One development test dependency emits a deprecation warning about its `httpx` integration.

The Docker development reload workflow was checked with temporary source edits that were then restored. A React text change appeared in the open browser through hot module replacement without a page refresh. A Python change appeared in the API response through Uvicorn reload while the backend container identity remained unchanged.

The next technical work is tested analytical services: exact as-of selection, two-half-hour actual averaging, error metrics, coverage reasons and typed analysis endpoints. No accuracy result is claimed before those calculations are implemented and checked.
