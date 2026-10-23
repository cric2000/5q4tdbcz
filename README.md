# WindSight — Day-ahead wind intelligence

**Live application: [windsight-five.vercel.app](https://windsight-five.vercel.app).** Decision Replay, Accuracy & Risk and Forecast Evolution are deployed on Vercel. The React dashboard reconstructs decision-time forecasts, compares them with next-day actuals, reviews accuracy across buying days and traces publication history using the FastAPI analytical services and reproducible Elexon-to-SQLite snapshot.

The public [API documentation](https://windsight-five.vercel.app/docs) lists the available endpoints. No sign-in is required.

This pilot helps a GB electricity buyer reconstruct the latest wind forecast available before a day-ahead purchasing decision and evaluate its historical accuracy. Calculations use only national Elexon WINDFOR forecasts and FUELHH WIND outturn. These series cannot determine purchase quantities or trading profit.

## Run locally with Docker

Prerequisites: Docker Engine and Docker Compose v2, with access to the daemon.

```bash
docker compose up --build -d --wait
```

- Application: [http://localhost:5173](http://localhost:5173)
- API welcome page: [http://localhost:8000](http://localhost:8000)
- API health: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)
- API documentation: [http://localhost:8000/docs](http://localhost:8000/docs)
- API through the frontend proxy: [http://localhost:5173/api/v1/health](http://localhost:5173/api/v1/health)

Docker Compose automatically loads the development override. The frontend runs Vite with hot module replacement, and the backend runs Uvicorn with automatic reload. Source files are bind-mounted from this workspace: saving frontend changes updates the browser, and saving backend Python changes restarts the API worker. `/api/` is proxied to FastAPI over the Docker network.

Run the command above once to build the images. After stopping the services, subsequent starts can use `docker compose up -d --wait`. Rebuild with `--build` when changing dependencies, lockfiles or Dockerfiles. Changes to environment variables or Compose configuration require recreating the services with `docker compose up -d --wait`.

Startup makes no Elexon requests. A fresh checkout reads the bundled, validated release snapshot. Development prefers an explicitly ingested database in `backend/data/` when one exists, and mounts that directory so local ingestion outputs persist. Health separately reports liveness and snapshot readiness; a missing or invalid explicit database path still produces an honest setup state.

```bash
docker compose down
```

To check the production build locally, stop the development services and explicitly select the base configuration:

```bash
docker compose down
docker compose -f docker-compose.yml up --build -d --wait
```

Production uses compiled React served by Nginx, with no source mounts or reload workers. The application URLs stay the same. Switch back to development with `docker compose up --build -d --wait`.

The production image bundles `backend/snapshot/windsight.db` and its integrity manifest. Its build validates the asset offline, and the API reads it without startup ingestion. The backend container and packaged files are read-only.

After intentional ingestion, prepare a new release copy with `python -m scripts.package_snapshot` from `backend/`, then validate it with `python -m scripts.validate_snapshot`. Review and commit the release database and manifest together. Full Docker, portable-server, CI and Vercel instructions are in [Deployment](docs/DEPLOYMENT.md). The public deployment passed anonymous HTTP smoke checks using the bundled snapshot.

## Develop without Docker

Use Node 24 and Python 3.14 (the versions used in the containers and during setup).

From the project root:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.lock
```

Start the API in one terminal:

```bash
cd backend
../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Start React in another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Vite proxies `/api` to `127.0.0.1:8000` by default. Stop Docker first to free the same ports. Both this workflow and the default Docker development workflow reload source changes automatically.

## Configure the reference assumption

`WINDSIGHT_DECISION_CUTOFF_GMT` is validated centrally as a 24-hour `HH:MM` value, default `09:50`. Configuration, replay, accuracy, revision eligibility and current coverage all use this value. The ingestion report retains the cutoff used when that snapshot was built; the data-quality API distinguishes it from current configured coverage.

For Docker, copy `.env.example` to `.env` and edit it. Compose reads `.env`; direct Uvicorn uses exported environment variables (it does not automatically load this file). `WINDSIGHT_CORS_ORIGINS` accepts a JSON list of allowed origins; local Vite and Nginx normally use the same-origin proxy.

## Build and inspect the historical snapshot

From `backend/`, with development dependencies installed:

```bash
../.venv/bin/python -m scripts.ingest
../.venv/bin/python -m scripts.inspect_snapshot
```

Or use the running Docker development backend from the project root:

```bash
docker compose exec backend python -m scripts.ingest
docker compose exec backend python -m scripts.inspect_snapshot
```

Ingestion makes live, bounded Elexon requests and writes `backend/data/windsight.sqlite3`. Inspection reads the embedded quality report without fetching or modifying data. To export a fresh report from `backend/`:

```bash
../.venv/bin/python -m scripts.inspect_snapshot > data/quality-report.json
```

The SQLite snapshot is the authoritative artifact, including source URLs, exact request parameters, response hashes, observed timestamp ranges and retrieval timestamps. The JSON report is an exported summary. The generated database stays out of Git and is reproducible from the command above. `--database PATH` selects another output; direct API execution can use `WINDSIGHT_DATABASE_PATH` to read that path.

Requests use daily WINDFOR publication windows from December 29, 2025 through February 2, 2026, and individual FUELHH settlement dates January 2–February 1. The publication window captures earlier eligible forecasts and later revisions; it is not an unlimited forecast archive. FUELHH requests filter `WIND` and never combine settlement-date and publication-date filters. Stream responses are JSON arrays; bounded requests are used instead of invented pagination.

The pipeline rejects malformed or naive timestamps, non-finite/negative wind MW values, misaligned periods and conflicting duplicate keys. Identical duplicates can be deduplicated; unchanged publications at different times remain separate forecast history. HTTP timeouts, bounded retries/backoff and byte/row limits prevent unbounded acquisition. A validated temporary database atomically replaces the prior snapshot, so failed ingestion cannot leave a partial database in service.

Incomplete coverage fails by default and preserves the previous snapshot. `--allow-incomplete` explicitly permits publishing missing periods for diagnostic use; missing observations are never filled with zero. A successful live rebuild reproduced the same normalized content fingerprint and row counts. Retrieval metadata naturally changes when data is fetched again.

Verified source availability, using the configured 09:50 GMT assumption:

| Check | Observed |
| --- | ---: |
| Forecast versions retained | 18,104 |
| Distinct hourly forecast targets | 744 |
| WIND outturn half-hours | 1,488 |
| Hours with an eligible forecast and both actual half-hours | 744 / 744 |
| Conflicting duplicate keys | 0 |
| January 31 decision → February 1 comparable hours | 24 / 24 |

These are availability counts. See [the generated quality report](backend/data/quality-report.json) for daily coverage and provenance summary. After ingestion, refresh the landing page to fetch its latest snapshot status.

## Analytical APIs

Explore the typed endpoints in [Swagger](http://localhost:8000/docs), or read the [API field guide](docs/API.md) for every request, response and field purpose. Analysis reads the prepared SQLite snapshot and never fetches Elexon data during a request. Fetch `/api/v1/metadata` once for the shared cutoff assumption, UTC scope, units, sources, snapshot freshness and comparison limitations. Analytical results contain only a small `meta` reference: `snapshot_id` (matching metadata's `snapshot.content_sha256`) and the configured `decision_cutoff_gmt`. Refresh cached metadata if either changes. Power fields carry `_mw` in their names.

| GET endpoint | Response |
| --- | --- |
| `/api/v1/metadata` | Methodology, configured scope/cutoff and snapshot provenance |
| `/api/v1/decisions/2026-01-14` | Next-day 24-hour replay, selected publication per hour, actual means, missing reasons and daily metrics |
| `/api/v1/accuracy?from=2026-01-01&to=2026-01-31` | Aggregate metrics, signed-error histogram and ten largest absolute errors |
| `/api/v1/accuracy/daily?from=2026-01-01&to=2026-01-31` | Metrics by decision date |
| `/api/v1/evolution?target_time=2026-01-15T00:00:00Z` | Chronological publications, cutoff eligibility, chosen record, unchanged-value markers and retrospective actual mean |
| `/api/v1/data-quality` | Current coverage and missing hours, plus the original ingestion report |

`from` and `to` are inclusive decision dates and default to January 1–31. Dates must use `YYYY-MM-DD` within that range. Evolution requires a timezone-aware exact hourly target within January 2–February 1; offsets are normalized to UTC. Missing observations stay null with explicit reasons. Missing/corrupt snapshots return HTTP 503; invalid parameters return HTTP 422. Both use `{"error":{"code":"...","message":"...","issues":[]}}` without exposing a filesystem path or stack trace.

Try the APIs from the project root:

```bash
curl "http://localhost:8000/api/v1/decisions/2026-01-14"
curl "http://localhost:8000/api/v1/accuracy?from=2026-01-01&to=2026-01-31"
curl "http://localhost:8000/api/v1/evolution?target_time=2026-01-15T00:00:00Z"
```

Verified results for the complete January decision window at the assumed 09:50 GMT cutoff:

| Metric | Observed |
| --- | ---: |
| Matched hours / expected | 744 / 744 (100%) |
| MAE | 2,013.01 MW |
| RMSE | 2,505.94 MW |
| Mean signed bias | +1,729.93 MW |
| P50 absolute error | 1,608.00 MW |
| P90 absolute error | 4,143.85 MW |
| Maximum absolute error | 6,833.00 MW |
| Overforecast / underforecast / exact hours | 627 / 117 / 0 |

The [accuracy report](backend/data/accuracy-report.json) contains full-precision API output; its [companion metadata](backend/data/metadata-report.json) records the methodology and snapshot provenance. Results were cross-checked using a separate SQL as-of selection and Decimal arithmetic. Positive bias describes this Elexon-series comparison; differing source populations may contribute. Observed percentiles are not calibrated prediction intervals.

For example, the January 14 09:30 UTC publication forecast January 15 midnight at 15,828 MW. The two actual half-hours are 14,602 and 14,311 MW, giving an hourly mean of **14,456.5 MW** and signed error of **+1,371.5 MW**. Comparing only the first half-hour would produce a different, incorrect hourly error.

## Use Decision Replay

Open the [application](http://localhost:5173) after preparing the snapshot. The introduction explains the buyer’s problem and links directly to the workspace with “Review a buying day”. The workspace defaults to the first supported buying date. Select another January date or use the previous/next buttons; delivery labels, charts, daily metrics and the evidence table update together.

- The dashed line shows the latest forecast available at the assumed decision cutoff. The solid line shows retrospective hourly actuals.
- The main view explains the selected day and answers two questions: how far off the forecast was, and whether it was high or low on average. MW and the chart lines are explained beside the data.
- Expand the hourly-differences chart for signed-error bars, “More accuracy measures” for MAE/bias/RMSE/P50/P90 definitions, and “View all 24 hourly readings” for the full table.
- Select or focus a chart hour to inspect forecast, actual, signed error and publication time. Arrow keys move between chart hours; Home/End select the first/last. Table hour buttons select the same inspector.
- The hourly evidence table exposes both actual half-hours, their mean, the chosen publication, forecast age and missing-data reasons. The mobile chart fits all 24 hours; the wide evidence table scrolls inside its panel.
- Missing readings leave gaps; zero remains a valid value. Coverage stays visible, and a day with no matched pairs shows unavailable metrics with all expected rows retained.
- “Where the numbers come from” explains the forecast and actual sources, with source links, the configured assumption, snapshot provenance and comparison limitations.

The browser validates the API contracts and checks the result's snapshot/cutoff against loaded metadata. It cancels requests when switching dates, hides the previous day's results while loading, ignores late responses and provides retry actions for errors/timeouts. Valid incomplete snapshots can be explored; missing/invalid snapshots show a setup message. Use the view buttons or desktop navigation to open Accuracy & Risk and Forecast Evolution.

To check the verified example, select **14 January 2026** and inspect **00:00 UTC** on January 15. To check the scope boundary, select **31 January 2026**: delivery must read **1 February 2026**, with 24 hours and the next-day button disabled.

## Review accuracy across buying days

Choose **Accuracy & risk**, select the first and last buying days, then select **Update analysis**. The range includes both dates; January 31 includes delivery on February 1.

- Average gap (MAE) describes the size of hourly differences. Bias describes their average direction; opposite signs can cancel out.
- P90 describes larger observed gap sizes, with a visible explanation that it is not a guaranteed future error range.
- Direction counts show how often the forecast was high, low or exactly matched. Percentages use matched hours; coverage uses all expected hours.
- The daily trend uses chronological buying dates and leaves gaps for days without valid comparisons. The distribution groups signed hourly errors by interval, with zero separating low and high forecasts.
- **Hours worth a closer look** lists the ten largest misses. **See history** opens the exact delivery hour in Forecast Evolution.
- Expand daily readings for dates, coverage and measures, or distribution readings for interval boundaries and counts. The range metrics come directly from the API across all matched hours, rather than averaging daily averages.

## Follow a forecast through its publications

Choose **Forecast evolution**, then a delivery day and hour. Buying day and deadline are on the previous day. The chart places publications by actual elapsed time and uses steps between published values. The filled green point identifies the latest forecast available at or before the deadline; later publications are shaded and excluded from that original decision. The solid reported-power reference is retrospective.

Select a publication, use the previous/next controls, or use arrow/Home/End keys on chart points. The inspector and optional full history table identify the publication time, value, deadline eligibility and whether the value changed from the previous stored publication. An unchanged republication does not establish a new forecasting model run. This is the acquired snapshot’s history, not a claim that every upstream revision is present.

The earliest delivery hour is January 2 at 00:00 UTC and the latest is February 1 at 23:00 UTC. In this historical period, UTC matches UK local time (GMT). Empty history, later-only forecasts, incomplete actual readings and true zero values remain distinct.

## Interface and design system

The interface uses [shadcn/ui](https://ui.shadcn.com/docs/installation/vite) components with Radix primitives and [Tailwind CSS](https://tailwindcss.com/docs/installation/using-vite) through its Vite plugin. The green-and-charcoal workspace includes a clear product introduction, guided date/forecast/error steps, adjacent chart and explanations, keyboard-accessible accordions, tooltips, loading skeletons and responsive layouts. Lucide supplies icons. Component source lives in `frontend/src/components/ui`, with theme tokens in `src/styles.css` and shadcn configuration in `components.json`.

The product explanation and buying-context help are available even while data is loading or the API is unavailable. The buying-context explanation is open by default. Source details, terminology, additional statistics and the full table can be expanded as needed. This historical pilot supports reviewing wind assumptions; it does not calculate a utility’s actual purchase quantity or provide live trading instructions.

Adding this design system changes dependencies, so an existing Docker setup needs one rebuild with `docker compose up --build -d --wait`. Subsequent source/style changes continue to reload automatically. Exact package versions and the lockfile are tracked.

## Methodology and source provenance

- **Scope:** React, Python and Docker; national Elexon wind forecasts and outturn; January 2026 purchase decisions and quantitative forecast accuracy.
- **Interpretation:** decision day D maps to D+1 delivery: January 1–31 decisions imply January 2–February 1 delivery. Expected comparisons are 744 hourly periods, subject to actual coverage.
- **Assumption:** 09:50 GMT uses [Nord Pool’s N2EX guide](https://support.nordpoolgroup.com/support/solutions/articles/8000088463-about-the-n2ex-day-ahead-auction), dated July 26, 2022. The client did not specify its exchange or deadline. This reference is not an operational specification for all UK markets.
- **Selection:** for each exact next-day hourly target, choose the latest [WINDFOR](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream) publication at or before that decision’s configured cutoff. Equality is eligible; later publications are excluded from replay.
- **Alignment:** compare forecast MW with the mean of both corresponding [FUELHH](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) WIND half-hour average MW values. Incomplete hours remain missing. Signed error is forecast minus hourly-average outturn; positive means overforecast.
- **Statistics:** only matched pairs contribute to MAE, RMSE, bias, absolute-error percentiles and over/under/exact shares. Percentiles use linear interpolation at `(n - 1) * quantile`. Empty matched samples return null metrics and rates. Coverage uses all expected hours; missing-reason counts can overlap.
- **Limitations:** source populations may differ; observed errors are series comparisons. No demand, prices, actual bids, exact procurement deficits or financial savings can be inferred.

## Structure

```text
frontend/                   React + TypeScript + Vite, Decision Replay, Vitest
frontend/src/api.ts          Typed and validated setup/metadata/replay requests
frontend/src/useResource.ts  Abortable requests, timeout/retry and stale-response protection
frontend/src/DecisionReplay.tsx  Date controls, daily metrics, inspector and evidence table
frontend/src/ReplayChart.tsx Responsive SVG forecast/actual lines and signed-error bars
frontend/src/components/ui/ shadcn/ui components
frontend/src/lib/utils.ts    Tailwind class merging
frontend/components.json    shadcn registry/style configuration
backend/app/api/            Operational/analytical routes and structured error handlers
backend/app/core/           Validated environment configuration
backend/app/schemas.py      Operational response contracts
backend/app/analysis_schemas.py  Typed analytical responses with explicit units and missing values
backend/app/services/       Pure calculations and historical analysis orchestration
backend/app/ingestion/      Elexon client, validation, acquisition and coverage checks
backend/app/repositories/   Atomic snapshot publishing, inspection and read-only analysis queries
backend/scripts/            Ingestion and inspection CLI commands
backend/tests/              pytest service, ingestion and repository tests
backend/data/               Generated SQLite snapshot and exported quality report
backend/requirements*.in    Pinned direct dependencies
backend/requirements*.lock  Frozen runtime / development dependencies
docs/APPROACH.md            Technical rationale and methodology
docker-compose.yml          Local two-service runtime
docker-compose.override.yml Development source mounts and reload workers
```

## Checks

From `backend/`:

```bash
../.venv/bin/python -m pytest -q
../.venv/bin/ruff check .
../.venv/bin/ruff format --check .
```

From `frontend/`:

```bash
npm test
npm run typecheck
npm run build
```

Current verification: **124 backend tests and 50 frontend tests passed**, with no failures or skips. Ruff, TypeScript checking and the frontend production build passed. All three live views were checked through the Docker/Vite proxy at desktop and mobile widths and on the public deployment in a browser. Checks include the January 14 replay example, full-January accuracy, an outlier-to-history link and the January 31→February 1 boundary. The backend test client emits one dependency deprecation warning for its `httpx` integration. Production Docker, the portable single-origin server and the public Vercel deployment passed the release HTTP smoke checks, including 744/744 comparisons and matching snapshot identity. The CI workflow is configured; a hosted Actions run remains pending until these changes are pushed.

## Implementation status

| Item | Status |
| --- | --- |
| React/FastAPI scaffold, health, configurable assumption | Implemented |
| Docker, tests, frontend build | Verified locally |
| Live ingestion / SQLite / quality report | Implemented; full decision-window coverage verified |
| As-of selection, hourly averaging, metrics and typed APIs | Implemented; fixtures and real-data calculations verified |
| Decision Replay | Implemented; real API chart, daily metrics, evidence table and request states verified |
| Accuracy & Risk / Forecast Evolution screens | Implemented; range metrics, distribution, outlier links and publication timeline verified locally |
| CI | Workflow configured; local equivalent checks pass; hosted run pending |
| Production packaging | Versioned snapshot and manifest validated; Docker and portable HTTP smoke passed |
| Vercel hosting | Published; anonymous frontend/API smoke and all three dashboard views verified |

## AI assistance

I used OpenAI Codex for development.
