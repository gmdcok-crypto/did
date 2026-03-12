# PWA Digital Ad CMS - Backend
FROM python:3.12-slim

WORKDIR /app

# 시스템 의존성 (필요 시 추가)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 의존성 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 앱 코드 복사 (.env는 이미지에 넣지 않고 실행 시 -e 또는 docker-compose env로 전달)
COPY app ./app

# 업로드 디렉터리 (config 기본값 ./uploads)
RUN mkdir -p /app/uploads

EXPOSE 8000

# 기본: HTTP (리버스 프록시에서 SSL 처리 시)
# HTTPS 필요 시: -e SSL_KEYFILE=/app/certs/key.pem -e SSL_CERTFILE=/app/certs/cert.pem 및 볼륨 마운트 후 CMD 변경
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
