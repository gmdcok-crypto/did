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
WORKDIR /app/backend
COPY backend/requirements.txt .
# asyncmy 등 휠이 없을 때 소스 빌드 → gcc 필요. --prefer-binary 로 휠 우선.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libstdc++6 \
    && pip install --no-cache-dir --prefer-binary -r requirements.txt \
    && apt-get purge -y build-essential \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY backend/ .
COPY --from=frontend /src/player/dist ./player_dist/
COPY --from=frontend /src/cms/dist ./cms_dist/
RUN test -f ./cms_dist/index.html && test -d ./cms_dist/assets \
  && echo "cms_dist OK" || (echo "cms_dist missing — Railway에서 /admin 이 비거나 플레이어로 보일 수 있음" && exit 1)

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
