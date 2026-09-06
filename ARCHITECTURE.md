# 아키텍처 개요

- `apps/web/`: Vite·React 브라우저 애플리케이션. 브라우저에서 실행되는 코드는 이 트리 안에 둡니다.
- `apps/api/`: NestJS 백엔드. HTTP, WebSocket, DB, 영속성, 외부 서비스 연동은 서버 전용으로 유지합니다.
- `packages/`: 웹과 API가 함께 사용하는 계약·순수 모델·Studio 엔진입니다.
- `scripts/`, `tools/`, `e2e/`, `tests/`: 저장소 도구와 검증 코드입니다.
- `api/`: Vercel이 요구하는 얇은 어댑터만 두며 실제 구현은 `apps/api/`에 둡니다.

루트에는 모노레포 설정, CI·배포 설정, 문서만 둡니다. `@/*` 별칭은 `apps/web/*`을 가리키며, 백엔드는 웹 앱을 import하지 않습니다. 생성된 QA 결과는 CI 아티팩트에만 보관하고 `qa-results/` 아래는 ignore합니다.

## 프런트엔드/백엔드 소스 경계

```text
apps/web/                         # 브라우저 애플리케이션
  src/app/                        # 부트스트랩, 라우팅, 서비스 워커, 셸
  src/domains/                    # 도메인별 UI·애플리케이션·모델·어댑터
    creator/                      # Studio와 창작 도구
      studio/components/          # Studio 프레젠테이션 컴포넌트
    catalog/                      # 카탈로그·검색·랭킹
    community/                    # 커뮤니티·리뷰
    auth/                         # 인증 UI와 세션 오케스트레이션
  src/shared/                     # 진짜 횡단 코드만
    components/                   # 범용 UI, 도메인으로 옮기는 중인 공용 제품 UI
    lib/                          # 공용 계약·유틸·브라우저 안전 런타임
    catalog/                     # 정적 카탈로그 런타임
  public/                         # 브라우저 배포 자산
  src/components/                 앱 셸·오류·브라우저 호환 컴포넌트
  src/hooks/                       웹 공용 훅
  src/infrastructure/              API·클라우드 저장소 클라이언트
  src/styles/, src/types/          전역 스타일·공용 타입
apps/api/                         # 서버 전용 Nest 애플리케이션
  src/modules/                    # 기능 모듈과 HTTP 경계
  src/infrastructure/             # DB·외부 서비스 어댑터
  src/db/                         # 스키마·마이그레이션·시드
  src/server/                     # 서버 전용 유스케이스와 정책
packages/                         # 웹/API 공용, 런타임 중립 계약·엔진
api/                              # Vercel 진입점용 얇은 어댑터
```

프런트엔드 도메인 코드는 `apps/web/src/domains/<domain>`에, 백엔드 기능 코드는 `apps/api/src/modules/<domain>`에 둡니다. 프런트엔드와 백엔드가 함께 써야 하는 코드는 브라우저·Node API에 의존하지 않는 계약으로 만들고 `packages/*`에 공개 export합니다. 따라서 웹 트리의 `server` 폴더가 백엔드 구현을 숨겨 갖지 않으며, 백엔드가 웹 파일을 상대 경로로 참조하지도 않습니다.

현재 실제 소스 경계는 `apps/web/src` 아래에 있으며, 공용 컴포넌트·훅·인프라가 각각 `src/components`, `src/hooks`, `src/infrastructure`에 있습니다. 새 도메인 코드는 `src/domains`에, 도메인 간 계약과 브라우저 안전 유틸리티는 `src/shared`에 둡니다. 새 import에는 `@/shared/...`를 사용하고, 인증 UI는 `src/domains/auth/components`, Studio 전용 UI는 `src/domains/creator/studio/components`에 두어 공용 영역이 비대해지지 않게 합니다.

## 도메인과 계층

각 도메인에 실제 책임이 있을 때만 계층을 만듭니다. 작은 도메인은 페이지와 순수 모델을 나란히 둘 수 있으며, 빈 `ui/application/domain/infrastructure` 폴더를 형식적으로 만들지 않습니다.

| 도메인 | 프레젠테이션/UI | 애플리케이션 | 도메인/모델 | 인프라 |
| --- | --- | --- | --- | --- |
| `creator` (Studio) | `creator/studio/components`, 편집 패널·라우트 | 에디터 런타임·컨트롤러·유스케이스 훅 | 브러시·캔버스·문서·타임라인·장면 계약 | 실시간 전송·자산 어댑터·워커·저장소 클라이언트 |
| `catalog` | 카탈로그 페이지·전용 컴포넌트 | 검색·랭킹·추천·페이지 오케스트레이션 | 제목·분류·가격·필터 규칙 | 카탈로그/검색 클라이언트와 정적 로더 |
| `community` | 커뮤니티 페이지·토론 컴포넌트 | 게시물·리뷰 워크플로 | 게시물·리뷰·스레드 규칙 | 커뮤니티 API 클라이언트 |
| `auth` | `domains/auth/components` | 세션·로그인 오케스트레이션 | 사용자·세션 계약 | 브라우저 저장소·인증 API 어댑터 |
| `admin`, `account`, `legal`, `creator-resources` | 페이지·기능 전용 컴포넌트 | 기능 훅·서비스 | 기능 모델·검증 | 기능 API 클라이언트 |

의존성은 `UI → 애플리케이션 → 도메인/모델 → 인프라` 방향으로만 내려갑니다. 프레젠테이션은 공용 primitive를 사용할 수 있지만, 애플리케이션·모델 코드는 다른 도메인의 인프라를 직접 참조하지 않습니다. 아직 경계를 넘는 레거시 모듈은 호환 래퍼로 명시하고, 소비자와 함께 옮길 때까지 새로운 범용 폴더를 만들지 않습니다.

`src/shared`에는 범용 UI primitive, 호환 shim, 도메인 간 유틸리티, 재사용 계약만 남깁니다. 정적 카탈로그는 `src/shared/catalog`에서 eager installer와 lazy engine을 함께 관리합니다.
