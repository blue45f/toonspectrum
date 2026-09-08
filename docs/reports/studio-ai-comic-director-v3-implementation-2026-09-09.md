# Studio AI 코믹 디렉터 v3 구현 보고서

- 작성일: 2026-09-09
- 기준 브랜치: `main`
- 기준 커밋: `21e30667d8721a117745c023340c97d387d3c18b`
- 대상: 기존 AI 코믹 컴포저/시나리오 자동 생성 제작 루프의 제품화 고도화

## 목표

기존 회차 프로덕션 디렉터와 시나리오 이미지 생성기의 실제 동작 경계를 유지하면서, 사용자가 다음 흐름을 한 작업공간에서 완주하도록 구성한다.

`이야기·작품 기준 → 컷 연출 → 선택 후보 제작·검토 → 독자 미리보기·Studio 적용`

이 작업은 새 이미지 엔진을 만드는 변경이 아니다. 기존의 회차 계획 handoff, 선택 컷 1·2·4안 생성, 비파괴 후보 이력, 입력 fingerprint, 참조 팩, 취소·부분 실패 보존, 네이티브 말풍선 및 문서 적용 경로를 재사용한다.

## 구현한 범위

### 1. 4단계 AI 코믹 디렉터 작업공간

기존 `StudioScenarioAutoLayoutPanel`의 공개 prop 계약과 lazy-loading 진입점은 유지하고, 실제 화면 구현을 `StudioAiComicDirectorPanel`로 분리했다.

- 이야기·작품 기준
  - 스토리 원문 편집
  - 컷 수 범위
  - 캐릭터·구도·화풍 역할 기반 참조 팩
  - 아이디어 초안/제작용/최종 원고 프로필
- 컷 연출
  - 카드 보드와 간단 목록
  - 보이는 체크박스를 통한 다중 선택
  - 장면 비트, 요약, 제작 방향, 이미지 프롬프트, 대사, 연속성 메타 편집
  - 선택 컷에 대한 실제 1·2·4안 생성 요청
- 제작·검토
  - 기존 후보 데스크 재사용
  - 후보 선택과 결과 확정 분리
  - 최대 4개 후보 나란히 비교
  - 진행·완료·부분 실패·비용 확인 범위를 보여 주는 Activity 요약
- 마감·추가
  - 실제 선택 이미지를 이용한 세로 독자 미리보기
  - 프레임·이미지·대사·말풍선 수량 요약
  - 현재 페이지 또는 새 페이지 대상 선택
  - 기존 Studio 적용 callback 재사용

### 2. 결정론적 제작 방향

각 컷 이미지 프롬프트에 다음 제작 방향 중 하나를 중복 없이 기록한다.

- 기준 충실형
- 감정 표현형
- 시네마틱형
- 대안 구도형

방향을 바꾸면 기존 marker를 교체하며, 과거 후보는 기존 fingerprint/stale 정책에 따라 비교 가능한 상태로 남는다.

### 3. 행동 가능한 품질 점검

금액이나 불투명한 단일 점수를 만들지 않고 다음 문제를 `먼저 수정`, `확인 권장`, `제안`으로 분류한다.

- 참조 에셋 로딩·누락·개수 초과
- 장면 요약 또는 이미지 지시 누락
- 한 컷의 과도한 대사
- 이미지 생성 실패
- 현재 프롬프트·연속성·참조와 다른 선택 후보
- 같은 연출 비트의 과도한 반복

문제에서 해당 컷 또는 참조 팩으로 직접 이동할 수 있다.

### 4. 접근성과 반응형

- 기존 `useStudioModalSheet`의 포커스 가두기, Escape, launcher 복귀 계약 재사용
- 단계 탐색에 `aria-current="step"`
- 목록+체크박스를 다중 선택의 정식 경로로 사용
- 후보 비교 dialog의 포커스 복귀
- 진행 상태 `role="status"`와 지속형 Activity 영역 분리
- 아이콘 전용 닫기 버튼의 accessible name
- 최소 44px 공용 터치 타깃 재사용
- `motion-reduce`에서 spinner를 제외한 상태 전환 모션 억제
- 좁은 폭에서는 단계 rail을 가로 탐색으로 바꾸고 inspector를 본문 아래로 재배치

### 5. 디자인 시스템 정합성

- `DESIGN.md`의 warm-ink 표면과 persimmon accent 토큰만 사용
- 임의 purple/blue 장식색 미사용
- Primary는 현재 단계의 대표 행동에만 사용
- 후보 이미지와 컷 콘텐츠가 배지·장식보다 우선하도록 구성
- 기존 `studio-panel-ui`의 focus/touch/easing 토큰 재사용

## 실제로 재사용한 생산 경로

- `studio-ai-comic-composer-handoff.ts`
- `studio-ai-comic-composer-intent.ts`
- `studio-scenario-candidate-workflow.ts`
- `studio-scenario-image-generation.ts`
- `StudioScenarioCandidateDesk.tsx`
- `StudioAiImageReferencePackEditor.tsx`
- `StudioContinuityMetadataEditor.tsx`
- `studio-scenario-layout.ts`
- 기존 parent-owned scenario state와 apply callback

새 UI가 직접 provider fetch, retry loop, base64 장기 보관 또는 Studio 문서 mutation을 수행하지 않는다.

## 의도적으로 구현하지 않은 범위

### Targeted repair

현재 연결된 시나리오 실행 경로에는 mask asset 저장과 공급자별 region-edit capability 계약이 없다. 따라서 얼굴·손·의상·배경만 수정된 것처럼 보이는 가짜 기능을 추가하지 않았다.

화면은 현재 상태를 명시하고 `이 컷 전체 다시 제작`만 실제 동작으로 제공한다. mask/outpaint가 연결되면 동일 inspector에 capability 기반으로 추가할 수 있다.

### route-level durable workspace

이번 변경은 기존 Studio 전체화면 modal과 parent-owned 제작 상태를 유지하는 호환 가능한 수직 슬라이스다. 별도 composition route, 서버 durable job, 협업 승인 revision, 레이어 분해는 후속 범위다.

### 후보별 서로 다른 provider request intent

현재 제작 방향은 컷의 실제 프롬프트에 적용된다. 같은 컷의 1·2·4 후보는 기존 executor의 후보 번호별 미세 변형을 사용한다. 후보별 독립 의도와 공급자 receipt 스키마는 후속 migration이 필요하다.

## 검증

로컬에서 네트워크 없이 수행한 검증:

- 변경 TypeScript/TSX 7개 파일 `transpileModule` syntax 검증
- 실제 의존 타입의 최소 사본을 사용한 strict TypeScript 검증
- workflow YAML 파싱
- import 사용 여부 정적 검사
- 제품 UI의 금지 purple/black/white/raw-RGB 패턴 검사

GitHub Actions의 전용 `Studio AI comic director quality` workflow가 다음을 실행하도록 확장했다.

- 신규 model/component 테스트
- 기존 episode handoff/intent 테스트
- 후보 workflow/후보 데스크 테스트
- 기존 scenario image generation 및 scenario surface 회귀 테스트
- 신규·기존 production surface ESLint
- 전체 TypeScript 검사
- production build

최종 merge 판단은 GitHub Actions 결과와 PR diff 검토를 기준으로 한다.
