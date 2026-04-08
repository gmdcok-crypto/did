# Railway: 단일 Debian 이미지로 Python·glibc·libstdc++ 일치 (Nixpacks 혼합 런타임 회피)
# 로컬 docker-compose 와 별개

FROM node:20-bookworm-slim AS frontend
WORKDIR /src/player
COPY player/package.json player/package-lock.json ./
RUN npm ci --ignore-engines
COPY player/ .
RUN npm run build

WORKDIR /src/cms
COPY cms/package.json cms/package-lock.json ./
RUN npm ci --ignore-engines
COPY cms/ .
ENV VITE_BASE_PATH=/admin/
RUN npm run build

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend /src/player/dist ./player_dist/
COPY --from=frontend /src/cms/dist ./cms_dist/

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
