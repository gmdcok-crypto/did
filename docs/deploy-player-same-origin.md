# 플레이어 외부 접속 (노트북 + Docker 기준)

- **조건**: Docker 백엔드 = 노트북 localhost, 플레이어는 외부(다른 PC/폰)에서 접속, CMS는 노트북에서만 사용, 노트북 이동 시 IP 변경 가능.
- **방식**: 플레이어를 백엔드와 **같은 주소(origin)**에서 서빙하면, 외부에서 `http://노트북IP:8000` 하나만 알면 되고 **IP가 바뀌어도 설정 변경 없음**.

## 1. 플레이어 빌드 → 백엔드에 넣기

```powershell
# 플레이어 빌드 (API 주소는 설정 안 함 → 같은 origin /api 사용)
cd d:\did\player
npm run build

# 빌드 결과를 백엔드 player_dist 로 복사
xcopy /E /I /Y dist\* d:\did\backend\player_dist\
```

(또는 `player/dist/` 안 내용을 `backend/player_dist/`에 수동으로 복사.)

## 2. Docker 백엔드 실행

```powershell
cd d:\did\backend
docker compose up -d
```

- `player_dist`에 `index.html`과 `assets/` 폴더가 있으면 백엔드가 **루트(/)에서 플레이어**를 서빙합니다.
- 없으면 기존처럼 루트는 API 정보 JSON만 반환합니다.

## 3. 접속 방법

| 대상 | 주소 |
|------|------|
| **노트북에서 CMS** | `http://localhost:5173` (CMS만 `npm run dev:http` 로 실행) |
| **노트북에서 API/플레이어** | `http://localhost:8000` (플레이어), `http://localhost:8000/docs` (API 문서) |
| **외부(다른 PC/폰)에서 플레이어** | `http://노트북IP:8000` (예: `http://192.168.0.37:8000`) |

- 노트북 IP는 `ipconfig`로 확인. **같은 Wi‑Fi**에 있어야 접속 가능.
- 방화벽에서 **8000 포트** 인바운드 허용 필요할 수 있음.

## 4. 노트북 이동 시

- 다른 장소로 가면 노트북 IP가 바뀜.
- **플레이어는 다시 빌드/복사할 필요 없음.** 외부에서는 그냥 **현재 노트북 IP:8000**으로 접속하면 됨.
- CMS는 노트북에서만 쓰므로 계속 `http://localhost:5173` 그대로 사용.

## 5. 요약

- **CMS**: 노트북에서만 → `cd cms` 후 `npm run dev:http` → `http://localhost:5173`
- **플레이어**: 백엔드와 같은 주소로 서빙 → 외부는 `http://노트북IP:8000` 만 알면 됨, IP 바뀌어도 설정 변경 없음.

## 6. 이미지/미디어가 안 나올 때 (그때도 이렇게 풀었던 것)

- **원인**: 플레이어가 다른 포트(예: 5174)에서 떠 있으면, 스케줄 API가 주는 URL이 `/uploads/xxx` 같은 상대 경로라서 브라우저가 현재 origin(5174)으로 요청 → 404.
- **풀었던 방법**  
  1) **배포 시**: 플레이어를 백엔드와 같은 origin에서 서빙 (`player_dist` 복사 후 `http://노트북IP:8000` 접속). 페이지·API·업로드 모두 8000이라 `/uploads/...` 가 그대로 동작.  
  2) **개발 시**: 상대 경로 `/uploads/...` 를 백엔드 주소로 붙여서 요청. 플레이어에서 `getMediaBaseUrl()` + `item.url` 로 `https://localhost:8000/uploads/...` 로 만들면 재생됨.
- 정리: 그때도 같은 문제 있어서, 배포는 같은 origin 서빙으로, 개발은 미디어 URL을 백엔드 기준으로 붙이는 것으로 풀었음.

## 7. 서버 꺼져도 컨텐츠 재생 (캐시 플레이)

- 스케줄·미디어는 한 번 불러온 뒤 서버가 꺼져도 캐시에서 재생 가능.
- **빌드본**으로 서빙할 때 Service Worker가 스케줄·업로드·미디어를 캐시함. 개발 모드(npm run dev)에서는 SW 동작이 제한적일 수 있음.
- 스케줄은 sessionStorage·localStorage에도 저장되며, 오프라인 시 캐시·로컬 순으로 사용.
