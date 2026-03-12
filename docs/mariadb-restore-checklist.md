# MariaDB 전환 후 “다 이전으로 돌아간 것 같을 때”

## 왜 그렇게 느껴지나

- **점심때 세팅**은 예전 DB(예: SQLite `app.db` 또는 예전 MariaDB `did`)에 있던 **데이터**입니다.
- **MariaDB 작업** 중에 아래 중 하나가 있으면, **지금 쓰는 DB는 비어 있는 상태**가 됩니다.
  - 새로 `did` 스키마(데이터베이스)를 만들었을 때
  - `CREATE DATABASE did` 후 테이블을 앱으로만 만들었을 때 (`create_all`은 **테이블만** 만들고, 예전 DB의 **데이터는 복사되지 않음**)
  - 다른 PC/백업에서 코드만 가져오고 DB는 새로 쓸 때

즉, **코드는 그대로인데 연결만 새/빈 DB로 바뀐 상태**라서 “다 되돌아갔다”처럼 보이는 겁니다.

## 지금 쓰는 DB가 맞는지 확인

1. **백엔드 `.env`**  
   - `DATABASE_URL=mysql+aiomysql://did:did100!@localhost:3306/did`  
   - 이 주소의 **MariaDB `did` 스키마**가 지금 앱이 연결한 DB입니다.  
   - 여기가 새로 만든 빈 DB면, 그 안에는 점심때 세팅한 데이터가 없습니다.

2. **MariaDB에서 직접 확인**  
   - HeidiSQL 등으로 `localhost` → 스키마 `did` 접속  
   - `users`, `devices`, `device_groups`, `campaigns`, `schedules`, `contents` 등 테이블에 데이터가 있는지 확인  
   - 비어 있으면 “이전으로 돌아간 것”이 아니라 **지금 연결한 DB가 처음부터 비어 있는 상태**입니다.

## 빈 MariaDB에서 다시 세팅하는 순서 (복구 체크리스트)

아래는 **지금 연결된 MariaDB `did`가 비어 있을 때** 최소한으로 다시 맞추는 순서입니다.

1. **테이블 + 관리자 + 기본 그룹**
   ```bash
   cd backend
   venv\Scripts\activate
   python -m app.init_db
   ```
   - 테이블 생성, 관리자 `admin@example.com` / `admin123`, 디바이스 그룹 "기본" 생성

2. **(선택) 기본 스케줄까지 한 번에**
   ```bash
   python -m app.seed_schedule
   ```
   - "기본" 그룹에 빈 캠페인 + 빈 스케줄 1개 생성 (이미 스케줄 있으면 스킵)

3. **CMS에서**
   - https://localhost:5173 (또는 사용 중인 주소) 접속
   - 로그인: `admin@example.com` / `admin123`
   - **미디어**에서 이미지/동영상 추가
   - **캠페인**에서 캠페인 추가 (필요 시 콘텐츠 연결)
   - **스케줄**에서 캠페인·디바이스 그룹 "기본" 선택 후 스케줄 저장 (레이아웃에 쓸 이미지 선택)
   - **디바이스**는 플레이어에서 인증코드로 등록하면 자동으로 나타남

4. **플레이어**
   - 인증코드 `dev1234`(또는 `.env`의 `REGISTRATION_AUTH_CODE`)로 등록
   - 같은 그룹이면 위에서 만든 스케줄로 재생

## 예전 데이터를 MariaDB로 가져오고 싶을 때

- **예전에 SQLite `app.db`**를 쓰고 있었다면:  
  그 `app.db` 파일이 아직 같은 PC에 있다면,  
  - 잠시 `.env`를 `DATABASE_URL=sqlite+aiosqlite:///./app.db`로 바꿔서 백엔드 실행 → 예전 데이터 확인 가능  
  - MariaDB로 옮기려면 **데이터 이관 스크립트**를 따로 만들거나, 수동으로 CMS에서 다시 세팅하는 수밖에 없습니다. (지금 프로젝트에는 SQLite→MariaDB 자동 이관 스크립트는 없습니다.)
- **예전 MariaDB `did`**가 다른 DB/다른 서버에 있다면:  
  그 서버에서 덤프 후 지금 쓰는 MariaDB에 import하면, 예전 데이터를 지금 환경으로 가져올 수 있습니다.

## 요약

- “다 이전으로 돌아갔다” = **연결한 DB가 새로 만든(비어 있는) MariaDB**라서 그렇게 보이는 경우가 많습니다.
- **지금 쓰는 DB**는 `.env`의 `DATABASE_URL`이 가리키는 `did` 하나뿐이므로, 그 안을 채우면 됩니다.
- 위 **복구 체크리스트**대로 `init_db` → (선택) `seed_schedule` → CMS에서 미디어/캠페인/스케줄 다시 세팅하면, 점심때 하던 것과 동일한 상태로 다시 맞출 수 있습니다.
