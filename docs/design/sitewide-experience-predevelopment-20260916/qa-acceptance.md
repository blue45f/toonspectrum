# QA·접근성·출시 승인 기준

## 0. 2026-09-17 main 재검토 추가 게이트

최신 게이트는 108개 directory 결과만 검사하지 않는다. 다음 집합을 분리해 검증한다.

- directory canonical destination 108개
- `/sitemap`, `/production`, `/studio/new`, `/studio/assets`를 포함한 static review set 112개
- `/production` route group의 정적·동적 pattern 14개
- legacy alias direct-entry matrix

추가 필수 조건:

1. `main` landmark 정확히 하나
2. visible page identity 또는 explicit editor ready/degraded/blocked state
3. hidden fallback H1만으로 route success 판정 금지
4. primary navigation 목적지와 directory·metadata·title parity
5. route type별 loading budget
6. local dev, production build, deployed host 결과를 분리 기록

상세 근거는 [`main-revalidation-20260917.md`](./main-revalidation-20260917.md)를 따른다.

## 1. 검증 피라미드

| 계층 | 목적 | 도구 예시 |
| --- | --- | --- |
| 정적 계약 | route·metadata·타입·중복 방지 | TypeScript, Vitest, architecture validator |
| 컴포넌트 | 상태·키보드·접근 가능한 이름 | Testing Library, axe |
| 도메인 통합 | 인증·프로젝트·저장·오류 전환 | Vitest, MSW |
| 브라우저 | 실제 route·viewport·navigation | Playwright |
| 시각 회귀 | 셸·상태·반응형 변경 | screenshot diff |
| 수동 탐색 | 펜·터치·GPU·보조기술 | 실제 기기·브라우저 |

## 2. Route Registry 테스트

- route id, path, canonical path 중복 없음
- alias cycle과 canonical collision 없음
- 공개 사이트맵 항목은 실제 route와 일치
- dynamic detail·admin·auth callback·internal companion 제외
- `access=project`와 `projectContext=required` 일치
- Creator immersive route에 모바일 모드 존재
- label·description·title 번역 키와 한국어 source fallback 존재
- Primary action 정확히 하나
- route group의 정식 경로가 Registry에 누락되지 않음
- Registry 항목이 실제 route 없이 고아로 남지 않음
## 3. static·dynamic route smoke 계약

각 정식 목적지와 대표 dynamic family를 데스크톱 `1440×1000`, 모바일 `390×844`에서 검사한다.

### 공통 통과 조건

- 예상 URL 또는 승인된 canonical로 도착
- HTTP 2xx
- `main` 정확히 하나
- 실제 visible H1 하나 또는 명시적 editor surface identity; loading fallback H1은 ready 판정에 사용하지 않음
- 32자 이상의 의미 있는 본문 또는 명시적 loading·empty·error 상태
- 빈 흰색·회색·검정 화면이 아님
- 처리되지 않은 page error 없음
- 주요 리소스 실패가 있으면 사용자 복구 UI 존재
- 가로 넘침 0, 의도적 캔버스·타임라인은 자체 스크롤 영역으로 한정
- 깨진 이미지·빈 필수 대체 텍스트 없음

### 리디렉션 계약

- alias는 한 번만 canonical로 이동
- query·hash 중 보존해야 하는 상태 유지
- canonical 목적지 readiness까지 기다려 테스트
- history back이 redirect loop를 만들지 않음
- 사이트맵·내부 링크는 alias를 직접 생성하지 않음

## 4. 의미 구조와 접근성

### 자동 검사

- 중복 H1, 이름 없는 핵심 버튼·링크, label 없는 폼 필드
- landmark 중복·누락
- 잘못된 ARIA role·state
- 명백한 색상 대비 위반
- 포커스 가능한 숨은 요소
- modal 열린 상태에서 배경 포커스 가능 여부
- 모바일 핵심 터치 타깃 크기
### 수동 키보드 검사

1. skip link로 main 진입
2. 헤더·로컬 nav·본문 순서 확인
3. filter sheet 열기·닫기·포커스 복원
4. 카드 내부 행동을 중첩 링크 없이 조작
5. CreatorShell 패널·캔버스·상태바 이동
6. drag·resize의 키보드 대체 수단 확인
7. Escape 동작과 예상치 않은 작업 취소 방지
8. 저장·동기화·오류 live announcement 확인

