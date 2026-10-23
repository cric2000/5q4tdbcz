"""Verify release records, provenance, coverage, fingerprints and optional manifest offline."""

import argparse
import json
import sqlite3
import sys
from pathlib import Path

from app.services.release import validate_snapshot

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=ROOT / "snapshot/windsight.db")
    parser.add_argument("--manifest", type=Path, default=ROOT / "snapshot/manifest.json")
    args = parser.parse_args()
    try:
        print(json.dumps(validate_snapshot(args.database, args.manifest), indent=2))
    except (OSError, ValueError, RuntimeError, sqlite3.Error) as exc:
        print(f"Release validation failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
