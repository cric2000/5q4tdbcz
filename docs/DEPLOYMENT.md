# Deployment

The [hosted demo](https://windsight-five.vercel.app) and [API docs](https://windsight-five.vercel.app/docs) share one origin. Unpushed local changes are not reflected there; verify each deployment after publishing.

## Prepare the release snapshot

A fresh checkout includes `backend/snapshot/windsight.db` and `manifest.json`. Builds validate this asset offline; startup never ingests data. Local API development prefers `backend/data/windsight.sqlite3` when present. Production Docker and `index.py` explicitly use the release snapshot.

After an intentional data refresh, run from `backend/` with host dependencies installed:

```bash
../.venv/bin/python -m scripts.ingest
../.venv/bin/python -m scripts.package_snapshot
../.venv/bin/python -m scripts.validate_snapshot
```

Packaging creates a separate backup, verifies SQLite integrity, provenance, coverage and checksums, and rejects incomplete/conflicting data. Review and commit the database and manifest together. Changing the runtime cutoff recomputes analysis without rewriting the source snapshot; `/api/v1/data-quality` distinguishes current coverage from the stored ingestion report.

## Production Docker

From the repository root, stop development and run only the base Compose configuration:

```bash
docker compose down
docker compose -f docker-compose.yml up --build -d --wait
```

React is compiled and served by Nginx at [localhost:5173](http://localhost:5173); the API is at [localhost:8000](http://localhost:8000). The frontend also proxies `/api/v1`, `/api`, `/docs` and `/openapi.json`. The backend runs as an unprivileged user with a read-only filesystem and temporary `/tmp` storage. Production has no source/data mounts or reload workers.

To check production alongside development:

```bash
WINDSIGHT_API_PORT=18000 WINDSIGHT_WEB_PORT=15173 docker compose -p windsight-release -f docker-compose.yml up --build -d --wait
.venv/bin/python scripts/smoke.py
docker compose -p windsight-release -f docker-compose.yml down
```

The test instance uses ports 15173/18000. Return the main instance to development with `docker compose up --build -d --wait`.

## Combined application check

With the host dependencies from the README installed, run from the repository root:

```bash
npm run build --prefix frontend
PYTHONPATH=backend .venv/bin/python -m scripts.validate_snapshot
.venv/bin/python scripts/smoke.py --start-server
```

The smoke command starts `index.py` temporarily on port 18100 and stops it afterwards. It checks compiled assets, analytical references/calculations, deadline-aware prior accuracy, scope boundaries, docs, error responses and that the SQLite file is not publicly downloadable. The combined app serves React at `/` and the API welcome at `/api`; the API-only development server keeps its welcome at `/`.

## Vercel and automatic deployment

The connected `windsight` project uses `main` as its production branch. Pushes trigger Vercel builds; GitHub Actions runs independently and does **not** gate deployment. Check both statuses before sharing a release.

| Setting | Repository configuration |
| --- | --- |
| Root / framework | Repository root / FastAPI (`vercel.json`) |
| Runtimes | Python 3.14 (`.python-version`), Node 24 (root `package.json`) |
| Install | Python lockfile via root `requirements.txt`, plus `npm ci --prefix frontend` |
| Build | Offline snapshot validation, then React type check/build |
| Runtime asset | Versioned snapshot; compiled frontend registered by `index.py` |
| Deadline | `WINDSIGHT_DECISION_CUTOFF_GMT`, default `09:50` |

The frontend requests relative `/api/v1/...` URLs. No separate API base URL or output-directory override is needed. `.vercelignore` and function exclusions omit development data, environment files, tests and local notes; the snapshot stays outside the public frontend directory.

After deployment, verify anonymous access:

```bash
.venv/bin/python scripts/smoke.py --base-url https://windsight-five.vercel.app --api-url https://windsight-five.vercel.app
```

The [CI workflow](../.github/workflows/ci.yml) runs lint/format checks, both test suites, frontend build, snapshot validation, portable HTTP smoke and production Docker HTTP smoke on pushes and pull requests. It does not ingest or deploy. A successful older run does not verify later changes.
