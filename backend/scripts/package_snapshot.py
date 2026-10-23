"""Prepare a validated read-only release copy of an explicitly ingested snapshot."""

import argparse
import json
import os
import sqlite3
import sys
import tempfile
from contextlib import closing
from pathlib import Path

from app.ingestion.models import IngestionError
from app.services.release import validate_snapshot

ROOT = Path(__file__).resolve().parents[1]


def package_snapshot(source: Path, destination: Path) -> dict:
    if source.resolve() == destination.resolve():
        raise IngestionError("Release destination must differ from the development snapshot")
    validate_snapshot(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent) as directory:
        temporary = Path(directory) / destination.name
        with closing(sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)) as original:
            with closing(sqlite3.connect(temporary)) as copy:
                original.backup(copy)
        manifest = validate_snapshot(temporary)
        manifest_file = Path(directory) / "manifest.json"
        manifest_file.write_text(json.dumps(manifest, indent=2) + "\n")
        temporary.chmod(0o444)
        os.replace(temporary, destination)
        os.replace(manifest_file, destination.parent / "manifest.json")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "data/windsight.sqlite3")
    parser.add_argument("--destination", type=Path, default=ROOT / "snapshot/windsight.db")
    args = parser.parse_args()
    try:
        print(json.dumps(package_snapshot(args.source, args.destination), indent=2))
    except (OSError, ValueError, RuntimeError, sqlite3.Error) as exc:
        print(f"Snapshot packaging failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
