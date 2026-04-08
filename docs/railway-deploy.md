# Railway 전체 세팅 (MariaDB + API·플레이어 + CMS)

Docker 없이 **한 GitHub 저장소**로 아래 **3개 서비스 + DB** 를 구성합니다.

| 구성 | 역할 | Root Directory | 설정 파일 |
|------|------|----------------|-----------|
| **MariaDB** | DB | (플러그인) | Railway 대시보드 |
| **API** | FastAPI, 플레이어 PWA, `/api`, `/uploads` | **`/`** (저장소 루트) | `nixpacks.toml`, `railway.toml` |
| **CMS** | 관리자 React 정적 서빙 | **`cms`** | `cms/nixpacks.toml`, `cms/railway.toml` |

---

## 0. 한 번에 올리는 순서

1. GitHub에 코드 푸시
2. [Railway](https://railway.app) → **New Project** → **Deploy from GitHub** → 이 저장소 선택
3. **MariaDB** 추가 (Database → MariaDB)
4. **API 서비스** (아래 §1) — 먼저 배포해 **공개 URL** 확인
5. **CMS 서비스** (아래 §2) — `VITE_API_URL` 에 API 주소 넣고 배포

---

## 1. MariaDB

1. 프로젝트에서 **New → Database → MariaDB**
2. API 서비스 **Variables**에 MariaDB 연결:
   - **권장**: **Variable Reference**로 MariaDB의 **`MYSQL_URL`** 을 API 서비스에 연결 (이름 그대로 `MYSQL_URL` 가능)
   - `DATABASE_URL` 을 따로 안 넣어도, 백엔드가 `MYSQL_URL` 을 `DATABASE_URL` 로 맞춥니다.

---

## 2. API + 플레이어 서비스

1. 같은 프로젝트에 **GitHub 저장소**로 서비스 추가 (이미 있으면 해당 서비스 선택)
2. **Settings → Root Directory** → **`/`** (비우지 말고 **저장소 루트**)
3. **Variables** (필수):

| 변수 | 설명 |
|------|------|
| `MYSQL_URL` | MariaDB에서 Reference (위 §1) |
| `SECRET_KEY` | JWT용 긴 임의 문자열 |
| `REGISTRATION_AUTH_CODE` | 플레이어 디바이스 등록 코드 (운영 값으로 변경) |

선택: `CORS_ORIGINS_EXTRA` — 커스텀 도메인만 쓸 때 CMS origin 등

4. **Deploy** 후 확인:
   - `https://<API도메인>/health` → `{"status":"ok"}`
   - `https://<API도메인>/` → 플레이어 UI
   - `https://<API도메인>/docs` → API 문서

빌드: 루트 `nixpacks.toml` 이 Python venv + `player` 빌드 → `backend/player_dist/` 복사. 시작: 루트 `railway.toml` 의 uvicorn.

---

## 3. CMS 서비스 (관리자)

1. 같은 프로젝트에서 **New → GitHub Repo** → **같은 저장소** 선택
2. **Settings → Root Directory** → **`cms`**
3. **Variables** (빌드에 반영되므로 **배포 전** 설정):

| 변수 | 예시 | 설명 |
|------|------|------|
| `VITE_API_URL` | `https://<API서비스이름>.up.railway.app/api` | §2에서 나온 API **공개 HTTPS URL** + `/api` |

4. **Deploy**

배포 후 **관리자 URL** = CMS 서비스에 Railway가 붙인 공개 URL (예: `https://xxxx.up.railway.app`).

- 로그인: `admin@example.com` / `admin123` (최초 시드, 운영에서 비밀번호 변경)

`*.up.railway.app` 간 CORS 는 API에 이미 허용 패턴이 있어 별도 설정이 없어도 되는 경우가 많습니다.

---

## 4. URL 정리

| 용도 | 주소 |
|------|------|
| **플레이어** | `https://<API>/` |
| **API·Swagger** | `https://<API>/docs` |
| **헬스** | `https://<API>/health` |
| **CMS(관리자)** | `https://<CMS서비스>/` (CMS 전용 서비스 URL) |

API URL이 바뀌면 `VITE_API_URL` 을 수정하고 **CMS를 다시 배포**해야 합니다 (Vite는 빌드 시 API 주소를 박음).

---

## 5. 업로드 파일

`backend/uploads` 는 컨테이너 디스크입니다. 유실을 막으려면 Railway **Volume** + `UPLOAD_DIR` 환경 변수로 경로 지정.

---

## 문제 해결

- **헬스체크 실패**: Deploy 로그에서 `MYSQL_URL`, `/app/backend`, `/app/.venv`, `PORT` 확인.
- **CMS가 API에 못 붙음**: `VITE_API_URL` 이 `https://.../api` 형식인지, CMS **재빌드** 했는지 확인.
- **빌드 실패 (Node)**: Root Directory 가 API는 `/`, CMS는 `cms` 인지 확인.
- **DB 연결 실패**: MariaDB와 API가 **같은 프로젝트**인지, `MYSQL_URL` 이 **Private** 주소인지 확인.
