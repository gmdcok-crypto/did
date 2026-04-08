# PWA 디지털 광고 솔루션

PWA 기반 디지털 광고 플레이어와 CMS 백오피스입니다.

## 구성

- **backend** — FastAPI (Python), SQLite/PostgreSQL, 인증·캠페인·스케줄·디바이스·이벤트 API
- **cms** — React (Vite) 관리자 대시보드 (로그인, 대시보드, 캠페인/미디어/스케줄/디바이스 목록)
- **player** — React PWA (Vite) 광고 플레이어 (디바이스 등록, 스케줄 수신, 미디어 재생, 이벤트 전송)

## 사전 요구사항

- Node.js 18+
- Python 3.10+

## 실행 방법

### 1. 백엔드

```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m app.init_db   # 관리자 계정·기본 그룹 생성
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API: http://localhost:8000  
- 관리자: `admin@example.com` / `admin123` (init_db 실행 후)

#### HTTPS로 실행 (PC 로컬)

로컬에서 API 서버를 HTTPS로 띄우려면:

1. **인증서 생성** (최초 1회, `backend` 폴더에서):
   ```bash
   python scripts/gen_self_signed_cert.py
   ```
   → `certs/key.pem`, `certs/cert.pem` 생성 (localhost, 127.0.0.1용 자체 서명 인증서)

2. **HTTPS 서버 실행**
   - Windows: `run-https.bat` 더블클릭 또는 터미널에서 실행  
   - 또는 수동:
   ```bash
   cd backend
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --ssl-keyfile=./certs/key.pem --ssl-certfile=./certs/cert.pem
   ```
   - 접속: **https://127.0.0.1:8000** (브라우저에서 자체 서명 인증서 경고가 나오면 "고급" → "접속"으로 진행)

3. **CMS/플레이어에서 사용**  
   - CMS·플레이어의 `VITE_API_URL`을 `https://127.0.0.1:8000/api` 로 맞추고, 같은 PC에서 접속하면 CORS가 이미 허용되어 있습니다.

**참고**: 자체 서명 인증서는 개발·테스트용입니다. 실제 도메인(예: noteserver.iptime.org)에서는 nginx 등 리버스 프록시에 Let's Encrypt 인증서를 붙이는 방식을 권장합니다.

#### DDNS / 외부 접속

DDNS(예: noteserver.iptime.org)로 외부에서 CMS·플레이어 접속 시:

1. **백엔드**를 외부에서 접근 가능하게 실행 (같은 PC면 `--host 0.0.0.0` 또는 공유기 포트포워딩 후 `--host 127.0.0.1` + nginx 역방향 프록시).
2. **백엔드 `.env`**에 CORS 허용 출처 추가:
   ```env
   CORS_ORIGINS_EXTRA=https://noteserver.iptime.org:5173,https://noteserver.iptime.org:5174
   ```
   (실제 DDNS 주소와 CMS/플레이어 포트로 변경)
3. **CMS·플레이어**의 `VITE_API_URL`을 백엔드 주소로 설정 (예: `https://noteserver.iptime.org:8000/api`).

`/api/player/schedule?device_id=...` **404** 는 해당 device_id가 DB에 없을 때 나옵니다. 플레이어에서 인증코드로 등록한 기기만 200 응답을 받습니다.

### 2. CMS (관리자)

```bash
cd cms
npm install
npm run dev
```

- http://localhost:5173 에서 로그인 후 대시보드·캠페인·미디어·스케줄·디바이스 관리

### 3. 플레이어 (PWA)

```bash
cd player
npm install
npm run dev
```

- http://localhost:5174 에서 플레이어 실행. 디바이스가 자동 등록되고, 스케줄이 있으면 재생됩니다.

## 첫 동작 확인 순서

1. 백엔드 실행 → `python -m app.init_db` → `uvicorn app.main:app --reload --port 8000`
2. CMS에서 로그인 (admin@example.com / admin123)
3. CMS **미디어**에서 콘텐츠 추가 (타입: image 또는 video, URL 입력)
4. CMS **캠페인**에서 캠페인 생성 (콘텐츠 ID 연결은 API 또는 추후 UI에서)
5. CMS **디바이스**에서 그룹 확인 (init_db로 "기본" 그룹 생성됨)
6. CMS **스케줄**에서 스케줄 생성 (캠페인 ID, 디바이스 그룹 ID, 레이아웃 full)
7. 플레이어 실행 → 디바이스 등록 → 같은 그룹이면 스케줄 수신 후 재생

## 환경 변수

- **backend**  
  - `DATABASE_URL`: 기본 `sqlite+aiosqlite:///./app.db`  
  - `SECRET_KEY`: JWT 서명용  
  - `.env`는 `.env.example`을 복사해 사용

- **cms**  
  - `VITE_API_URL`: API 주소 (기본 `http://localhost:8000/api`)

- **player**  
  - `VITE_API_URL`: API 주소 (기본 `http://localhost:8000/api`)

## 회사별 배포 (권장)

여러 회사를 서비스할 때는 **회사마다 배포와 DB를 분리**하는 것을 권장합니다.

- **회사 A** → 전용 Railway 프로젝트(또는 서버) + 전용 DB (예: `did_company_a`)
- **회사 B** → 전용 Railway 프로젝트 + 전용 DB (예: `did_company_b`)

같은 코드베이스를 회사마다 한 번씩 배포하고, 각 배포마다 `DATABASE_URL`만 그 회사 전용 DB로 설정합니다.  
한 DB에 여러 회사 데이터를 섞지 않으면 백업·복구·권한 관리가 단순해집니다.

## 문서

- [Railway 배포 (Docker 없음, MariaDB)](docs/railway-deploy.md)
- [기술 스펙 및 시스템 흐름](docs/PWA-Digital-Ad-CMS-Spec.md)
- [Mermaid 흐름도](docs/system-flow-mermaid.md)

## 문제 해결

- **백엔드 재시작 시** `Shutting down`, `CancelledError`, `Event loop is closed` 로그는 `--reload` 시 정상. lifespan에서 `engine.dispose()`로 DB 연결 정리함.
- **삭제 실패**: 미디어/디바이스 삭제 시 FK 참조를 먼저 지우도록 구현됨. 그래도 실패하면 백엔드 실행·HTTPS 인증서·CORS 확인.
