FROM python:3.14-alpine

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install build dependencies and runtime libraries
RUN apk add --no-cache \
    postgresql-dev \
    gcc \
    musl-dev \
    linux-headers \
    binutils \
    proj \
    proj-dev \
    gdal \
    gdal-dev \
    geos \
    geos-dev \
    ghostscript \
    && rm -rf /var/cache/apk/*

WORKDIR /app
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

ENTRYPOINT python manage.py runserver 0.0.0.0:8000
