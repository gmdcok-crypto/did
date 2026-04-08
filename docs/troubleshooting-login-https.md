# 로그인·HTTPS·데이터 문제 수정 정리

이 문서는 **백엔드 연결 실패**, **로그인 시 "백엔드에 연결할 수 없습니다"**, **데이터가 하나도 안 보임** 등이 있었던 원인과 수정 사항을 정리한 것입니다.

---

## 1. 발생했던 문제와 원인

### 1.1 "백엔드 연결됨"인데 로그인 시 에러

- **증상**: 로그인 화면에서 "백엔드 연결됨"이 보이지만, 로그인 버튼 클릭 시 "백엔드에 연결할 수 없습니다" 발생.
- **원인**:
  - **HTTPS/HTTP 불일치**: CMS는 HTTPS(5173), 백엔드는 HTTP(8000)로 떠 있으면 브라우저·프록시가 HTTPS로 요청을 보내고, 백엔드는 HTTP만 처리해 `Invalid HTTP request received` 발생. 로그인 요청(POST)이 제대로 전달되지 않음.
  - **브라우저가 백엔드 직접 호출**: `.env`에 `VITE_API_URL=https://127.0.0.1:8000/api` 등이 있으면, API 요청이 **프록시를 거치지 않고** 브라우저에서 백엔드로 직접 나감. 자체 서명 인증서 때문에 브라우저가 연결을 차단해 **백엔드 로그에 아무 요청도 안 찍힘**.
  - **프록시 → 백엔드 TLS**: 프록시가 `https://localhost:8000`으로 연결할 때 Node가 자체 서명 인증서를 검증해 거절하면, 로그인 요청이 백엔드까지 도달하지 않음.

### 1.2 백엔드 로그에 "Invalid HTTP request received" 반복

- **원인**: 클라이언트(브라우저 또는 Vite 프록시)는 HTTPS로 요청을 보내는데, 백엔드는 HTTP만 받도록 떠 있는 경우. TLS로 온 데이터를 HTTP로 파싱하려다 발생.

### 1.3 대시보드에 데이터가 하나도 안 보임

- **원인**: DB에 **관리자 계정**만 있고, **캠페인·스케줄·디바이스·미디어** 시드가 없음. `init_db`는 admin + 디바이스 그룹 "기본"만 만들고, 캠페인/스케줄은 `seed_schedule`를 별도 실행해야 함.

---

## 2. 수정 사항 요약

### 2.1 HTTPS 통일 (백엔드)

| 위치 | 내용 |
|------|------|
| `backend/docker-compose.yml` | 백엔드를 **기본 HTTPS**로 실행하도록 변경. `certs` 볼륨 마운트 + uvicorn `--ssl-keyfile`, `--ssl-certfile` 사용. |
| `backend/docker-compose.https.yml` | 내용은 메인에 통합됨. 참고용으로만 유지. |

- **실행**: 인증서 생성 후 `docker compose up -d` 만 하면 https://localhost:8000 으로 기동.

### 2.2 CMS 개발 서버·프록시 (HTTPS 통일)

| 위치 | 내용 |
|------|------|
| `cms/vite.config.js` | 인증서가 있으면(`backend/certs`) 개발 서버 **HTTPS** + 프록시 타깃 **https://localhost:8000**. 백엔드가 HTTPS일 때 프록시용 `agent: new https.Agent({ rejectUnauthorized: false })` 추가. |
| `cms/package.json` | `npm run dev` 시 **NODE_TLS_REJECT_UNAUTHORIZED=0** 설정. 프록시가 자체 서명 인증서인 백엔드(8000)에 연결할 수 있도록 함. (로컬 개발 전용) |

- **참고**: `NODE_TLS_REJECT_UNAUTHORIZED=0` 사용 시 Node에서 경고가 한 번 나올 수 있음. 로컬 개발용 설정이므로 무시해도 됨.

### 2.3 API 주소는 프록시로만 (브라우저 직접 호출 제거)

| 위치 | 내용 |
|------|------|
| `cms/.env` | **VITE_API_URL** 을 비움(주석 처리). 개발 시 API 요청이 반드시 **같은 origin(5173)** 으로 나가고, Vite 프록시가 `/api`, `/health` 를 https://localhost:8000 으로 넘기도록 함. |

- **이유**: 브라우저가 `https://127.0.0.1:8000` 등으로 직접 호출하면 자체 서명 인증서 때문에 요청이 막혀, 백엔드 로그에 아무것도 안 찍힘.

### 2.4 로그인 실패 시 안내 문구

| 위치 | 내용 |
|------|------|
| `cms/src/pages/Login.jsx` | 경로 표기를 **d:/did/backend** 로 통일 (표시 시 `\b` 등으로 깨지지 않도록). |
| `backend/app/main.py` | 시드 실패 시 로그 메시지 추가. 수동 시드 명령 `docker compose exec backend python -m app.init_db` 안내. |

### 2.5 데이터가 보이도록 시드 실행

- **관리자 + 기본 그룹**: `docker compose exec backend python -m app.init_db` (이미 실행했다면 생략 가능).
- **캠페인·스케줄 1개씩**: `docker compose exec backend python -m app.seed_schedule` 실행 시, "기본" 그룹에 빈 캠페인·스케줄이 생겨 대시보드에 숫자가 표시됨. 미디어·디바이스는 CMS에서 직접 추가.

---

## 3. 권장 실행 순서 (정리)

1. **인증서 생성 (한 번만)**  
   `cd d:\did\backend` → `python scripts/gen_self_signed_cert.py`

2. **백엔드 기동**  
   `docker compose up -d`

3. **DB 시드 (최초 1회)**  
   - `docker compose exec backend python -m app.init_db`  
   - `docker compose exec backend python -m app.seed_schedule`

4. **CMS 개발 서버**  
   `cd d:\did\cms` → `npm run dev`

5. **브라우저**  
   https://localhost:5173 접속 → 인증서 경고 시 "고급" → 접속 → admin@example.com / admin123 로그인.

---

## 4. 참고

- HTTPS 상세: `docs/https-setup.md`
- 백엔드 로그: `docker compose logs -f backend`
- 경고 "NODE_TLS_REJECT_UNAUTHORIZED=0 makes TLS connections insecure" 는 **로컬 개발 시에만** 사용하는 설정에 대한 안내이며, 운영 환경에서는 사용하지 않음.
