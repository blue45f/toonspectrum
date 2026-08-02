import type { StudioUxTaskDefinition } from "./studio-ux-task-benchmark-policy";

export const STUDIO_UX_REFERENCE_PRODUCT_IDS = [
  "magma",
  "sumo-paint",
  "photopea",
  "kleki",
  "pixilart",
  "clip-studio-paint",
] as const;

export type StudioUxReferenceProductId =
  (typeof STUDIO_UX_REFERENCE_PRODUCT_IDS)[number];

export interface StudioUxReferenceProduct {
  readonly id: StudioUxReferenceProductId;
  readonly name: string;
  readonly className: string;
  readonly evidenceKind: "official-document-trace" | "public-ui-observation";
  readonly sourceUrls: readonly string[];
}

export interface StudioUxReferenceTaskRoute {
  readonly productId: StudioUxReferenceProductId;
  readonly taskIds: readonly string[];
  /**
   * A conservative minimum reconstructed from the cited public route. It is not represented as a
   * timed usability test. A real browser trace must use the observation schema before it can be
   * compared with ToonSpectrum timing.
   */
  readonly documentedMinimumPointerTaps: number | null;
  readonly documentedMinimumPointerDrags: number | null;
  readonly keyboardPath: string | null;
  readonly stateFeedback: readonly string[];
  readonly support: "documented" | "publicly-observed" | "not-confirmed";
  readonly sourceUrls: readonly string[];
  readonly notes: string;
}

const nativeFixture = {
  importedImageCount: 0,
  nativeBrushStrokeCount: 3,
  nativeLineObjectCount: 1,
} as const;

