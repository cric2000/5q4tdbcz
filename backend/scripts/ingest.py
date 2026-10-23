"""Run from backend/: python -m scripts.ingest [--database data/windsight.sqlite3]."""

import argparse
import json
import sqlite3
import sys
from pathlib import Path

import httpx

from app.core.config import Settings
from app.core.scope import Scope
from app.ingestion.client import ElexonClient
from app.ingestion.models import IngestionError
from app.ingestion.pipeline import acquire
from app.repositories.snapshot import write_snapshot


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the January decision Elexon wind snapshot")
    parser.add_argument("--database", type=Path, default=Path("data/windsight.sqlite3"))
    parser.add_argument(
        "--allow-incomplete",
        action="store_true",
        help="Explicitly allow publishing an incomplete snapshot; missing periods remain missing",
    )
    args = parser.parse_args()
    scope = Scope(Settings().decision_cutoff_gmt)
    try:
        with httpx.Client(
            timeout=httpx.Timeout(30, connect=10),
            headers={"Accept": "application/json", "User-Agent": "WindSight/0.1 historical-pilot"},
        ) as http:
            forecasts, outturn, quality, batches = acquire(
                ElexonClient(http), scope, progress=lambda message: print(message, file=sys.stderr)
            )
        if not quality["complete"] and not args.allow_incomplete:
            print(json.dumps(quality, indent=2), file=sys.stderr)
        report = write_snapshot(
            args.database,
            forecasts,
            outturn,
            quality,
            batches,
            allow_incomplete=args.allow_incomplete,
        )
    except (IngestionError, OSError, sqlite3.Error) as exc:
        print(f"Ingestion failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
