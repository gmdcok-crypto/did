# Git 포인트 (복원 시점용)

문제 발생 시 **아래 커밋으로 되돌릴 기준점**으로 사용합니다.  
배포·머지 후에는 이 표를 최신 `main` HEAD에 맞춰 갱신하세요.

## 원격 `main` 최신과 동일하게 맞추기 (일반)

서버/다른 PC와 같은 **최신 `main`**만 맞추면 될 때:

```bash
git fetch origin
git checkout main
git reset --hard origin/main
```

## 복원 기준 커밋 (문서에 기록한 스냅샷)

| 항목 | 값 |
|------|-----|
| 브랜치 | `main` |
| 짧은 해시 | `83fa436` |
| 전체 해시 | `83fa43664965066361c7b43ba0e73f20ad3a5789` |
| 커밋 시각 | 2026-04-11 23:29:15 +0900 |
| 제목 | docs: git-point 복원 기준을 최신 main(7ff0723)으로 갱신 |

**참고:** 플레이어 코드만 기준으로 할 때는 `8ca1e6b` (`chore(player): remove unused currentContentRef…`) 등 아래 표를 보면 됩니다.

## 이 커밋으로 복원하는 방법

**작업 트리를 버리고 해당 시점과 동일하게 맞추기 (주의: 로컬 변경 사항 삭제):**

```bash
git fetch origin
git checkout main
git reset --hard 83fa43664965066361c7b43ba0e73f20ad3a5789
```

**원격 `main`도 같은 커밋으로 맞춰야 할 때 (강제 푸시 — 팀과 합의 후):**

```bash
git push origin main --force-with-lease
```

**새 브랜치만 만들어서 그 시점에서 작업하기:**

```bash
git fetch origin
git checkout -b restore/2026-04-11 83fa436
```

## 최근 마일스톤 (요약)

| 커밋 | 요약 |
|------|------|
| `8ca1e6b` | 플레이어: 사용되지 않던 `currentContentRef` 체인 제거 |
| `73c5a11` | 플레이어: 모바일 오프라인 — `GET offline-beacon` + 화면 hidden 지속 시 비콘 |
| `d72f44e` | CMS 실시간: SSE 재연결, `cms_dashboard_updated` 브로드캐스트, stale 기기 주기 오프라인 |
| `737de47` | 플레이어: Zone/MediaBlock props 안전 처리 (React #310 방지) |
| `5af50ad` | 플레이어: 등록 직후 `fetchScheduleReliable`, 훅 순서 수정 (React #310) |
| `e6c04e4` | 플레이어: R2 등 외부 URL에 `crossOrigin` 미설정 (CORS로 미디어 차단 방지) |

## 이 파일 갱신 방법

```bash
git checkout main
git pull
git log -1 --format="%H%n%h%n%ci%n%s"
```

출력된 전체 해시·짧은 해시·시각·제목을 위 표에 반영합니다.

**이 문서만 수정해 커밋하면** 새 커밋이 생기므로, 복원 기준을 그 커밋으로 옮기려면 위 명령을 한 번 더 실행해 표를 맞춥니다.
