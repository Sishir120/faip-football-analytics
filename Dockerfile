# ── FAIP Backend — Dockerfile ────────────────────────────────────────────────
# Build context is the REPO ROOT (Railway default).
# All paths reference the backend/ subdirectory.
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim

# System deps for ML packages (matplotlib, lxml, mplsoccer, psycopg2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (layer-cached unless requirements.txt changes)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the full backend source
COPY backend/ .

# Railway injects $PORT at runtime; default to 8080 if not set
ENV PORT=8080

EXPOSE 8080

# Use JSON form to handle OS signals cleanly
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
