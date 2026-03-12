# PWA 디지털 광고 솔루션 - 시스템 흐름도 (Mermaid)

## 전체 시스템 아키텍처

```mermaid
flowchart TB
    subgraph Admin["관리자 / 마케터"]
        A[웹 브라우저]
    end

    subgraph CMS["CMS 백오피스"]
        B[사용자/권한]
        C[미디어 라이브러리]
        D[캠페인/스케줄]
        E[디바이스 관리]
        F[분석/리포트]
        G[API Gateway]
    end

    subgraph Storage["스토리지"]
        H[(DB)]
        I[CDN/파일]
    end

    subgraph PWA["PWA 플레이어"]
        J[Service Worker]
        K[스케줄 동기화]
        L[미디어 재생]
        M[이벤트 수집]
    end

    subgraph Device["디스플레이"]
        N[TV/키오스크/태블릿]
    end

    A --> B & C & D & E & F
    B & C & D & E & F --> G
    G --> H & I
    G <--> K
    K --> J
    J --> L
    L --> N
    L --> M
    M --> G
```

## 데이터 흐름 시퀀스

```mermaid
sequenceDiagram
    participant Admin as 관리자
    participant CMS as CMS
    participant DB as DB/스토리지
    participant Player as PWA 플레이어
    participant Display as 디스플레이

    Admin->>CMS: 로그인
    Admin->>CMS: 미디어 업로드
    CMS->>DB: 저장 + CDN URL
    Admin->>CMS: 캠페인 생성
    CMS->>DB: 캠페인/스케줄 저장

    Player->>CMS: 디바이스 등록
    CMS->>DB: 디바이스 매핑
    CMS-->>Player: device_id, 토큰

    loop 주기적 동기화
        Player->>CMS: 스케줄 요청
        CMS->>DB: 조회
        CMS-->>Player: 스케줄 JSON + 미디어 URL
        Player->>Player: 캐시 저장
        Player->>Display: 미디어 재생
        Player->>CMS: 이벤트 전송(노출/클릭)
        CMS->>DB: 이벤트 저장
    end

    Admin->>CMS: 대시보드/리포트 조회
    CMS->>DB: 집계 조회
    CMS-->>Admin: 차트/테이블
```

## PWA 플레이어 내부 흐름

```mermaid
flowchart TD
    Start([앱 로드]) --> SW[Service Worker 등록]
    SW --> Auth[API: 디바이스 인증]
    Auth -->|성공| Schedule[스케줄 API 요청]
    Auth -->|실패/오프라인| CachePlay[캐시된 스케줄 재생]
    Schedule --> Parse[스케줄 JSON 파싱]
    Parse --> Media[미디어 URL 목록]
    Media --> Check{캐시 존재?}
    Check -->|예| Local[로컬 재생]
    Check -->|아니오| Download[다운로드 후 재생]
    Local --> Play[재생 Video/Image]
    Download --> Play
    Play --> Event[이벤트 수집]
    Event --> Send[백그라운드 전송]
    CachePlay --> Play
```

## 캠페인 → 디바이스 배포 흐름

```mermaid
flowchart LR
    subgraph CMS
        C1[캠페인 생성] --> C2[콘텐츠 배치]
        C2 --> C3[스케줄 설정]
        C3 --> C4[디바이스 그룹 지정]
    end

    subgraph API
        C4 --> A1[스케줄 API]
    end

    subgraph Devices["디바이스 그룹"]
        A1 --> D1[플레이어 1]
        A1 --> D2[플레이어 2]
        A1 --> D3[플레이어 N]
    end

    D1 & D2 & D3 --> Play[재생]
```

## 오프라인 동작 흐름

```mermaid
flowchart TD
    Request[스케줄/미디어 요청] --> Online{네트워크?}
    Online -->|온라인| Fetch[API/CDN 요청]
    Online -->|오프라인| Cache{캐시 존재?}
    Fetch --> Update[캐시 업데이트]
    Update --> Play[재생]
    Cache -->|예| Play
    Cache -->|아니오| Fallback[기본 콘텐츠/대기 화면]
    Fallback --> Queue[이벤트 큐에 저장]
    Play --> Event[이벤트 수집]
    Event --> Queue
    Queue -->|복구 시| Sync[서버로 전송]
```

---

위 다이어그램은 Mermaid를 지원하는 뷰어(GitHub, GitLab, Notion, VS Code 확장 등)에서 렌더링됩니다.