export const STUDIO_UX_TASK_FIXTURES: readonly StudioUxTaskDefinition[] = [
  {
    id: "native-first-ink",
    title: "네이티브 획과 선 객체로 작업 문서 만들기",
    sourceKind: "native-document",
    intent: "이미지 업로드 없이 브러시 획 3개와 편집 가능한 선 객체 1개를 만든다.",
    fixture: nativeFixture,
    terminalState: [
      "세 획과 한 선 객체가 모두 보인다",
      "현재 도구와 브러시 상태가 표시된다",
      "한 번의 실행취소와 다시실행이 마지막 획만 왕복한다",
    ],
    budgets: {
      maxDiscoveryMs: 4_000,
      maxWrongTurns: 0,
      maxPointerTaps: 2,
      maxPointerDrags: 4,
      maxKeyboardChords: 1,
    },
    requiredFeedback: ["toolSelected", "targetIdentified", "commitConfirmed"],
    requireKeyboardPath: true,
    requireEntryContinuity: false,
    requireUndo: true,
    requireCancel: false,
    requirePanelFlexibility: false,
    requireMobileEvidence: false,
    requireErrorRecovery: false,
  },
  {
    id: "native-area-selection",
    title: "네이티브 획 일부를 사각·원형 선택",
    sourceKind: "native-document",
    intent: "브러시 획과 선 객체가 있는 문서에서 드래그로 영역을 선택하고 선택 범위를 확인한다.",
    fixture: nativeFixture,
    terminalState: [
      "선택 경계가 캔버스에 보인다",
      "선택 대상과 선택 방식이 상태 UI에 보인다",
      "Esc 또는 명시적 취소로 선택 작성 중 상태를 종료한다",
    ],
    budgets: {
      maxDiscoveryMs: 5_000,
      maxWrongTurns: 0,
      maxPointerTaps: 2,
      maxPointerDrags: 1,
      maxKeyboardChords: 1,
    },
    requiredFeedback: ["toolSelected", "targetIdentified", "previewVisible"],
    requireKeyboardPath: true,
    requireEntryContinuity: false,
    requireUndo: false,
    requireCancel: true,
    requirePanelFlexibility: false,
    requireMobileEvidence: false,
    requireErrorRecovery: false,
  },
  {
    id: "native-selection-filter",
    title: "네이티브 획 선택 범위에 필터 적용",
    sourceKind: "native-document",
    intent: "업로드 이미지 없이 네이티브 획 선택 영역에 필터를 미리 보고 적용한다.",
    fixture: nativeFixture,
    terminalState: [
      "선택 범위 안에서만 필터 미리보기가 변한다",
      "적용·취소가 명시적이다",
      "실행취소와 다시실행이 필터 결과를 왕복한다",
    ],
    budgets: {
      maxDiscoveryMs: 7_000,
      maxWrongTurns: 1,
      maxPointerTaps: 4,
      maxPointerDrags: 1,
      maxKeyboardChords: 2,
    },
    requiredFeedback: [
      "targetIdentified",
      "previewVisible",
      "progressIndicated",
      "commitConfirmed",
      "errorExplained",
    ],
    requireKeyboardPath: true,
    requireEntryContinuity: true,
    requireUndo: true,
    requireCancel: true,
    requirePanelFlexibility: false,
    requireMobileEvidence: false,
    requireErrorRecovery: true,
  },
  {
    id: "native-retouch",
    title: "네이티브 획을 리터치 브러시로 수정",
    sourceKind: "native-document",
    intent: "네이티브 획 위에 스머지·닷지/번·리퀴파이 중 하나를 직접 드래그한다.",
    fixture: nativeFixture,
    terminalState: [
      "도구 커서와 대상 레이어가 표시된다",
      "리터치 결과가 포인터를 놓은 뒤에도 유지된다",
      "실행취소와 다시실행이 결과를 왕복한다",
    ],
    budgets: {
      maxDiscoveryMs: 6_000,
      maxWrongTurns: 1,
      maxPointerTaps: 3,
      maxPointerDrags: 1,
      maxKeyboardChords: 1,
    },
    requiredFeedback: ["toolSelected", "targetIdentified", "previewVisible", "commitConfirmed"],
    requireKeyboardPath: true,
    requireEntryContinuity: true,
    requireUndo: true,
    requireCancel: true,
    requirePanelFlexibility: false,
    requireMobileEvidence: false,
    requireErrorRecovery: false,
  },
  {
    id: "native-transform",
    title: "네이티브 획과 선 객체 선택 후 변형",
    sourceKind: "native-document",
    intent: "네이티브 획 또는 선 객체를 선택해 이동·크기 조절하고 적용하거나 취소한다.",
    fixture: nativeFixture,
    terminalState: [
      "선택 경계와 변형 핸들이 보인다",
      "변형 중 수치 또는 상태 피드백이 보인다",
      "적용·취소·실행취소가 모두 원본을 보존한다",
    ],
    budgets: {
      maxDiscoveryMs: 5_000,
      maxWrongTurns: 0,
      maxPointerTaps: 3,
      maxPointerDrags: 2,
      maxKeyboardChords: 1,
    },
    requiredFeedback: ["toolSelected", "targetIdentified", "previewVisible", "commitConfirmed"],
    requireKeyboardPath: true,
    requireEntryContinuity: true,
    requireUndo: true,
    requireCancel: true,
    requirePanelFlexibility: false,
    requireMobileEvidence: false,
    requireErrorRecovery: false,
  },
  {
    id: "panel-adaptation",
    title: "작업 패널 크기·접기·복원",
    sourceKind: "native-document",
    intent: "네이티브 작업을 유지한 채 좌우 패널을 조절해 캔버스를 넓히고 이전 상태로 돌아온다.",
    fixture: nativeFixture,
    terminalState: [
      "패널 너비를 직접 조절한다",
      "패널을 접고 다시 열어도 탭과 작업 상태가 유지된다",
      "캔버스 또는 하단 도구와 겹치지 않는다",
    ],
    budgets: {
      maxDiscoveryMs: 5_000,
      maxWrongTurns: 0,
      maxPointerTaps: 2,
      maxPointerDrags: 1,
      maxKeyboardChords: 0,
    },
    requiredFeedback: ["targetIdentified", "commitConfirmed"],
    requireKeyboardPath: false,
    requireEntryContinuity: false,
    requireUndo: false,
    requireCancel: false,
    requirePanelFlexibility: true,
    requireMobileEvidence: false,
    requireErrorRecovery: false,
  },
  {
    id: "mobile-native-edit",
    title: "모바일에서 네이티브 획 선택·변형",
    sourceKind: "native-document",
    intent: "390×844와 320×844 화면에서 패널에 가리지 않고 네이티브 획을 선택·이동한다.",
    fixture: nativeFixture,
    terminalState: [
      "모든 핵심 터치 대상이 44px 이상이다",
      "safe area 및 하단 도크가 겹치지 않는다",
      "캔버스가 화면 면적의 55% 이상을 차지한다",
      "가로 스크롤이 1px를 넘지 않는다",
    ],
    budgets: {
      maxDiscoveryMs: 6_000,
      maxWrongTurns: 1,
      maxPointerTaps: 4,
      maxPointerDrags: 2,
      maxKeyboardChords: 0,
      minCanvasOccupancyRatio: 0.55,
    },
    requiredFeedback: ["toolSelected", "targetIdentified", "previewVisible", "commitConfirmed"],
    requireKeyboardPath: false,
    requireEntryContinuity: true,
    requireUndo: true,
    requireCancel: true,
    requirePanelFlexibility: false,
    requireMobileEvidence: true,
    requireErrorRecovery: false,
  },
  {
    id: "conditional-native-media-entry",
    title: "조건부 자연매체 기능의 진입 연속성",
    sourceKind: "native-document",
    intent: "선택된 freehand 획 같은 선행 조건이 없을 때 안내 CTA로 조건을 만들고 원래 기능으로 복귀한다.",
    fixture: nativeFixture,
    terminalState: [
      "필요한 조건과 해결 CTA가 함께 보인다",
      "CTA가 선택 가능한 도구·상태로 실제 전환한다",
      "대상을 선택한 뒤 원래 자연매체 기능 진입 UI가 유지되거나 자동 재노출된다",
      "사용자가 다른 패널을 수동으로 다시 탐색하지 않고 기능을 실행한다",
    ],
    budgets: {
      maxDiscoveryMs: 5_000,
      maxWrongTurns: 0,
      maxPointerTaps: 3,
      maxPointerDrags: 1,
      maxKeyboardChords: 1,
    },
    requiredFeedback: ["targetIdentified", "errorExplained", "commitConfirmed"],
    requireKeyboardPath: false,
    requireEntryContinuity: true,
    requireUndo: true,
    requireCancel: true,
    requirePanelFlexibility: false,
    requireMobileEvidence: false,
    requireErrorRecovery: true,
  },
  {
    id: "imported-image-filter-compatibility",
    title: "가져온 이미지의 선택·필터 호환성",
    sourceKind: "import-compatibility",
    intent: "가져온 이미지에서도 같은 선택·필터 경로가 유지되는지 보조 호환성으로 확인한다.",
    fixture: {
      importedImageCount: 1,
      nativeBrushStrokeCount: 0,
      nativeLineObjectCount: 0,
    },
    terminalState: [
      "가져온 이미지에서 선택·필터가 동작한다",
      "네이티브 문서 task 점수와 별도로 보고된다",
      "오류 후 재시도해도 원본 이미지가 유지된다",
    ],
    budgets: {
      maxDiscoveryMs: 7_000,
      maxWrongTurns: 1,
      maxPointerTaps: 5,
      maxPointerDrags: 1,
      maxKeyboardChords: 2,
    },
    requiredFeedback: ["targetIdentified", "previewVisible", "commitConfirmed", "errorExplained"],
    requireKeyboardPath: true,
    requireEntryContinuity: true,
    requireUndo: true,
    requireCancel: true,
    requirePanelFlexibility: false,
    requireMobileEvidence: false,
    requireErrorRecovery: true,
  },
] as const;

