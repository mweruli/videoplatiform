#!/bin/sh
set -e

echo "Waiting for database..."
python - <<'PY'
import time
import sys
from sqlalchemy import create_engine, text
from app.core.config import settings

for attempt in range(30):
    try:
        engine = create_engine(settings.DATABASE_URL)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("Database is up.")
        sys.exit(0)
    except Exception as exc:
        print(f"DB not ready yet ({attempt + 1}/30): {exc}")
        time.sleep(2)
print("Database never became ready.")
sys.exit(1)
PY

echo "Running Alembic migrations..."
alembic upgrade head

echo "Seeding launch categories..."
python -m app.db.seed

echo "Seeding demo data..."
python -m app.db.seed_demo

echo "Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
