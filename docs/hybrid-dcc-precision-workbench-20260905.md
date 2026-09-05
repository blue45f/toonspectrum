# 전문 3D 제작: 정밀 변환 작업대

기준: `blue45f/toonspectrum` main `7dc70b9cd3a492325355141fbd662ae84bd67f7d`.
이 변경은 Blender 전체 기능 동등성 달성이 아니라, 전문 편집에 필요한 좌표 정확성과 정밀 배치 작업 흐름의 구현이다.

## 구현

- 저장된 intrinsic XYZ 회전과 화면의 Three.js 회전이 일치하도록 순변환/역변환 수정. 기존 Rz*Ry*Rx 계산은 여러 축이 함께 회전할 때 화면과 달랐다. 저장 스키마는 변경하지 않는다.
- 기존 `StudioHybridDccViewport.tsx` 본문은 `StudioHybridDccViewportCore.tsx`에 원본 blob 그대로 보존한다. 기존 경로는 공개 API를 재노출하며 정밀 작업대를 추가한다.
- 길이(m/cm/mm), 각도(deg/°/rad), 배율(%)과 괄호·사칙연산 입력. eval 없이 길이·깊이·단위·유한값 검사.
- 월드/로컬 축 거리 이동 및 quaternion 합성을 이용한 피벗 회전. 오브젝트 원점, 표시 메시 중심, 월드 원점, 사용자 월드 피벗 지원.
- 비율을 보존하는 목표 치수 맞춤, 로컬 축별/균일 배율, 명시적인 월드 그리드 정렬.
- 실제 표시 정점을 측정하여 바닥 Y=0 정렬과 메시 중심 원점 배치. 회전된 로컬 bounding box의 빈 모서리 때문에 바닥에서 뜨는 오류를 피한다.
- 모든 수정은 기존 `onCommitAssetTransform`으로 전달한다. 메시 권위를 직접 변경하거나 저장·Undo 우회 경로를 만들지 않는다.
- 숨김/미표시, 미선택, 읽기 전용, 작업 중, 요소 편집 및 조형 모드에서는 적용을 차단한다. 계산 결과는 숫자로 미리 보여주며 저장 완료라고 가장하지 않는다.

## 검증 범위

실행 완료:
- 새 순수 계산 모듈과 수정한 변환 모듈: TypeScript strict + noUncheckedIndexedAccess 통과.
- 로컬 Node 회귀 테스트 29개 통과. 독립적인 축 회전 oracle과 512개 복합 회전 사례, 월드·로컬 각각 240개 피벗 회전 사례, 256개 그리드 멱등성 사례 포함.
- 새 TS/TSX 소스의 구문 변환 검사 통과.

추가했으나 이 작업 환경에서 실행하지 않은 통합 테스트:
- 실제 Three.js Matrix4와의 512개 비교, workspace Undo/Redo·메시 해시 보존 검증.
- React 작업대 테스트 7개: 초기 접힘, 수식 미리보기/단일 콜백, 악성 입력, 작업 중/요소 모드 차단, 바닥 정렬, 무관한 사용자 피벗 오류 차단.

전체 저장소 의존성과 연결된 데스크톱 실행 환경을 확보하지 못했으므로 전체 typecheck/lint/build, 브라우저 WebGL/E2E 및 실제 배포 품질은 CI에서 확인해야 한다. 로컬 독립 검증을 전체 제품 검증으로 취급하지 않는다.

권장 CI:
```sh
pnpm exec vitest run src/domains/creator/hybrid-dcc/studio-hybrid-dcc-precision.test.ts src/domains/creator/hybrid-dcc/StudioHybridDccPrecisionTools.test.tsx src/domains/creator/hybrid-dcc/studio-hybrid-dcc-object-transform.test.ts src/domains/creator/hybrid-dcc/StudioHybridDccViewport.test.tsx
pnpm run typecheck
pnpm run lint:ci
pnpm run verify:studio-hybrid-dcc-integration
```

## 명시적 한계

그리드는 버튼으로 적용하는 절대 위치 스냅이며 드래그 중 실시간 스냅이 아니다. 미리보기는 숫자 결과이며 GPU ghost preview가 아니다. 정밀 정점 측정은 표시 에셋당 250,000개 정점까지 제한한다. 월드 축 비균일 크기 조절은 TRS로 표현할 수 없는 shear를 조용히 만들지 않도록 거부한다. 피벗은 변환 명령의 기준점이며 영구 object origin 변경이나 메시 bake가 아니다. 전체 Sculpt/리토폴로지, UV/재질 노드, 리깅·타임라인, Cycles급 렌더링 등은 이 변경에 포함되지 않는다.
