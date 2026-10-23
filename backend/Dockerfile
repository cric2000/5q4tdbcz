FROM python:3.14-slim AS runtime
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.lock ./requirements.lock
RUN pip install --no-cache-dir -r requirements.lock
COPY app ./app
COPY scripts ./scripts
COPY snapshot ./snapshot
RUN useradd --create-home appuser && mkdir data && chown appuser:appuser data \
    && chmod 555 snapshot && chmod 444 snapshot/windsight.db snapshot/manifest.json
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM runtime AS production
RUN python -m scripts.validate_snapshot
ENV WINDSIGHT_DATABASE_PATH=/app/snapshot/windsight.db
