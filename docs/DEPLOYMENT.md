# Production build and deployment

The release is live at [windsight-five.vercel.app](https://windsight-five.vercel.app). The Vercel build, anonymous HTTP smoke and all three dashboard views were verified on October 23, 2026. A hosted GitHub Actions run remains pending until the changes are pushed.

## The prepared data asset

`backend/snapshot/windsight.db` is the versioned SQLite release asset. `backend/snapshot/manifest.json` records its byte checksum, normalized source-content identity, schema, acquisition timestamp, record counts, decision scope and cutoff used for coverage validation. The snapshot contains 18,104 forecast versions, 1,488 actual half-hours and 744 complete comparisons at the recorded 09:50 GMT assumption.

The development database under `backend/data/` remains ignored. Development uses that database when it exists; a fresh checkout reads the bundled release asset instead. An explicit `WINDSIGHT_DATABASE_PATH` overrides this default selection. Production Docker and the portable deployment entrypoint explicitly select the versioned release asset. None of these paths fetch Elexon data or ingest during startup.

To prepare a new release asset after intentional ingestion, run from `backend/`:

```bash
../.venv/bin/python -m scripts.ingest
../.venv/bin/python -m scripts.package_snapshot
../.venv/bin/python -m scripts.validate_snapshot
```

Review the changed database and manifest together before committing. Packaging reads the source without modifying it, creates a separate SQLite backup, recomputes coverage and source identity, checks SQLite integrity and conflicts, and then publishes the validated copy. It refuses incomplete or inconsistent data and makes the release copy read-only. Builds and CI verify the manifest against the actual file and records; they do not depend on live source APIs.

The immutable release asset stays on the recorded dataset even if the development database is re-ingested. The current decision cutoff is still a runtime assumption, exposed consistently through configuration and result metadata. Validate coverage under a changed cutoff using `/api/v1/data-quality`; the stored manifest describes the ingestion cutoff.

## Production Docker

The base Compose file builds compiled React/Nginx and the API with its packaged snapshot. The backend runs as an unprivileged user with a read-only container filesystem; its only temporary writable area is `/tmp`. The image's snapshot files are read-only. Production has no source or data bind mounts.

To run production instead of the default development instance:

```bash
docker compose down
docker compose -f docker-compose.yml up --build -d --wait
```

Open the application at [localhost:5173](http://localhost:5173/), API welcome at [localhost:8000](http://localhost:8000/), or proxied API welcome at [localhost:5173/api](http://localhost:5173/api). API documentation is available through either host at `/docs`; `/openapi.json` also reaches the API. Unknown API paths and missing static assets remain errors.

To test production alongside development, use separate project and port values:

```bash
WINDSIGHT_API_PORT=18000 WINDSIGHT_WEB_PORT=15173 docker compose -p windsight-release -f docker-compose.yml up --build -d --wait
.venv/bin/python scripts/smoke.py
```

The isolated application is at [localhost:15173](http://localhost:15173/) and its API at [localhost:18000](http://localhost:18000/). The smoke command verifies compiled assets, both API access paths, source identity, range/daily/quality consistency, replay calculations, publication selection, January 31→February 1, API documentation and error behavior. It also verifies that the database cannot be downloaded through the static frontend.

Remove the isolated test containers afterwards:

```bash
docker compose -p windsight-release -f docker-compose.yml down
```

Return the main instance to source reload with `docker compose up --build -d --wait`. Rebuilding is required for Dockerfile/dependency changes; subsequent source edits reload as before.

## Portable single-origin build

`index.py` exports the FastAPI deployment application with the same analytical routes and the compiled React directory. The web page is at `/`; the welcome page is at `/api`. The original API-only development entrypoint keeps its welcome page at `/`.

From the repository root, after installing the documented backend and frontend dependencies:

```bash
npm run build --prefix frontend
PYTHONPATH=backend .venv/bin/python -m scripts.validate_snapshot
.venv/bin/python scripts/smoke.py --start-server
```

The last command temporarily runs the deployment entrypoint at `127.0.0.1:18100`, verifies it over HTTP independently of Docker, and stops it. It uses the prepared snapshot, not the ignored development database. These checks establish the portable application's behavior; they do not establish Vercel's hosted build, routing or anonymous access.

## Vercel configuration

The root `vercel.json`, `index.py`, `requirements.txt`, `.python-version`, `package.json` and `pyproject.toml` prepare a single-origin FastAPI deployment. Vercel's documented Python runtime supports 3.14 and an exported FastAPI app. FastAPI's `app.frontend()` registers the compiled React files; the Vercel static setting permits CDN promotion of these public frontend assets while API requests continue through application middleware. See the official [FastAPI deployment guide](https://vercel.com/docs/frameworks/backend/fastapi) and [Python runtime documentation](https://vercel.com/docs/functions/runtimes/python).

Deployment settings:

| Setting | Value |
| --- | --- |
| Repository root | The repository root, not `frontend/` or `backend/` |
| Framework | FastAPI, set by `vercel.json` |
| Python | 3.14, from `.python-version` |
| Node | 24, from the root package engine |
| Dependency install | `uv pip install -r requirements.txt && npm ci --prefix frontend` |
| Build | Validate the snapshot offline, then build React; configured in `vercel.json` |
| Python dependencies | Root `requirements.txt` references `backend/requirements.lock` |
| Data | Include `backend/snapshot/windsight.db` and its manifest |
| Cutoff | `WINDSIGHT_DECISION_CUTOFF_GMT`, default `09:50`; keep the assumption disclosed |

There is no API base URL or external database to configure: the frontend requests `/api/v1/...` on the same origin. Do not set an output-directory override: FastAPI registers the frontend directory. Development data, internal notes, environment files, tests and local caches are excluded from the upload or function bundle. The release snapshot is inside the function and outside the public frontend directory.

The `windsight` project was created in the approved Vercel account and published using a CLI upload of the local workspace. This includes the release changes even before their Git commit. Git integration is not configured, so pushing alone does not currently redeploy this project. From this linked checkout, publish subsequent builds with:

```bash
npx vercel@65.2.0 deploy --prod --scope cric2000s-projects
```

The custom install command must install Python dependencies as well as npm packages: overriding Vercel's install command replaces its automatic Python installation. The hosted build validates the bundled snapshot before compiling React. No credentials belong in Git; `.vercel/` and generated environment files remain ignored.

Run the same anonymous smoke used to verify production:

```bash
.venv/bin/python scripts/smoke.py --base-url https://windsight-five.vercel.app --api-url https://windsight-five.vercel.app
```

Observed results: two compiled frontend assets, 744/744 matched hours, MAE `2013.008064516129` MW and snapshot identity `fb71c007d70b0b92481af1555e98b9a11f9ee2b02463f5d244814de5fb89e177`. The smoke uses standard HTTP requests with no account cookies, credentials or protection bypass. It also checks replay/evolution consistency, the February 1 boundary, Swagger/OpenAPI, expected errors and that the SQLite file cannot be downloaded. Decision Replay, Accuracy & Risk and Forecast Evolution also loaded successfully in the public browser app.

The app and [Swagger documentation](https://windsight-five.vercel.app/docs) use the same public origin. Share the stable production domain above with reviewers.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes, pull requests and manual dispatch. It installs locked dependencies with Python 3.14 and Node 24, runs Ruff and both test suites, builds React, validates the versioned snapshot, verifies the portable app, builds production containers and runs the same HTTP smoke. The workflow cleans up its test containers and has read-only repository permissions. It neither ingests data nor deploys publicly.

Local results are recorded in the README. A green hosted CI run can only be claimed after these changes are pushed and GitHub Actions actually runs them.