export const STUDIO_UX_REFERENCE_PRODUCTS: readonly StudioUxReferenceProduct[] = [
  {
    id: "magma",
    name: "Magma",
    className: "browser collaborative drawing",
    evidenceKind: "official-document-trace",
    sourceUrls: [
      "https://help.magma.com/en/articles/6871160-magma-s-editor-user-interface",
      "https://help.magma.com/en/articles/6790127-selection-tool",
      "https://help.magma.com/en/articles/6845211-transform-tool",
      "https://help.magma.com/en/articles/10586978-magma-layout-modes",
    ],
  },
  {
    id: "sumo-paint",
    name: "Sumo Paint",
    className: "browser raster editor",
    evidenceKind: "public-ui-observation",
    sourceUrls: [
      "https://paint.sumo.app/",
      "https://github.com/sumo-apps/custom-docs/wiki",
    ],
  },
  {
    id: "photopea",
    name: "Photopea",
    className: "browser raster and PSD editor",
    evidenceKind: "official-document-trace",
    sourceUrls: [
      "https://www.photopea.com/learn/workspace",
      "https://www.photopea.com/learn/selections",
      "https://www.photopea.com/learn/free-transform",
      "https://www.photopea.com/learn/adjustments-filters",
    ],
  },
  {
    id: "kleki",
    name: "Kleki",
    className: "lightweight browser drawing",
    evidenceKind: "official-document-trace",
    sourceUrls: [
      "https://kleki.com/help/",
      "https://kleki.com/changelog-summary/",
    ],
  },
  {
    id: "pixilart",
    name: "Pixilart",
    className: "browser pixel drawing",
    evidenceKind: "public-ui-observation",
    sourceUrls: [
      "https://www.pixilart.com/draw",
      "https://www.pixilart.com/tutorials",
    ],
  },
  {
    id: "clip-studio-paint",
    name: "Clip Studio Paint",
    className: "professional comic and drawing",
    evidenceKind: "official-document-trace",
    sourceUrls: [
      "https://help.clip-studio.com/en-us/manual_en/150_tools/The_Tool_palette.htm",
      "https://help.clip-studio.com/en-us/manual_en/330_selection/Selection.htm",
      "https://help.clip-studio.com/en-us/manual_en/360_transform/Transforming_Images.htm",
      "https://help.clip-studio.com/en-us/manual_en/690_interface/Palettes.htm",
    ],
  },
] as const;

