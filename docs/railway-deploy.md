# Railway 배포 (Docker 없음)

저장소 루트에 `nixpacks.toml`, `railway.toml`이 있으면 **백엔드(FastAPI) + 플레이어(PWA 빌드 → `backend/player_dist`)** 를 한 서비스로 올릴 수 있습니다. DB는 **Railway MariaDB**를 권장합니다.

## 1. 준비

- GitHub에 코드 푸시
- [Railway](https://railway.app)에서 **New Project → Deploy from GitHub** 로 이 저장소 연결

## 2. MariaDB

1. 프로젝트에 **New → Database → MariaDB** (또는 MySQL) 추가
2. MariaDB 서비스 **Variables**에서 `MYSQL_URL`, `MYSQLHOST`, `MYSQLUSER` 등 확인
3. 백엔드 서비스에 **`DATABASE_URL`** 을 넣습니다.

형식:

```env
DATABASE_URL=mysql+aiomysql://USER:PASSWORD@HOST:PORT/DATABASE
```

Railway가 `mysql://...` 한 줄만 줄 경우 그대로 넣어도 됩니다. 앱이 **`mysql+aiomysql://`** 로 자동 보정합니다.

## 3. API + 플레이어 서비스

1. **New → GitHub Repo** (또는 기존 서비스)로 같은 저장소 연결
2. 서비스 **Settings → Root Directory** 를 **`/`** (저장소 루트)로 설정  
   - `nixpacks.toml`이 루트에 있어야 플레이어 빌드가 실행됩니다.
3. **Variables** (예시):

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | MariaDB 연결 문자열 (위 참고) |
| `SECRET_KEY` | JWT용 긴 임의 문자열 |
| `REGISTRATION_AUTH_CODE` | 플레이어 디바이스 등록용 코드 (운영 값으로 변경) |

선택:

| 변수 | 설명 |
|------|------|
| `CORS_ORIGINS_EXTRA` | CMS를 **별도 도메인**에 둘 때만 (쉼표로 origin 나열) |

4. **Deploy** 후 공개 URL에서 `/health` → `{"status":"ok"}`, 루트 `/` → 플레이어 UI, `/docs` → API 문서

빌드는 Nixpacks가 **`python3 -m venv /app/.venv`** 후 `/app/.venv/bin/pip install -r backend/requirements.txt`(PEP 668 회피) → `player`에서 `npm ci` / `npm run build` → 결과를 `backend/player_dist/` 로 복사합니다. 시작은 `railway.toml`의 **`/app/.venv/bin/uvicorn`** 입니다.

### 업로드 파일

`./uploads` 는 컨테이너 로컬 디스크입니다. 재시작 시 유실될 수 있으니, 영구 보관이 필요하면 Railway **Volume**을 마운트하고 `UPLOAD_DIR`을 그 경로로 맞추면 됩니다.

## 4. CMS (별도 서비스 권장)

CMS는 Vite SPA이므로 **정적 사이트**로 두는 것이 일반적입니다.

1. 같은 프로젝트에 **새 서비스** 추가 → 같은 GitHub 저장소
2. **Root Directory**: `cms`
3. **Build Command**: `npm ci && npm run build`
4. **Build** 전에 Variables에 **`VITE_API_URL`** 설정 (예: `https://<API서비스>.up.railway.app/api`)
5. Railway **Static** 템플릿이 있다면 출력 디렉터리 `dist` 지정, 또는 플랫폼 안내에 따라 정적 호스팅

CORS: API 서비스가 `*.up.railway.app` 을 정규식으로 허용하도록 되어 있어, CMS가 `https://xxxx.up.railway.app` 형태면 추가 설정 없이 동작하는 경우가 많습니다. 커스텀 도메인만 쓸 때는 `CORS_ORIGINS_EXTRA`에 CMS origin을 넣으세요.

## 5. 첫 로그인

백엔드 기동 시 사용자가 없으면 `admin@example.com` / `admin123` 이 생성됩니다. 운영에서는 즉시 비밀번호를 바꾸세요.

## 문제 해결

- **헬스체크 실패 / Service Unavailable**: `DATABASE_URL`이 틀리거나 MariaDB가 같은 프로젝트·Private Network에 없으면 기동 시 DB 연결이 실패할 수 있습니다. 최신 코드는 `init_db` 실패 시에도 프로세스는 뜨고 `/health`는 200입니다. 그래도 안 되면 **Deploy 로그**에서 `cd /app/backend`, `/app/.venv`, `PORT` 오류 확인.
- **빌드 실패 (Node/Python)**: Railway 로그에서 `nixpacks` 단계 확인. 루트가 `/` 인지 확인.
- **DB 연결 실패**: `DATABASE_URL` 호스트/포트가 **Private Network** 기준인지, 백엔드와 MariaDB가 같은 프로젝트인지 확인.
- **플레이어 404**: `player_dist`에 빌드가 복사되지 않은 경우 → 빌드 로그에 `npm run build`, `cp ... player_dist` 가 있는지 확인.
