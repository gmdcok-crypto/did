# Railway 배포 (MariaDB + 단일 API 서비스)

> **작업 맥락 (필수)**  
> 이 프로젝트의 **운영·배포·디버깅 기준 환경은 Railway 프로덕션**(단일 API 서비스, `Dockerfile` 빌드)이다. 문서·이슈·에이전트/대화에서 **기본 전제는 로컬이 아니다.** URL·재현·검증은 **`https://<서비스>.up.railway.app`**(또는 연결한 커스텀 도메인)과 Railway 변수·배포 로그를 기준으로 한다. 로컬 Vite 포트(예: 5173/5174)는 개발 편의일 뿐, **사용자·운영 질문의 답은 Railway 기준**으로 정리한다.

**Railway**는 저장소 루트 **`Dockerfile`** 로 빌드합니다(`railway.toml` → `builder = "DOCKERFILE"`). 예전 방식은 **`nixpacks.toml`** (Nixpacks)입니다. DB는 **MySQL/MariaDB 플러그인**의 `MYSQL_URL`(또는 `DATABASE_URL`)을 API 서비스 변수에 연결합니다.

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

1. **New → Database → MySQL 또는 MariaDB** (플러그인 `mysql://` URL 은 앱에서 `mysql+asyncmy://` 로 맞춤)
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

빌드(`Dockerfile`): Node로 `player`·`cms` 빌드 → `backend/player_dist/`, `backend/cms_dist/` 복사 후 Python 이미지에서 FastAPI 실행. CMS는 **`VITE_BASE_PATH=/admin/`** 으로 빌드되어 **`/admin/`** 에서 서빙됩니다.

**관리자(CMS) 화면 URL**은 별도 서비스가 아니라 **`https://<도메인>/admin/`** 입니다.  
같은 도메인에서 `/api` 로 API를 쓰므로 **`VITE_API_URL` 설정은 필요 없습니다.**

**`R2_PUBLIC_BASE_URL` 을 바꾼 뒤** 예전 `pub-….r2.dev` 가 DB에 남아 플레이어가 404를 내면, CMS에 로그인한 상태에서 관리자 토큰으로 다음을 한 번 호출해 URL만 맞출 수 있습니다:  
`POST https://<도메인>/api/contents/repoint-r2-public-urls` (본문 없음). 응답에 치환된 `id`·`old_url`·`new_url` 이 옵니다.

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

- **`/admin` 을 열었는데 플레이어(디스플레이) 화면이 나옴** (같은 Railway 도메인): 플레이어 PWA Service Worker가 예전에 캐시한 `index.html` 을 `/admin` 에도 쓰는 경우가 있습니다. **해결**: 해당 사이트에서 **개발자도구 → Application → Service Workers → Unregister**, **저장소(Storage) 삭제** 후 `https://<도메인>/admin/` 을 다시 열기. 배포 후에도 계속되면 **이 저장소의 최신 이미지**로 재배포(플레이어 빌드에 `navigateFallbackAllowlist` 가 포함됨). Docker 빌드는 `cms_dist/index.html` 이 없으면 실패하도록 막혀 있습니다.
- **헬스체크 실패**: Deploy 로그에서 `MYSQL_URL`, `/app/backend`, `/app/.venv`, `PORT` 확인.
- **`/admin` 404**: 빌드 로그에 `cms` 빌드·`cms_dist` 복사가 있는지 확인.
- **DB 연결 실패**: DB와 API가 같은 프로젝트인지, `MYSQL_URL` 이 **Private** 주소인지 확인 (Public URL로 API가 붙으면 테이블이 다른 곳에 생길 수 있음).
- **테이블이 비어 보임**: 브라우저에서 `https://<API>/api/db-status` 로 앱이 보는 DB 이름·테이블 목록 확인. DBeaver 등은 **같은 DB 이름**을 보고 있는지 비교.
- **`greenlet` / `libstdc++.so.6` 오류**: `nixpacks.toml`에 `nixLibs`·`aptPkgs(libstdc++6)`·`railway.toml`의 `LD_LIBRARY_PATH` 가 맞는지 확인 후 재배포.
- **테이블이 비어 있음 / 로그인 불가**: 브라우저에서 **`https://<API>/setup-database`** 또는 **`https://<API>/api/auth/ensure-seed`** (정확히 이 경로, `/admin` 붙이면 안 됨). CMS 로그인 화면도 자동으로 `ensure-seed` 를 호출합니다. `{"detail":"Not Found"}` 이면 URL 오타·재배포 미반영 여부를 확인하세요.
