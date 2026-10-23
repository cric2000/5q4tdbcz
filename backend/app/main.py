from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from app.api.routes import router
from app.core.config import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings if settings is not None else Settings()
    application = FastAPI(
        title="WindSight API",
        version="0.1.0",
        description="Historical wind pilot: health, snapshot status and pilot configuration.",
    )
    application.state.settings = config
    application.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_methods=["GET"],
        allow_headers=["Accept", "Content-Type"],
    )
    application.include_router(router)

    @application.get("/", response_class=HTMLResponse, include_in_schema=False)
    def welcome() -> str:
        return """<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WindSight API</title>
</head>
<body>
    <h1>Welcome to the WindSight API</h1>
    <p>Visit <a href="/docs">/docs</a> to explore all available endpoints.</p>
</body>
</html>"""

    return application


app = create_app()
