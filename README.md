# WindSight — Day-ahead wind intelligence

**Current status: local application scaffold.** React, FastAPI, configuration, tests, and Docker are present. Ingestion, analytical APIs and dashboards are planned. The landing page contains no fabricated wind data or accuracy figures.

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

Startup requires no Elexon requests or data archive. Health describes service liveness and explicitly reports `data_status: not_ingested`.

```bash
docker compose down
```

To check the production build locally, stop the development services and explicitly select the base configuration:

```bash
docker compose down
docker compose -f docker-compose.yml up --build -d --wait
```

Production uses compiled React served by Nginx, with no source mounts or reload workers. The application URLs stay the same. Switch back to development with `docker compose up --build -d --wait`.

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
backend/app/api/            Health and pilot configuration routes
backend/app/core/           Validated environment configuration
backend/app/schemas.py      Pydantic response contracts
backend/app/services/       Reserved for analytical services
backend/app/repositories/   Reserved for SQLite access
backend/scripts/            Reserved for API ingestion
backend/tests/              pytest setup checks
backend/data/               Generated data will live here (currently empty)
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

Setup verification: **8 backend tests and 4 frontend tests passed**, with no failures or skips. Ruff, TypeScript checking, the production build, Docker health checks and both development/production API proxies passed. The backend test client emits one dependency deprecation warning for its `httpx` integration. CI is planned.

## Implementation status

| Item | Status |
| --- | --- |
| React/FastAPI scaffold, health, configurable assumption | Implemented |
| Docker, tests, frontend build | Verified locally |
| Live ingestion / SQLite / quality report | Planned |
| As-of selection, hourly averaging, metrics | Planned |
| Decision Replay / Accuracy / Evolution | Planned |
| CI and public hosting | Planned; no public application URL yet |

## AI assistance

I used OpenAI Codex for development.
