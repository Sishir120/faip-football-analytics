# ── FAIP Backend — Dockerfile ────────────────────────────────────────────────
# Targets Python 3.12-slim for a lean, production-ready image.
# Railway builds this automatically on every git push.
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim

# System deps needed by some ML packages (e.g. matplotlib, lxml, mplsoccer)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (layer-cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend source
COPY . .

# Railway injects $PORT at runtime; default to 8080 if not set
ENV PORT=8080

EXPOSE 8080

# Runs uvicorn on the PORT env var Railway provides
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
