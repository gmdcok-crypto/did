# Railway 배포 (MariaDB + 단일 API 서비스)

Docker 없이 **MariaDB + API 서비스 하나**면 됩니다. Nixpacks가 **플레이어 + CMS** 를 모두 빌드해 백엔드에 넣습니다.

| 구성 | 역할 |
|------|------|
| **MariaDB** | DB (플러그인) |
| **API 서비스** (Root **`/`**) | FastAPI, **`/`** 플레이어, **`/admin/`** 관리자(CMS), **`/api`**, **`/uploads`** |

---

## 1. 준비

1. GitHub에 코드 푸시
2. [Railway](https://railway.app) → **New Project** → **Deploy from GitHub** → 이 저장소 선택

---

## 2. MySQL / MariaDB

1. **New → Database → MySQL 또는 MariaDB** (둘 다 `mysql+aiomysql` URL, 앱 동작 동일)
2. API 서비스 **Variables**에 DB 연결:
   - **Variable Reference**로 **`MYSQL_URL`** (이름 그대로 가능)
   - `DATABASE_URL` 을 안 넣어도, 백엔드가 `MYSQL_URL` 을 `DATABASE_URL` 로 맞춥니다.

---

## 3. API 서비스 (단일 서비스)

1. **Settings → Root Directory** → **`/`** (저장소 루트)
2. **Variables** (필수):

| 변수 | 설명 |
|------|------|
| `MYSQL_URL` | MariaDB Reference |
| `SECRET_KEY` | JWT용 긴 임의 문자열 |
| `REGISTRATION_AUTH_CODE` | 플레이어 디바이스 등록 코드 (운영 값으로 변경) |

3. **Deploy**

빌드(`nixpacks.toml`): Python venv → `player` + `cms` 빌드 → `backend/player_dist/`, `backend/cms_dist/` 복사. CMS는 **`VITE_BASE_PATH=/admin/`** 으로 빌드되어 **`/admin/`** 에서 서빙됩니다.

**관리자(CMS) 화면 URL**은 별도 서비스가 아니라 **`https://<도메인>/admin/`** 입니다.  
같은 도메인에서 `/api` 로 API를 쓰므로 **`VITE_API_URL` 설정은 필요 없습니다.**

---

## 4. URL 정리

| 용도 | 주소 |
|------|------|
| **플레이어** | `https://<도메인>/` |
| **관리자(CMS)** | `https://<도메인>/admin/` |
| **API·Swagger** | `https://<도메인>/docs` |
| **헬스** | `https://<도메인>/health` |

---

## 5. 업로드 파일

`backend/uploads` 는 컨테이너 디스크입니다. 영구 보관이 필요하면 Railway **Volume** + `UPLOAD_DIR` 환경 변수.

---

## 6. (선택) CMS만 별도 서비스로 올리기

같은 도메인이 아니라 **CMS 서비스를 따로** 두려면 `cms/` 의 `railway.toml` + Root **`cms`** 로 배포할 수 있습니다.  
그때는 빌드 시 **`VITE_API_URL=https://<API주소>/api`** 를 넣어야 합니다.

---

## 문제 해결

- **헬스체크 실패**: Deploy 로그에서 `MYSQL_URL`, `/app/backend`, `/app/.venv`, `PORT` 확인.
- **`/admin` 404**: 빌드 로그에 `cms` 빌드·`cms_dist` 복사가 있는지 확인.
- **DB 연결 실패**: DB와 API가 같은 프로젝트인지, `MYSQL_URL` 이 **Private** 주소인지 확인 (Public URL로 API가 붙으면 테이블이 다른 곳에 생길 수 있음).
- **테이블이 비어 보임**: 브라우저에서 `https://<API>/api/db-status` 로 앱이 보는 DB 이름·테이블 목록 확인. DBeaver 등은 **같은 DB 이름**을 보고 있는지 비교.
- **테이블이 비어 있음 / 로그인 불가**: 브라우저에서 **`https://<API>/setup-database`** 또는 **`https://<API>/api/auth/ensure-seed`** (정확히 이 경로, `/admin` 붙이면 안 됨). CMS 로그인 화면도 자동으로 `ensure-seed` 를 호출합니다. `{"detail":"Not Found"}` 이면 URL 오타·재배포 미반영 여부를 확인하세요.
