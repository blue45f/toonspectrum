# ADR-0020: EditorClient 경계와 UI 명령 계약, 호스트 분해 ratchet

- 상태: Accepted
- 날짜: 2026-09-02
- 범위: `StudioCuttoonEditorHost`, 툴 레일·메뉴·단축키·radial HUD·모바일 도크·컴패니언·AI action 진입점,
  `packages/studio-command-registry`, 린트 예외, 구조 테스트
- 관련: [ADR-0016](0016-studio-route-document-runtime-boundaries.md),
  `docs/rewrite/command-consolidation-plan.md`,
  [외부 검토 2026-09-02](../architecture/studio-architecture-review-2026-09-02.md) §1·§4·§10

## 맥락

`StudioPage.tsx`는 얇은 진입점이 됐지만 편집기 상태와 동작은 `StudioCuttoonEditorHost.tsx`(30,961행)로
옮겨졌고, `StudioCuttoonEditorViewSessionCore/Rest`는 각각 552개 필드를 `any`로 넘기는 closure bag이다.
UI 컴포넌트는 명령이 아니라 setter 묶음을 받는다(`StudioLeftToolRail`은 `Dispatch<SetStateAction>` 17개).
"기계적 추출" 디렉터리에는 `no-explicit-any`, Hooks, purity, React Compiler 규칙이 꺼져 있어 파일을 더
나눠도 결합이 유지된다. 기존 구조 테스트는 진입 파일 행수만 검사해 이 상태를 가렸다.

Wave A(2026-08-08)는 `CommandRegistry`와 155개 명령 카탈로그를 만들었지만 소비자 전환은 미착수였다.
검토는 모든 UI 진입점이 `EditorClient` 하나만 받고, selector로 읽고 `dispatch()`로 쓰라고 요구한다.

## 결정

1. **계약**: `packages/studio-command-registry`에 `EditorClient<Snapshot>`을 둔다.
   `getSnapshot()`, `subscribe(listener)`, `dispatch(request, options) → Promise<CommandReceipt>`,
   `availability(id)`. `CommandReceipt`는 `requestId`, `commandId`, `status`
   (`applied | rejected | unavailable | failed | aborted`), `acceptedRevision`, `dirtyRegions`,
   `durableState`(`memory | opfs | server`), `undo?`를 갖는다. 실행은 기존 `CommandRegistry`의 availability와
   `execute`를 거친다(새 명령 버스를 만들지 않는다).
2. **React 경계**: `src/domains/creator/editor-client/`의 `StudioEditorClientProvider`,
   `useEditorSelector(selector, isEqual?)`, `useEditorCommand(id, source)`만이 UI가 편집기 상태를 읽고 쓰는
   공식 경로다. 신규 UI 컴포넌트는 raw React setter(`Dispatch<SetStateAction<…>>`)를 prop으로 받지 않는다.
3. **기존 UI 전환 순서**: (a) setter를 명명된 핸들러로 치환(이번 웨이브: 툴 레일 `setTool` → `toggleHandTool`,
   `returnToSelectTool`/`activatePrimaryCanvasTool`), (b) 핸들러를 `CommandId`가 있는 명령으로 승격,
   (c) 컴포넌트가 `EditorClient`만 받도록 prop 축소. 한 컴포넌트씩, 부수효과 집합이 하나로 유지되는지
   `studio-page-tool-transition-boundary.test.ts`류 테스트로 고정한다.
4. **ratchet**: `src/domains/creator/studio-host-architecture-ratchet.test.ts`가 다음을 "내려가기만 하는"
   상한으로 고정한다 — 호스트 행수, closure bag `any` 개수, `StudioLeftToolRailProps` setter 개수,
   React 컴포넌트(`*.tsx`)의 브라우저 API 직접 접근 사이트(`navigator.gpu`, `navigator.storage`,
   `indexedDB`, `showOpenFilePicker`, `new Worker`, `new OffscreenCanvas`, `new WebSocket`). 또한
   `StudioCuttoonEditorHost`를 import할 수 있는 모듈은 `StudioPage.tsx` 하나뿐이다(feature→host 역방향 금지).
   `studio-page-entry-size-boundary.test.ts`는 삭제한다.
5. **린트 예외 원장**: 예외 글롭은 `eslint.legacy-exceptions.json`에만 산다. 테스트가 (a) 모든 글롭이
   실제 파일과 매칭되고, (b) 항목 수가 동결값을 넘지 않음을 검사한다. 새 파일은 예외를 받을 수 없고,
   feature 하나를 typed facade로 옮길 때마다 해당 글롭을 지운다(검토 §1 "경계를 순차적으로 좁힌다").
6. **런타임 분해 목표**(로드맵 P1): `StudioDocumentRuntime`, `ToolRuntime`, `ViewportRuntime`,
   `RenderRuntime`, `DurabilityRuntime`, `CollaborationRuntime`, `ExportRuntime`으로 상태 소유자를 나누고,
   호스트는 런타임 조합과 shell mount만 남긴다(목표 500–1,000행). `ViewSessionCore/Rest`는 feature별
   selector/command로 대체된 뒤 삭제한다.

## 결과

- 긍정: setter 전달·closure bag·린트 예외가 더 늘지 못한다. 명령 경로가 하나라 메뉴·단축키·레일·HUD·AI가
  같은 부수효과를 갖는다. 이후 Worker 세션(검토 §5)으로 옮길 때 UI는 `EditorClient` 구현만 바꾸면 된다.
- 부정: 전환 기간 동안 핸들러(구)와 명령(신)이 공존한다. ratchet 상한은 리팩터가 진행될 때마다 수동으로
  내려야 한다(자동 상향은 없다).
- 미결: `CommandReceipt.dirtyRegions`·`durableState`를 실제 문서 런타임과 OPFS 저널이 채우는 것은 P1·P3에서
  연결한다. 지금은 계약과 훅, 테스트만 있다.