### 화면 확대·반응형

- 320 CSS px
- 390×844
- 768×1024
- 1180×800
- 1440×1000
- 200% 브라우저 확대
- OS 글자 크기 확대

핵심 과업이 잘리지 않아야 하며 필터·모달·고정 바가 가상 키보드와 safe area를 고려해야 한다.

## 5. 공통 상태 테스트 매트릭스

| 상태 | 검증 |
| --- | --- |
| loading | 구조 안정, 설명, 8초 복구, 취소 가능성 |
| stale success | 이전 데이터 유지, 갱신 중 표시 |
| empty first-use | 가치 설명, 시작·샘플 행동 |
| empty filtered | 조건 요약, 필터 초기화 |
| signed-out | 공개 미리보기, 로그인 후 복귀 |
| project missing | 최근·검색·새로 만들기·샘플 |
| offline | 캐시 범위, 마지막 저장, 재연결 |
| retryable error | 원인·보존 데이터·재시도 |
| blocked capability | 요구 조건·안전 모드·대체 경로 |
| conflict | 버전 비교·복제·병합, 강제 덮어쓰기 금지 |
## 6. 인증·권한·프로젝트

- 로그인 시작 전 현재 URL과 허용된 초안 키 저장
- 로그인 성공·취소·실패 후 안전한 복귀
- 다른 계정으로 전환 시 이전 계정 문서 런타임 분리
- 권한 없는 프로젝트의 제목·썸네일·내용 누출 없음
- 초대 만료·취소·역할 변경 표시
- 프로젝트 삭제·보관·오프라인 미보유 상태 구분
- UI access gate를 우회한 직접 요청도 서버에서 거부

## 7. 저장·동기화·복구

### 필수 시나리오

- 신규 로컬 초안 생성→자동 저장→재시작→복구
- 같은 탭 reload 후 재개
- 동일 문서를 두 탭에서 열었을 때 leader/follower 정책
- offline 편집→online 복귀→동기화
- 서버 버전과 로컬 버전 충돌
- 저장소 quota 부족
- 문서 전환 중 느린 저장 완료
- surface 이동 중 동일 document runtime 유지
- 복구 전 자동 체크포인트 생성

UI 테스트뿐 아니라 실제 storage adapter와 runtime contract 테스트를 포함한다.

## 8. Studio·3D·AI

### 능력 조합

- WebGL2 가능/불가
- WebGPU 가능/불가
- cross-origin isolation 가능/불가
- 낮은 메모리·느린 GPU
- local engine 연결/인증 실패
- 외부 API offline·rate limit·quota
- 모델 없음·형식 불일치

### 통과 조건

- 실패한 surface만 대체되고 문서·undo·collaboration 유지
- 안전 모드 진입 가능
- 실행 전 예상 시간·비용·전송 범위 표시
- 작업 ID로 route 이탈 후 재조회
- 취소·재시도·로그 복사
- 결과 적용 전 원본 비교와 버전 생성
## 9. 고밀도 페이지 특별 게이트

### `/tags`

- 초기 DOM interactive 요소 수가 전체 태그 수에 선형 비례하지 않음
- 첫 화면 태그 수 제한과 점진 로드
- 모바일 태그 버튼 높이 44px 또는 충분한 간격
- 검색·카테고리 이동 후 스크린리더 결과 안내

### `/ranking`

- 모든 작품 상세·저장·공유 링크에 이름 존재
- 200개 이미지 동시 eager load 금지
- 모바일 목록 길이와 메모리 사용 예산
- 필터 변경 시 현재 조건·기간·축 안내
- 데이터 신뢰도·갱신 시점 표시

### `/search`, `/explore`, `/recommend`, `/market/fit`

- 모바일 필터 sheet에서 적용·취소·초기화 구분
- 뒤로가기로 이전 필터와 스크롤 복원
- 결과 없음과 API 실패를 다른 화면으로 표시
- 칩 개수가 증가해도 첫 화면을 밀어내지 않음

## 10. 시각 회귀

### 필수 스냅샷

