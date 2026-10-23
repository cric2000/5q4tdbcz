"""Single-origin deployment entrypoint; assets and snapshot are prepared before release."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import Settings
from app.main import create_app

# Deployment always reads the versioned release asset. Local API development keeps
# its independently ingested database through app.main:app instead.
settings = Settings(database_path=ROOT / "backend/snapshot/windsight.db")
app = create_app(settings, frontend_directory=ROOT / "frontend/dist")
