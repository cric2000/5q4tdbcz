# My understanding and implementation approach

**Current status: local application scaffold.** This document explains the technical choices, implemented behavior and planned analysis.

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

I interpret January **decision dates** as January 1–31, with next-day delivery January 2–February 1. This follows my chosen D→D+1 model; I will verify forecast eligibility and February 1 actuals during ingestion. January GMT equals UTC, and the analytics will compare timezone-aware instants.

## The calculation I plan to implement

For each hour h on D+1, I will choose the WINDFOR record with maximum `publishTime` satisfying `publishTime <= cutoff(D)`. A missing eligible forecast stays missing. Later revisions will be retained for Forecast Evolution but excluded from the original decision replay.

I will calculate `actual_hourly_average_mw = (actual[h] + actual[h+30min]) / 2` only when both outturn observations exist. Signed error will be forecast minus that hourly mean, with positive values meaning overforecast. MAE, RMSE, bias, P50/P90 absolute error, over/under/exact shares and matched coverage will use valid pairs only. There are 744 expected hours in this decision window; I will report observed completeness.

No source records have been ingested or validated in this implementation yet. I will verify the full decision window, including February 1 outturn, before publishing metrics.

I also recognize a comparison limitation: WINDFOR and FUELHH can represent different wind populations. Their difference does not isolate model error or establish a financial loss. MW is power; MWh requires an explicit duration.

## Application foundation

I chose React/TypeScript/Vite and FastAPI with Pydantic settings. The scaffold exposes service health and pilot configuration, with no data ingestion at startup. Configuration is returned by the API so the React page does not duplicate the deadline. The landing page states that data has not been ingested and marks all three analytical views as planned.

The API root serves a simple welcome page with a link to the interactive endpoint documentation at `/docs`.

I use `WINDSIGHT_DECISION_CUTOFF_GMT`, validated as `HH:MM`, with a default of `09:50`. Docker reads `.env` through Compose; direct Uvicorn uses environment variables. I defer a user-editable deadline control, chart dependencies and a broader UI component library until a feature needs them.

For Docker I use Node 24 and Python 3.14. The default development configuration mounts source files and runs Vite hot module replacement alongside Uvicorn reload, so routine edits do not require an image rebuild. Vite proxies API requests to the backend service over the Docker network; direct host development defaults to loopback.

The explicit production configuration builds React and serves it through unprivileged Nginx, without source mounts or reload workers. The host also has Node 24 and Python 3.14, so this avoids an unnecessary runtime mismatch. Images are version-family tags, not immutable digests; package dependencies are pinned and frozen. Hosting on Vercel/Heroku remains a later, separately verified task; Compose does not establish that deployment works.

## Design choices

| Finding | Decision | Status / evidence |
| --- | --- | --- |
| Cutoff is an assumption | Central backend configuration and source-linked UI disclosure | Config and UI setup checks |
| Health could be mistaken for dataset readiness | Explicit `not_ingested` response and visible message | Health contract test |
| Historical page needs no external API call at runtime | Keep ingestion offline and separate | Startup has no Elexon dependency |

## Verification

Setup verification produced **8 passing backend tests and 4 passing frontend tests**, with no failures or skips. Backend tests cover health semantics, environment configuration, scope boundaries, invalid cutoff formats and allowed/disallowed CORS origins. Frontend tests cover the configured cutoff, un-ingested status, loading, failure/retry and malformed responses.

Ruff checks, TypeScript checking, the production build, Docker startup and the Vite/Nginx API proxies passed. The running page was checked at desktop and narrow-screen widths. One development test dependency emits a deprecation warning about its `httpx` integration.

The Docker development reload workflow was checked with temporary source edits that were then restored. A React text change appeared in the open browser through hot module replacement without a page refresh. A Python change appeared in the API response through Uvicorn reload while the backend container identity remained unchanged.

The next technical work is bounded Elexon acquisition, UTC validation, duplicate/conflict handling, an indexed SQLite snapshot, provenance and coverage reporting. Ingestion and analytical behavior remain unimplemented.