- 세 셸의 desktop·mobile 기본 상태
- PageHeader hero·standard·compact
- loading, empty, error, offline, access gate, project picker
- filter sheet 열림·닫힘
- CreatorShell save status 전 상태
- Studio capability ready·degraded·blocked
- DocsShell 긴 목차와 정책 변경 이력

### 규칙

- 애니메이션·시간·랜덤 데이터 고정
- 네트워크 mock과 실제 운영 smoke 분리
- 스냅샷 갱신 PR은 변경 이유와 대표 before/after 포함
- 구조적 오류를 이미지 승인으로 덮지 않음
## 11. 성능·안정성

- 프로덕션 번들에서 셸별 초기 JS 예산 검사
- Studio 엔진이 공개·문서 route 초기 번들에 포함되지 않음
- 이미지 크기·형식·lazy load 검증
- 긴 목록 가상화 후 키보드와 스크린리더 탐색 검증
- route 전환 중 layout shift와 focus loss 측정
- slow 4G, CPU 4× slowdown에서 LCP·INP·첫 행동 준비 시간 측정
- memory snapshot으로 태그·랭킹·3D surface 이탈 후 누수 확인
- service worker 이전 버전·새 버전 전환 검증

## 12. P0 라우트 특별 승인

| 라우트 | 출시 전 필수 증거 |
| --- | --- |
| `/market/browse` | API 실패·빈 카탈로그·캐시 성공 스크린샷과 테스트 |
| `/studio/publish` | alias 진입·직접 진입·프로젝트 없음·오류 상태 |
| `/studio/bg3d` | 정상·degraded·blocked GPU 상태, 문서 보존 |
| `/studio/3d/dcc/sculpt` | lazy·WebGL·resource 실패 격리, 안전 모드 |
| `/reviews` | 모바일 정상 초기 렌더와 API 실패 |
| `/studio/poser` | 장기 로딩 타임아웃·대체 모델·재시도 |
| `/studio/assets/audio` | redirect와 skeleton 종료·빈 라이브러리 |

## 13. 출시 게이트

### Blocker

- 빈 화면 또는 복구 불가능한 route
- 저장·복구 데이터 손실
- 인증·권한 우회 또는 민감 정보 노출
- route loop·전역 앱 크래시
- 핵심 과업의 키보드 완료 불가
- 모바일 핵심 화면 가로 넘침

### Must-fix

- H1 누락·중복
- 이름 없는 핵심 인터랙션
- 잘못된 canonical·사이트맵 링크
- 오류와 빈 상태 혼동
- route를 떠난 뒤 장기 작업 추적 불가
### 승인 기록

각 rollout 묶음은 다음을 남긴다.

- 기준 main SHA
- 기능 플래그와 대상 route
- 자동 테스트 결과
- desktop·mobile 대표 스크린샷
- 접근성 수동 점검자와 범위
- 성능 수치와 비교 기준
- 알려진 제한과 사용자 표시 방식
- 롤백 명령·소유자
- 운영 배포 승인 여부

## 14. 출시 후 관찰

개인정보를 침해하지 않는 범위에서 다음을 route id·상태 단위로 관찰한다.

- 첫 주 행동까지 걸린 시간
- 빈 상태에서 시작 행동 전환율
- 오류 발생률과 재시도 성공률
- 로그인 후 원래 과업 복귀율
- 프로젝트 선택 후 화면 도달률
- 모바일 review에서 데스크톱 이어하기 사용
- route stalled recovery 노출·해결률
- 저장·동기화 충돌과 복구 성공률

수치 변화만으로 원인을 단정하지 않는다. 정성 피드백, 오류 로그, 실제 과업 테스트와 함께 해석한다.

## 15. 최종 전체 회귀

- directory 108개와 static review set 112개 desktop·mobile 순회
- canonical alias 별도 순회
- 한국어·영어 내비게이션
- 비로그인·로그인·프로젝트 있음·없음
- offline·slow network·API failure
- reduced motion·high contrast·keyboard only
- Chrome·Safari·Firefox 최신 지원 범위
- macOS·Windows·iOS·Android 대표 환경

전체 회귀 결과가 남지 않은 상태에서는 사이트 전면 전환 플래그를 기본값으로 올리지 않는다.