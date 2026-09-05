# 전문 3D 제작: 메시 선택 작업대

기준 PR: blue45f/toonspectrum #747
기준 head: 873ff98b712fa0e3dde2a26f4c0512141c19387a

## 실제 추가한 기능

뷰포트 공개 래퍼에 메시 선택 작업대를 연결했다. 기존 카메라, 렌더링, 기즈모, 원본 메시, 저장 스키마는 변경하지 않았다.

- 전체 선택, 선택 해제, 반전.
- 인접 요소 한 단계 확장 및 선택 밖 요소와 맞닿은 선택 영역 축소.
- 연결 영역 선택. 겹쳐 보이기만 하는 분리된 부품은 연결하지 않는다.
- 열린 경계 선택: 반대편 면이 없는 모서리 및 그 점/면.
- 고립 정점 선택.
- 두 요소 사이의 위상상 최소 단계 경로 선택. 거리 기반/표면 측지선이 아니다.
- 선택 기억/복원. 에셋, 메시 버전, 원본 해시, 선택 모드가 다르면 복원을 차단한다.
- 캔버스 한정 A/Alt+A/Ctrl+I/L/Ctrl+키패드 ± 단축키.

점은 모서리로, 선은 공유 정점으로, 면은 공유 모서리로 연결된다. 따라서 꼭짓점 하나만 맞닿은 두 면은 면 모드에서 연결되지 않는다. 선 ID는 half-edge/twin 중 작은 값 하나로 정규화한다. 저장 인덱스가 아닌 안정 ID를 선택한다.

Blender의 선택 기능 분류를 참고했지만 전체 기능 동등성을 주장하지 않는다. 참고한 공식 문서:
https://docs.blender.org/manual/en/5.2/modeling/meshes/selecting/index.html
https://docs.blender.org/manual/en/4.4/modeling/meshes/selecting/linked.html

## 검증·성능·보호

연결 탐색은 정점/모서리/면의 incidence group을 사용한다. 높은 차수의 정점에 모인 모서리들을 모두 쌍으로 연결하는 이차 크기 그래프를 만들지 않는다. 연결 탐색과 BFS 최단 경로는 각 그룹을 한 번만 확장한다.

잘못된 ID, 빈 배열 슬롯, 서로 맞지 않는 next/prev/twin, 뒤집히지 않은 쌍 모서리, 잘못된 면 소유권, 닫히지 않는 순환, 중복 정점 면, 고아 half-edge를 거부한다. 캐시는 저장소의 불변 메시 계약을 따른다. 새 원본 객체에는 새 인덱스를 만든다.

UI는 완성된 선택 결과를 기존 선택 권위 함수로 먼저 검증하고, 전체 콜백 실행 계획을 계산한 뒤 적용한다. 필수 원본 정보가 오래됐거나, 읽기 전용/작업 중/조형/오브젝트 모드/그래픽 중단/드래그 중이면 적용하지 않는다. 키보드 입력은 해당 작업대의 렌더 캔버스 안으로 한정하고 텍스트 입력, IME, 반복 키, 처리된 이벤트는 제외한다.

## 중요한 현재 한계

현재 StudioHybridDccPanel은 단일 요소 선택 콜백만 공개한다. 이를 바꾸기 위해 대형 패널을 통째로 교체하거나 저장 경로를 우회하지 않았다. 신규 작업대는 기존 **함수형 선택 업데이트** 콜백을 제한된 계획으로 연결한다.

- 새 명령의 UI 적용은 한 번에 최대 512개 변경, 선택 배열 반복 처리량 1,000,000으로 제한한다.
- 이미 선택된 많은 요소를 모두 해제할 때는 하나의 clear 콜백을 사용한다.
- 제한을 넘으면 일부만 선택하거나 자르는 대신 첫 콜백 전에 오류로 중단한다.
- 선택 계산 엔진 자체는 최대 50,000개 선택과 제한된 토폴로지 탐색을 지원한다.
- 기존 앱의 선택 한도를 낮춘 것이 아니라 신규 작업대의 단일 요소 콜백 연결에만 추가한 보호다.
- 임의 크기 전체 선택을 효율적으로 처리하려면 패널에 원본 검증을 포함한 원자적 일괄 선택 콜백을 추가하는 후속 변경이 필요하다.

선택 상태만 바꾸며 메시 변형이나 별도의 Undo/저장 명령은 만들지 않는다. 여러 콜백을 연결하는 UI 방식은 전체 문서 트랜잭션이라고 부르지 않는다. 선택 기억은 현재 작업대 메모리이며 영구 저장이나 시스템 클립보드가 아니다.

## 이번 응답에서 실제 실행한 검사

- 기존 제작 도구 순수 계산 회귀: 26/26 통과.
- 신규 메시 선택 순수 계산 회귀: 29/29 통과.
- 신규 생산 커널 TypeScript strict + noUncheckedIndexedAccess 통과.
- 신규/변경 TS/TSX 5개 구문 변환 진단 0개.
- 이전 업로드 소스 16개와 manifest의 Git blob SHA-1 동일성 확인.

신규 회귀 검사에는 열린 면/닫힌 큐브, 비연속 안정 ID, 고립 정점, 분리된 부품, 높은 차수 정점에 모인 4,000개 면, 독립 BFS와 64개 격자/끝점 비교, 256개 입력 조합 각각의 clear 허용/비허용 콜백 계획 검사가 포함된다.

실행 환경: Node 22.16.0 / TypeScript 5.8.3. 저장소 지정 전체 도구 체인과 구분한다.

재현:
```sh
node scripts/verify-studio-hybrid-dcc-selection-kernel.mjs
node scripts/verify-studio-hybrid-dcc-viewport-kernels.mjs
```

스크립트는 생산 커널을 엄격 컴파일하고 테스트 등록기만 Vitest에서 node:test로 교체하여 동일한 native assert를 실행한다. React·Three.js·WebGL을 통과한 것처럼 모의 구현하지 않는다.

## 추가했으나 실행하지 못한 검사

React UI와 기존 선택 권위 함수의 연결 테스트 8개를 추가했다. 전체 저장소 의존성과 실행 가능한 브라우저 앱을 확보하지 못해 실행하지 않았다. 전체 typecheck/lint/build 및 브라우저 WebGL/E2E 통과도 확인하지 않았다.

```sh
pnpm exec vitest run src/domains/creator/hybrid-dcc/studio-hybrid-dcc-selection-commands.test.ts src/domains/creator/hybrid-dcc/StudioHybridDccMeshSelectionTools.test.tsx src/domains/creator/hybrid-dcc/StudioHybridDccViewport.test.tsx
pnpm run typecheck
pnpm run lint:ci
pnpm run verify:studio-hybrid-dcc-integration
```

## 병합

이 작업 시작 시 메인 병합을 다시 요청했지만 GitHub가 `Required status check "core" is queued.`로 거부했다. 보호 규칙이나 성공 상태를 위조/변경하지 않았다. 최종 PR 상태와 최신 커밋 검사는 GitHub 조회 결과로 별도 확인해야 한다. 기능 구현/코드 업로드와 메인 병합/배포 성공은 서로 다른 상태다.
