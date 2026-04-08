# HTTPS로 통일해서 쓰기

CMS와 백엔드를 모두 **HTTPS**로 띄우면 `Invalid HTTP request received` 경고가 사라지고 로그인 등이 정상 동작합니다.

## 1. 인증서 생성 (한 번만)

```powershell
cd d:\did\backend
python scripts/gen_self_signed_cert.py
```

→ `backend/certs/key.pem`, `cert.pem` 생성됨.

## 2. 백엔드 Docker 실행 (HTTPS 기본)

```powershell
cd d:\did\backend
docker compose up -d --build
```

→ **https://localhost:8000** 으로 API 서비스 (인증서 없으면 실패 → 1번 먼저 실행).

## 3. CMS를 HTTPS로 실행

```powershell
cd d:\did\cms
npm run dev
```

→ 인증서가 있으면 **자동으로 HTTPS 통일**: CMS는 https://localhost:5173, 프록시는 https://localhost:8000 으로 연결.  
→ `npm run dev:http` 는 HTTP로만 쓸 때만 사용.

## 4. 플레이어를 HTTPS로 실행

```powershell
cd d:\did\player
npm run dev
```

→ 인증서가 있으면 **https://localhost:5174** 로 실행. `VITE_DEV_HTTP=1` 은 쓰지 않음.

## 5. 접속 (HTTPS 통일)

| 대상 | 주소 |
|------|------|
| CMS | https://localhost:5173 |
| 플레이어 | https://localhost:5174 |
| API / 문서 | https://localhost:8000 / https://localhost:8000/docs |
| Health | https://localhost:8000/health |

- 자체 서명 인증서라 브라우저 경고가 나오면 **고급** → **localhost(안전하지 않음)로 이동** 선택.
- 한 번 허용해 두면 같은 주소로는 계속 사용 가능.

## 6. ERR_SSL_PROTOCOL_ERROR 나올 때

- **의미**: 브라우저는 HTTPS로 접속했는데, 그 포트의 서버는 HTTP만 받고 있음.
- **확인**: (1) `backend/certs/key.pem`, `cert.pem` 존재 (2) 백엔드는 `docker compose up -d` 로 띄우고 로그에 `https://0.0.0.0:8000` (3) CMS·플레이어는 `npm run dev` 만 사용 (dev:http·VITE_DEV_HTTP 사용 안 함).
- **조치**: 인증서 생성 → 백엔드 재기동 → CMS·플레이어 `npm run dev` 후 **https://** 로만 접속.

## 7. 요약

- **HTTPS 통일**: 인증서 생성 → `docker compose up -d` → CMS·플레이어 각각 `npm run dev`. API는 **https://localhost:8000**.
