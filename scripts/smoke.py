"""Verify compiled frontend assets, API contracts and the prepared release snapshot over HTTP."""

import argparse
import json
import math
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def request(base: str, path: str, *, expected: int = 200, method: str = "GET") -> bytes:
    try:
        with urlopen(
            Request(base.rstrip("/") + path, method=method), timeout=10
        ) as response:
            status, body = response.status, response.read()
    except HTTPError as error:
        status, body = error.code, error.read()
    if status != expected:
        raise ValueError(
            f"{method} {path}: expected HTTP {expected}, received {status}"
        )
    return body


def verify(web: str, api: str) -> dict:
    manifest = json.loads((ROOT / "backend/snapshot/manifest.json").read_text())
    html = request(web, "/").decode()
    assert "WindSight" in html and 'id="root"' in html, "Compiled React page is missing"
    assets = re.findall(r'(?:src|href)="([^"]+\.(?:js|css))"', html)
    assert assets, "Compiled frontend assets are missing"
    for asset in assets:
        assert asset.startswith("/assets/"), "Unexpected external frontend asset"
        assert request(web, asset), f"Empty frontend asset: {asset}"
    health = json.loads(request(web, "/api/v1/health"))
    assert health["data_status"] == "snapshot_ready", "Packaged data is not ready"
    assert json.loads(request(api, "/api/v1/health")) == health, (
        "API proxy disagrees with backend"
    )
    config = json.loads(request(web, "/api/v1/config"))
    metadata = json.loads(request(web, "/api/v1/metadata"))
    assert metadata["snapshot"]["content_sha256"] == manifest["content_sha256"]
    reference = {
        "snapshot_id": manifest["content_sha256"],
        "decision_cutoff_gmt": config["decision_cutoff_gmt"],
    }
    overall = json.loads(request(web, "/api/v1/accuracy?from=2026-01-01&to=2026-01-31"))
    daily = json.loads(
        request(web, "/api/v1/accuracy/daily?from=2026-01-01&to=2026-01-31")
    )
    quality = json.loads(request(web, "/api/v1/data-quality"))
    for value in [overall, daily, quality]:
        assert value["meta"] == reference, (
            "Responses mix snapshots or cutoff assumptions"
        )
    assert overall["metrics"]["coverage"]["expected_hours"] == 744
    assert (
        overall["metrics"]["coverage"]["matched_hours"]
        == manifest["matched_hours"]
        == 744
    )
    assert quality["current_coverage"] == overall["metrics"]["coverage"]
    assert sum(row["count"] for row in overall["error_histogram"]) == 744
    assert (
        len(daily["days"]) == 31 and daily["days"][-1]["delivery_date"] == "2026-02-01"
    )
    replay = json.loads(request(web, "/api/v1/decisions/2026-01-14"))
    boundary = json.loads(request(web, "/api/v1/decisions/2026-01-31"))
    target = replay["hours"][0]["target_time"]
    evolution = json.loads(
        request(web, "/api/v1/evolution?" + urlencode({"target_time": target}))
    )
    for value in [replay, boundary, evolution]:
        assert value["meta"] == reference
    assert replay["delivery_date"] == "2026-01-15" and len(replay["hours"]) == 24
    assert boundary["delivery_date"] == "2026-02-01" and len(boundary["hours"]) == 24
    hour = replay["hours"][0]
    assert evolution["comparison"] == hour
    assert math.isclose(hour["actual_mw"], sum(hour["actual_half_hours_mw"]) / 2)
    assert math.isclose(hour["error_mw"], hour["forecast_mw"] - hour["actual_mw"])
    chosen = [row for row in evolution["publications"] if row["selected_as_of"]]
    assert len(chosen) == 1 and chosen[0]["available_at_cutoff"]
    assert chosen[0]["publish_time"] == hour["forecast_published_at"]
    assert b"swagger-ui" in request(web, "/docs")
    assert json.loads(request(web, "/openapi.json"))["info"]["title"] == "WindSight API"
    assert (
        json.loads(request(web, "/api/v1/decisions/2026-02-01", expected=422))["error"][
            "code"
        ]
        == "invalid_request"
    )
    request(web, "/api/v1/not-a-route", expected=404)
    request(web, "/api/v1/health", expected=405, method="POST")
    request(web, "/assets/not-a-file.js", expected=404)
    # Neither static-serving arrangement may expose the packaged SQLite file.
    request(web, "/backend/snapshot/windsight.db", expected=404)
    return {
        "status": "passed",
        "frontend_assets": len(assets),
        "matched_hours": 744,
        "snapshot_id": reference["snapshot_id"],
        "mae_mw": overall["metrics"]["mae_mw"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:15173")
    parser.add_argument("--api-url", default="http://127.0.0.1:18000")
    parser.add_argument(
        "--start-server",
        action="store_true",
        help="Start the portable deployment entrypoint locally",
    )
    parser.add_argument("--port", type=int, default=18100)
    args = parser.parse_args()
    server = None
    with tempfile.TemporaryFile(mode="w+") as logs:
        try:
            web, api = args.base_url, args.api_url
            if args.start_server:
                web = api = f"http://127.0.0.1:{args.port}"
                server = subprocess.Popen(
                    [
                        sys.executable,
                        "-m",
                        "uvicorn",
                        "index:app",
                        "--host",
                        "127.0.0.1",
                        "--port",
                        str(args.port),
                    ],
                    cwd=ROOT,
                    stdout=logs,
                    stderr=logs,
                )
                deadline = time.monotonic() + 15
                while True:
                    try:
                        request(web, "/api/v1/health")
                        break
                    except (OSError, URLError):
                        if server.poll() is not None or time.monotonic() >= deadline:
                            raise RuntimeError(
                                "Portable deployment server failed to start"
                            ) from None
                        time.sleep(0.1)
            print(json.dumps(verify(web, api), indent=2))
            return 0
        except (AssertionError, OSError, ValueError, RuntimeError) as error:
            print(f"Release smoke failed: {error}", file=sys.stderr)
            if server:
                logs.seek(0)
                print(logs.read()[-4000:], file=sys.stderr)
            return 1
        finally:
            if server and server.poll() is None:
                server.terminate()
                try:
                    server.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()


if __name__ == "__main__":
    raise SystemExit(main())
