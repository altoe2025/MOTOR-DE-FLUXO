# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS frontend
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/index.html web/vite.config.ts web/tsconfig.json ./
COPY web/src ./src
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_MOTOR_BUILD_SHA
# Typecheck shipped source and build Vite; observed test fixtures stay outside context.
RUN npm run build

FROM python:3.12-slim-bookworm AS backend
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /build
COPY requirements/web.lock ./requirements/web.lock
COPY requirements/build.lock ./requirements/build.lock
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --require-hashes -r requirements/web.lock \
    && /opt/venv/bin/pip install --no-cache-dir --require-hashes -r requirements/build.lock
COPY pyproject.toml ./
COPY motor ./motor
COPY servidor ./servidor
# Install metadata as well as modules: the model reports importlib.metadata.version.
RUN /opt/venv/bin/pip install --no-cache-dir --no-deps --no-build-isolation . \
    && /opt/venv/bin/pip uninstall --yes setuptools pip

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/opt/venv/bin:$PATH \
    WEB_DIST_DIR=/app/web/dist
WORKDIR /app
RUN groupadd --gid 10001 motor \
    && useradd --uid 10001 --gid motor --no-create-home --shell /usr/sbin/nologin motor
COPY --from=backend /opt/venv /opt/venv
COPY --from=frontend /build/web/dist ./web/dist
USER 10001:10001
EXPOSE 8000
CMD ["python", "-m", "servidor"]
