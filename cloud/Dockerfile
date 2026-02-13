FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for PostGIS support and SRTM terrain
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY logtail_dashboard/ ./logtail_dashboard/
COPY cloud/alembic/ ./alembic/
COPY cloud/alembic.ini ./alembic.ini

# Create data directories
RUN mkdir -p /data/srtm /data/exports

# Expose API port
EXPOSE 8083

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8083/api/v2/health')"

# Run with uvicorn
CMD ["python", "-m", "uvicorn", "logtail_dashboard.api:app", \
     "--host", "0.0.0.0", "--port", "8083", \
     "--workers", "2", "--log-level", "info"]
