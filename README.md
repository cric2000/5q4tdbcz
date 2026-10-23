# WindSight — Day-ahead wind intelligence

**Current status: ingestion implemented and verified.** React, FastAPI, Docker and a reproducible Elexon-to-SQLite pipeline are present. The local snapshot covers all January decision dates. Analytical APIs and dashboard views remain planned; no accuracy figures have been calculated yet.

This pilot will help a GB electricity buyer reconstruct the latest wind forecast available before a day-ahead purchasing decision and evaluate its historical accuracy. Calculations will use only national Elexon WINDFOR forecasts and FUELHH WIND outturn. These series cannot determine purchase quantities or trading profit.

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

Startup requires no Elexon requests or data archive. Health describes service liveness and separately reports whether the local snapshot is ready, missing, incomplete or invalid. The development configuration mounts `backend/data/` so ingestion outputs persist on the host.

```bash
docker compose down
```

To check the production build locally, stop the development services and explicitly select the base configuration:

```bash
docker compose down
docker compose -f docker-compose.yml up --build -d --wait
```

Production uses compiled React served by Nginx, with no source mounts or reload workers. The application URLs stay the same. Switch back to development with `docker compose up --build -d --wait`.

The production image does not yet bundle the generated historical database; production data packaging remains planned. Without that asset its health response correctly reports `not_ingested`.

For deployment, first run ingestion and inspect the quality report to confirm complete coverage. Then package the validated SQLite snapshot with the application as a read-only data asset. The deployed app should read that prepared snapshot without fetching Elexon data during startup. Hosting-specific packaging instructions will be added when deployment is implemented.

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

`WINDSIGHT_DECISION_CUTOFF_GMT` is validated centrally as a 24-hour `HH:MM` value, default `09:50`. `GET /api/v1/config` supplies this value to the client. The planned selection and metric services will consume the same configuration.

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

These are availability counts, **not accuracy metrics**. See [the generated quality report](backend/data/quality-report.json) for daily coverage and provenance summary. After ingestion, refresh the landing page to fetch its latest snapshot status.

## Methodology and source provenance

- **Scope:** React, Python and Docker; national Elexon wind forecasts and outturn; January 2026 purchase decisions and quantitative forecast accuracy.
- **Interpretation:** decision day D maps to D+1 delivery: January 1–31 decisions imply January 2–February 1 delivery. Expected comparisons are 744 hourly periods, subject to actual coverage.
- **Assumption:** 09:50 GMT uses [Nord Pool’s N2EX guide](https://support.nordpoolgroup.com/support/solutions/articles/8000088463-about-the-n2ex-day-ahead-auction), dated July 26, 2022. The client did not specify its exchange or deadline. This reference is not an operational specification for all UK markets.
- **Planned selection:** for each exact next-day hourly target, choose the latest [WINDFOR](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream) publication at or before that decision’s configured cutoff.
- **Planned alignment:** compare forecast MW with the mean of both corresponding [FUELHH](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) WIND half-hour average MW values. Incomplete hours remain missing. Signed error is forecast minus hourly-average outturn; positive means overforecast.
- **Limitations:** source populations may differ; observed errors are series comparisons. No demand, prices, actual bids, exact procurement deficits or financial savings can be inferred.

## Structure

```text
frontend/                   React + TypeScript + Vite, connection states, Vitest
backend/app/api/            Health, snapshot status and pilot configuration routes
backend/app/core/           Validated environment configuration
backend/app/schemas.py      Pydantic response contracts
backend/app/services/       Reserved for analytical services
backend/app/ingestion/      Elexon client, validation, acquisition and coverage checks
backend/app/repositories/   Atomic SQLite snapshot publishing and read-only inspection
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

Current verification: **60 backend tests and 7 frontend tests passed**, with no failures or skips. Ruff, TypeScript checking, the frontend production build, Docker startup and the development API proxy passed. The backend test client emits one dependency deprecation warning for its `httpx` integration. CI and deployed end-to-end verification remain planned.

## Implementation status

| Item | Status |
| --- | --- |
| React/FastAPI scaffold, health, configurable assumption | Implemented |
| Docker, tests, frontend build | Verified locally |
| Live ingestion / SQLite / quality report | Implemented; full decision-window coverage verified |
| As-of selection, hourly averaging, metrics | Planned |
| Decision Replay / Accuracy / Evolution | Planned |
| CI and public hosting | Planned; no public application URL yet |

## AI assistance

I used OpenAI Codex for development.