const allNativeTaskIds = STUDIO_UX_TASK_FIXTURES
  .filter((task) => task.sourceKind === "native-document")
  .map((task) => task.id);

export const STUDIO_UX_REFERENCE_TASK_ROUTES: readonly StudioUxReferenceTaskRoute[] = [
  {
    productId: "magma",
    taskIds: allNativeTaskIds,
    documentedMinimumPointerTaps: 1,
    documentedMinimumPointerDrags: 1,
    keyboardPath: "B / M / Shift+T / Ctrl+Z; Tab toggles the editor UI",
    stateFeedback: ["pressed tool", "selection contour", "transform handles", "properties panel"],
    support: "documented",
    sourceUrls: STUDIO_UX_REFERENCE_PRODUCTS[0].sourceUrls,
    notes: "Selection, transform, brush properties, layout modes and shortcuts are documented; filter timing still needs a live trace.",
  },
  {
    productId: "sumo-paint",
    taskIds: allNativeTaskIds,
    documentedMinimumPointerTaps: null,
    documentedMinimumPointerDrags: null,
    keyboardPath: null,
    stateFeedback: ["active tool", "layer state", "filter preview"],
    support: "publicly-observed",
    sourceUrls: STUDIO_UX_REFERENCE_PRODUCTS[1].sourceUrls,
    notes: "Public editor and project wiki establish the task surface; exact action counts must be captured in a dated browser trace.",
  },
  {
    productId: "photopea",
    taskIds: allNativeTaskIds,
    documentedMinimumPointerTaps: 1,
    documentedMinimumPointerDrags: 1,
    keyboardPath: "B / M / Ctrl+T / Ctrl+Z / Ctrl+D",
    stateFeedback: ["active toolbar tool", "marching selection", "transform box", "history state"],
    support: "documented",
    sourceUrls: STUDIO_UX_REFERENCE_PRODUCTS[2].sourceUrls,
    notes: "Official Learn documents tool shortcuts, selection-only edits, transform confirmation/cancel and collapsible panel columns.",
  },
  {
    productId: "kleki",
    taskIds: allNativeTaskIds,
    documentedMinimumPointerTaps: 1,
    documentedMinimumPointerDrags: 1,
    keyboardPath: "documented brush/eraser/undo shortcuts; exact transform chord not confirmed",
    stateFeedback: ["active tool", "selection overlay", "undo state"],
    support: "documented",
    sourceUrls: STUDIO_UX_REFERENCE_PRODUCTS[3].sourceUrls,
    notes: "Help and changelog confirm selection affects tools, transform improvements, touch gestures and automatic recovery; advanced retouch parity is not assumed.",
  },
  {
    productId: "pixilart",
    taskIds: allNativeTaskIds,
    documentedMinimumPointerTaps: null,
    documentedMinimumPointerDrags: null,
    keyboardPath: null,
    stateFeedback: ["active pixel tool", "selection boundary", "layer state"],
    support: "publicly-observed",
    sourceUrls: STUDIO_UX_REFERENCE_PRODUCTS[4].sourceUrls,
    notes: "The public drawing surface is evidence for discoverability and action tracing; unsupported high-end retouch operations must be recorded as incomplete rather than inferred.",
  },
  {
    productId: "clip-studio-paint",
    taskIds: allNativeTaskIds,
    documentedMinimumPointerTaps: 1,
    documentedMinimumPointerDrags: 1,
    keyboardPath: "B / M / Ctrl+T / Ctrl+Z / Esc with configurable shortcuts",
    stateFeedback: ["selected sub tool", "selection launcher", "transform handles", "palette state"],
    support: "documented",
    sourceUrls: STUDIO_UX_REFERENCE_PRODUCTS[5].sourceUrls,
    notes: "Official manual establishes grouped tool palettes, selection, transform, filters and movable/dockable palette workflows on desktop and tablet.",
  },
] as const;
