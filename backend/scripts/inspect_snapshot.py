"""Print the quality report embedded in a local snapshot without modifying it."""

import argparse
import json
import sqlite3
import sys
from pathlib import Path

from app.ingestion.models import IngestionError
from app.repositories.snapshot import read_quality_report


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect an Elexon wind snapshot read-only")
    parser.add_argument("--database", type=Path, default=Path("data/windsight.sqlite3"))
    args = parser.parse_args()
    try:
        print(json.dumps(read_quality_report(args.database), indent=2))
    except (IngestionError, sqlite3.Error, OSError) as exc:
        print(f"Snapshot inspection failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
