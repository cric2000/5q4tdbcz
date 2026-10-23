# WindSight

A historical pilot for a UK electricity buyer: see the wind forecast available before a day-ahead buying decision and quantify earlier forecast errors. Built with React, TypeScript, shadcn/ui, Tailwind CSS and Python/FastAPI.

[Live demo](https://windsight-five.vercel.app) · [Hosted API docs](https://windsight-five.vercel.app/docs)

## Try the buying overview

Choose **14 January 2026**. The overview shows the forecast for January 15 alongside accuracy evidence available by the January 14 deadline:

- Midnight forecast: **15,828 MW**, published at 09:30 before the assumed 09:50 GMT deadline.
- Earlier accuracy: **297 matched hours**, average absolute gap **2,124.3 MW**. January 1 shows insufficient earlier history.
- **Compare with actual generation** reveals the later reported midnight value, **14,456.5 MW**, and the **+1,371.5 MW** difference.

**Why this forecast?** opens publication history. **Explore historical accuracy** opens an explicitly retrospective range review with daily trends, an error distribution and the largest misses. Returning preserves the buying date and selected hour. Detailed readings and explanations are optional.

## Run with Docker

Requires Docker Engine and Docker Compose v2.

```bash
docker compose up --build -d --wait
```

- App: [localhost:5173](http://localhost:5173)
- API welcome: [localhost:8000](http://localhost:8000)
- Interactive endpoints: [localhost:8000/docs](http://localhost:8000/docs)

The development override mounts source files and runs Vite HMR and Uvicorn reload. Source edits appear without rebuilding. Rebuild after dependency or Dockerfile changes; recreate services after environment/Compose changes. After stopping, restart with `docker compose up -d --wait`. Stop with `docker compose down`.

A validated SQLite snapshot is included, so startup needs no ingestion or Elexon access. An existing development database takes precedence locally. To deliberately refresh it:

```bash
docker compose exec backend python -m scripts.ingest
docker compose exec backend python -m scripts.inspect_snapshot
```

Refreshing development data does not update the packaged release. See [Deployment](docs/DEPLOYMENT.md) for snapshot packaging and production builds.

## Run without Docker

Requires **Python 3.14** and **Node 24**. Stop Docker first if it uses ports 8000/5173.

```bash
python3.14 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.lock
npm ci --prefix frontend
```

In separate terminals, from the repository root:

```bash
# Backend
.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

```bash
# Frontend, with /api proxied to the backend
npm run dev --prefix frontend
```

`WINDSIGHT_DECISION_CUTOFF_GMT` configures the assumed deadline (`HH:MM`, default `09:50`). Docker reads `.env` if you copy `.env.example`; direct execution uses exported environment variables. `WINDSIGHT_DATABASE_PATH` overrides local database selection for direct API execution.

## Test

After installing the host dependencies above, run from the repository root:

```bash
.venv/bin/python -m pytest backend/tests -q
.venv/bin/ruff check backend index.py scripts
.venv/bin/ruff format --check backend index.py scripts
npm test --prefix frontend
npm run build --prefix frontend
PYTHONPATH=backend .venv/bin/python -m scripts.validate_snapshot
.venv/bin/python scripts/smoke.py --start-server
```

The build includes TypeScript checking. The smoke test starts and stops a temporary server for the compiled frontend and API. The last local regression passed **137 backend tests and 60 frontend tests**; hosted checks apply to their individual commits.

## Method and limits

January 1–31, 2026 buying decisions map to January 2–February 1 delivery. For each delivery hour, select the latest Elexon WINDFOR publication available by its buying deadline. Compare it with the mean of both FUELHH WIND half-hour readings. Missing values stay missing; zero remains valid.

The overview's accuracy uses only earlier completed hours whose actual readings were published by the selected deadline. The range review is retrospective. **09:50 GMT is an N2EX reference assumption**, not a client-confirmed deadline. These national series may cover different wind populations; their differences are not guaranteed future errors. Purchase quantities require demand and contracted supply.

## Repository guide

| Path | Purpose |
| --- | --- |
| `frontend/src/` | Buying overview, retrospective analysis, publication history and UI tests |
| `backend/app/` | Typed API, calculations, ingestion and read-only SQLite access |
| `backend/scripts/`, `backend/tests/` | Data preparation commands and backend tests |
| `backend/snapshot/` | Versioned release database and integrity manifest |
| `backend/data/` | Local development database and exported diagnostic reports |
| `index.py`, `vercel.json` | Combined frontend/API deployment |
| `docker-compose*.yml` | Development reload and production container configurations |
| `.github/workflows/ci.yml`, `scripts/smoke.py` | Automated regression, build and HTTP checks |

[Methodology and tradeoffs](docs/APPROACH.md) · [API field guide](docs/API.md) · [Deployment](docs/DEPLOYMENT.md)

## AI assistance

I used OpenAI Codex for development.
