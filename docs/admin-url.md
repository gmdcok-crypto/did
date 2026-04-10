# 관리자(CMS) URL 정리

## 로컬 개발 (Vite)

| 용도 | 주소 |
|------|------|
| CMS 루트 | `http://127.0.0.1:5173` 또는 `http://localhost:5173` |
| 로그인 | `http://127.0.0.1:5173/login` |

- CMS는 **포트 5173**에서 `npm run dev` 로 띄웁니다.
- 로그인 후 경로는 `/dashboard`, `/campaigns`, `/contents`, `/schedules`, `/devices` 등 **루트(`/`) 기준**입니다 (`/admin` 접두어 없음).

## 로컬에서 플레이어만 켠 경우 (5174)

| 용도 | 주소 |
|------|------|
| 플레이어 | `http://127.0.0.1:5174` |
| `/admin` 입력 시 | `http://127.0.0.1:5174/admin` → 개발 설정에 따라 **CMS(5173)로 리다이렉트**될 수 있음 |

- 디스플레이(플레이어)는 **5174**입니다. 관리자 화면과 포트가 다릅니다.

## 배포(백엔드가 `cms_dist`를 `/admin`에 서빙)

Dockerfile/Railway 등 **단일 도메인**에서 API + 플레이어(루트) + CMS를 같이 올릴 때:

| 용도 | 주소 |
|------|------|
| 관리자(CMS) | `https://<서버도메인>/admin` |
| 로그인(예시) | `https://<서버도메인>/admin/login` |

- CMS 빌드 시 `VITE_BASE_PATH=/admin/` 로 맞춥니다. (`docs/railway-deploy.md` 참고)
- 플레이어는 보통 같은 도메인의 **`/`** (루트)입니다.

### Railway (이 프로젝트 호스트 예시)

| 용도 | 주소 |
|------|------|
| 호스트 | `did-production-ac7b.up.railway.app` |
| 플레이어(루트) | `https://did-production-ac7b.up.railway.app/` |
| 관리자(CMS) | `https://did-production-ac7b.up.railway.app/admin` |
| 로그인 | `https://did-production-ac7b.up.railway.app/admin/login` |
| API | `https://did-production-ac7b.up.railway.app/api` |
| 헬스 | `https://did-production-ac7b.up.railway.app/health` |

- Railway에서 서비스 도메인이 바뀌면 이 표의 호스트만 교체하면 됩니다.

## PWA·바탕화면 바로가기

- **디스플레이용으로 설치한 PWA**(플레이어)는 `start_url`이 루트(`/`)라서, 아이콘을 누르면 **전광판(플레이어) 화면**이 열립니다. 관리자 화면이 아닙니다.
- 같은 도메인에서 관리하려면 브라우저 주소창에 **`/admin`** 으로 들어가거나, 플레이어 PWA에 넣어 둔 **바로가기(숏컷) “관리자(CMS)”**를 사용합니다.
- 관리만 할 PC에서는 **`/admin`** 으로 접속해 **CMS를 별도로 “앱 설치”** 하는 편이 헷갈리지 않습니다.

## API (참고)

- API 베이스: `http://localhost:8000/api` (로컬), 배포 시 `https://<도메인>/api`
- 기본 계정은 `README.md`의 init_db / 시드 설명 참고 (`admin@example.com` 등).
