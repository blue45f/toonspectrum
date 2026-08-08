/**
 * V5 §15.3 menu specification and our measured coverage of it.
 *
 * §15.3 declares 17 menu groups and, inside each, a list of things the group is
 * supposed to offer. This module is the **only** place that says which of those
 * rows we actually ship, which we do not, and which of our menu items answer to
 * no §15.3 row at all (`extras`).
 *
 * It exists so a gap cannot close itself quietly: `studio-main-menu-group-spec.test.ts`
 * asserts that the live `buildStudioMainMenuGroups()` output and this table claim
 * exactly the same item ids, so adding, moving or dropping a menu item without
 * updating the coverage table fails the build.
 *
 * Source: `docs/architecture/ToonStudio_…_V5_2026-08-07.md` §15.3 (lines 574-645).
 * Audit that ordered the regroup: `docs/rewrite/ux-audit-v5.md` §2.7, §4 Wave C.
 */

export type StudioMenuSpecCoverage = "present" | "partial" | "absent";

export interface StudioMenuSpecRow {
  /** §15.3 wording, verbatim. */
  readonly spec: string;
  readonly coverage: StudioMenuSpecCoverage;
  /** Qualified `<group>/<item>` ids of this group that answer the row. */
  readonly items: readonly string[];
  readonly note?: string;
}

export interface StudioMenuSpecExtra {
  /** Qualified `<group>/<item>` id we ship that §15.3 does not list. */
  readonly item: string;
  readonly note: string;
}

export interface StudioMenuGroupSpec {
  readonly id: string;
  /** Menubar copy (Korean product voice). */
  readonly labelKo: string;
  /** §15.3 heading. */
  readonly specName: string;
  /**
   * Menubar copy for non-Korean locales, for groups the regroup introduced whose
   * `studio.mainMenu.group.<id>.label` key has not shipped yet. Same escape hatch
   * the Help group already used; drop it once the packs carry the key.
   */
  readonly labelEn?: string;
  /**
   * Locale key to reuse for the group label. Set when the regroup renamed a
   * group that already shipped translations (draw → brush) so 75 locale packs
   * keep working.
   */
  readonly labelKey?: string;
  /** `false` for product groups §15.3 does not define. */
  readonly inV5Spec: boolean;
  /** Menubar tooltip copy for groups whose locale packs have not shipped yet. */
  readonly hintKo?: { readonly description: string; readonly tip?: string };
  readonly rows: readonly StudioMenuSpecRow[];
  readonly extras: readonly StudioMenuSpecExtra[];
}

const has = (spec: string, ...items: string[]): StudioMenuSpecRow =>
  ({ spec, coverage: "present", items });

const part = (spec: string, note: string, ...items: string[]): StudioMenuSpecRow =>
  ({ spec, coverage: "partial", items, note });

const gap = (spec: string, note?: string): StudioMenuSpecRow =>
  note === undefined
    ? { spec, coverage: "absent", items: [] }
    : { spec, coverage: "absent", items: [], note };

const ours = (item: string, note: string): StudioMenuSpecExtra => ({ item, note });

export const STUDIO_MENU_GROUP_SPEC: readonly StudioMenuGroupSpec[] = Object.freeze([
  {
    id: "file",
    labelKo: "파일",
    specName: "File",
    inV5Spec: true,
    rows: [
      gap("새 프로젝트", "게스트 진입 시 무제 문서가 자동 생성되고, 명시적 ‘새로 만들기’ 명령은 없다."),
      part("열기·최근 파일", "프로젝트 도구 패널이 최근 작업 목록을 대신한다.", "file/project"),
      part(
        "CSP/PSD/ORA/PDF/Office/3D 가져오기",
        "PSD·ORA·CBZ·WILL·자체 JSON 만. `.clip`·PDF·Office·3D 가져오기는 없다.",
        "file/import-json",
        "file/import-psd",
        "file/import-ora-cbz",
      ),
      gap("원본 파일 연결"),
      part(
        "저장·다른 이름·버전 체크포인트",
        "임시저장·게시만. 명명 체크포인트는 별도 패널에 있고 메뉴 진입점이 없다.",
        "file/save-draft",
        "file/publish",
      ),
      part("Publish Package", "아카이브 백업이 근사치. 배포 패키지 규격은 없다.", "file/export-archive"),
      gap("포맷 호환성 보고서", "손실 미리보기는 가져오기 흐름 안에만 있다."),
      gap("복구 센터", "세션 복구 배너만 있고 센터는 없다(감사 §2.10)."),
      gap("프로젝트 권리 BOM"),
    ],
    extras: [
      ours("file/export", "내보내기 / 다운로드 — 현행 배포 동선의 진입점."),
      ours("file/copy-image", "이미지를 클립보드로."),
      ours("file/export-json", "백업(.json)."),
    ],
  },
  {
    id: "edit",
    labelKo: "편집",
    specName: "Edit",
    inV5Spec: true,
    rows: [
      has("Undo/Redo", "edit/undo", "edit/redo"),
      part("History Branch", "선형 작업 내역만. 분기는 없다.", "edit/history"),
      has("잘라내기·복사·붙여넣기", "edit/cut", "edit/copy", "edit/paste"),
      has("Paste in Place", "edit/paste-in-place"),
      gap("명령 반복"),
      gap("Automation Recipe"),
      has("Preferences", "edit/app-settings"),
      has("Input Device Calibration", "edit/pen-pressure"),
    ],
    extras: [
      ours("edit/paste-file", "이미지 파일 붙여넣기…"),
      ours("edit/duplicate", "복제."),
      ours("edit/clear-selection", "선택 제거 — 선택 영역이 아니라 그 내용을 지운다."),
    ],
  },
  {
    id: "view",
    labelKo: "보기",
    specName: "View",
    inV5Spec: true,
    rows: [
      has(
        "Zoom/Rotate/Mirror",
        "view/zoom-in",
        "view/zoom-out",
        "view/flip-horizontal",
        "view/rotate-left",
        "view/rotate-right",
        "view/reset-rotation",
        "view/fit",
        "view/actual-pixels",
      ),
      gap("Navigator", "내비게이터 패널은 있으나 메뉴 항목이 없다."),
      gap("Proof/Pixel/Vector Preview"),
      part(
        "Color/ICC Soft Proof",
        "색각 검수 5종만. ICC 소프트 프루프는 없다.",
        "view/color-vision-original",
        "view/color-vision-grayscale",
        "view/color-vision-protanopia",
        "view/color-vision-deuteranopia",
        "view/color-vision-tritanopia",
      ),
      gap("Onion Skin"),
      gap("Reference Overlay", "참고 이미지는 창(Window)▸Reference Desk 로 옮겼다."),
      part("Performance HUD", "제작 인사이트는 생산성 지표다. 렌더 성능 HUD 는 없다.", "view/production-insights"),
      gap("Safe Mode", "제품 코드에 Safe Mode 가 없다(감사 §2.10)."),
    ],
    extras: [
      ours("view/fullscreen", "전체화면."),
      ours("view/save-current-view", "현재 보기 저장."),
      ours("view/restore-view", "보기 복원."),
    ],
  },
  {
    id: "canvas",
    labelKo: "캔버스",
    labelEn: "Canvas",
    specName: "Canvas",
    inV5Spec: true,
    hintKo: {
      description: "눈금자·원근 도우미처럼 캔버스 위에 겹치는 보조선을 켜고 끕니다.",
      tip: "페이지 추가·시퀀스는 ‘만화’ 메뉴의 페이지 관리에 있습니다.",
    },
    rows: [
      gap("크기·해상도·작업 색공간", "문서 설정 패널에만 있다."),
      gap("Crop/Trim", "레이어 자르기는 레이어 메뉴에 있고 캔버스 자르기는 없다."),
      gap("웹툰 세로 캔버스"),
      gap("페이지/아트보드/슬라이드", "페이지 명령은 ‘만화’ 그룹의 Page Manager 로 묶었다."),
      part(
        "그리드·자·퍼스",
        "px 눈금자와 원근 도우미만. 그리드·대칭자는 없다.",
        "canvas/canvas-rulers",
        "canvas/perspective-guide",
      ),
      gap("대칭·만다라"),
      gap("Seamless/Wrap-around"),
    ],
    extras: [],
  },
  {
    id: "layer",
    labelKo: "레이어",
    labelEn: "Layer",
    specName: "Layer",
    inV5Spec: true,
    hintKo: {
      description: "레이어를 추가하고 순서를 바꾸고 잘라냅니다.",
      tip: "메뉴를 열면 오른쪽 패널을 먼저 펼치지 않아도 레이어 순서를 바꿀 수 있습니다.",
    },
    rows: [
      part(
        "Raster/Vector/Text/Balloon/3D/Adjustment/Material",
        "이미지(래스터) 추가만 메뉴에 있다. 나머지 레이어 종류 생성은 우패널 전용이다.",
        "layer/image",
      ),
      gap("Group/Folder"),
      gap("Mask/Clipping", "클리핑 마스크는 인스펙터 체크박스로만 도달한다(감사 §2.2 실패 항목)."),
      part("Reference/Draft/Lock", "나만 숨긴 레이어 복구만 있다.", "layer/reset-local-visibility"),
      gap("Smart Linked Object"),
      gap("Layer Comp"),
      gap("Merge/Flatten with Report"),
    ],
    extras: [
      ours("layer/bring-front", "레이어 · 맨 위로 — §15.3 행에 명시가 없으나 레이어가 정본 위치다."),
      ours("layer/bring-forward", "레이어 · 위로."),
      ours("layer/send-back", "레이어 · 맨 뒤로."),
      ours("layer/send-backward", "레이어 · 뒤로."),
      ours("layer/crop-layer", "레이어 자르기 — §15.3은 Canvas 의 Crop/Trim 만 정의한다."),
    ],
  },
  {
    id: "select",
    labelKo: "선택",
    labelEn: "Select",
    specName: "Select",
    inV5Spec: true,
    hintKo: {
      description: "문서 전체 선택, 선택 해제, 선택 반전을 실행합니다.",
      tip: "사각·올가미 같은 선택 도구 자체는 왼쪽 도구 막대에 있습니다.",
    },
    rows: [
      gap("Rectangle/Ellipse/Lasso/Polygon", "선택 도구는 왼쪽 툴레일에만 있다."),
      gap("Magic Wand/Color Range"),
      gap("Semantic/Object Select"),
      gap("Expand/Shrink/Feather/Smooth"),
      gap("Quick Mask", "`Q` 로만 도달한다. 메뉴 항목이 없다."),
      gap("Save Selection"),
      gap("Selection HUD"),
    ],
    extras: [
      ours("select/select-all", "모두 선택 — §15.3 행에 명시가 없으나 Select 가 정본 위치다."),
      ours("select/deselect", "선택 해제."),
      ours("select/invert-selection", "선택 반전."),
    ],
  },
  {
    id: "transform",
    labelKo: "변형",
    labelEn: "Transform",
    specName: "Transform",
    inV5Spec: true,
    hintKo: { description: "선택 영역과 레이어의 크기·회전·왜곡을 다룹니다." },
    rows: [
      gap("Scale/Rotate/Skew/Perspective", "변형 도구는 툴레일에만 있다(감사 §2.2 실패 항목)."),
      gap("Mesh Warp"),
      gap("Puppet Warp"),
      gap("Liquify", "리퀴파이는 툴레일 도구로만 있다."),
      gap("Content-aware Scale optional"),
      gap("Repeat Transform"),
      gap("Snap/Constraint"),
    ],
    extras: [],
  },
  {
    id: "brush",
    labelKo: "그리기",
    specName: "Brush",
    labelKey: "studio.mainMenu.group.draw.label",
    inV5Spec: true,
    rows: [
      gap("Preset Browser", "브러시 프리셋은 우패널에서만 고른다."),
      gap("Brush Studio/Brush DNA", "Brush Studio 는 인스펙터 런처로만 열린다."),
      gap("Pressure/Tilt/Velocity", "펜 압력 설정은 편집▸Input Device Calibration 이 담당한다."),
      gap("Stabilizer"),
      gap("Tip/Texture/Dual Tip"),
      gap("Natural Media/Pigment"),
      gap("Particle/Physics"),
      gap("Import SUT/ABR/MYB/KPP", "ABR 임포트는 구현돼 있으나 메뉴 진입점이 없다."),
      gap("Fidelity Lab"),
      gap("Team Preset Versioning"),
    ],
    extras: [
      ours("brush/pen", "펜 — §15.3은 도구 활성화를 팔레트로 다루지만 메뉴에서도 1클릭이어야 한다."),
      ours("brush/eraser", "지우개."),
      ours("brush/fill", "채우기."),
      ours("brush/smart-shape", "스마트 도형 — 펜 + 도형 보정 모드."),
      ours("brush/bg", "배경 · 톤."),
      ours("brush/style", "팔레트 · 브랜드."),
    ],
  },
  {
    id: "filter",
    labelKo: "필터",
    specName: "Filter",
    inV5Spec: true,
    rows: [
      gap("Adjustment Layer", "보정은 파괴적으로만 적용된다."),
      has(
        "Color/Blur/Sharpen",
        "filter/gaussian-blur",
        "filter/motion-blur",
        "filter/hue-saturation-brightness",
        "filter/brightness-contrast",
        "filter/color-curves",
        "filter/radial-blur",
        "filter/zoom-blur",
        "filter/surface-blur",
        "filter/lens-blur",
        "filter/field-iris-blur",
        "filter/tilt-shift-blur",
        "filter/selective-gaussian-blur",
        "filter/tileable-blur",
        "filter/solarize",
        "filter/threshold",
        "filter/color-to-alpha",
        "filter/duotone",
      ),
      part(
        "Distort/Liquify",
        "글리치·색수차만. 리퀴파이는 툴레일 도구다.",
        "filter/glitch",
        "filter/chromatic-aberration",
      ),
      has(
        "Line/Tone/Webtoon",
        "filter/line-cleanup",
        "filter/screentone-removal",
        "filter/difference-of-gaussians",
      ),
      has(
        "Texture/Style",
        "filter/mosaic",
        "filter/emboss",
        "filter/oil-paint",
        "filter/scanline",
        "filter/vignette",
        "filter/lens-flare",
        "filter/noise-add",
      ),
      gap("Depth/Normal Effects"),
      gap("Filter Gallery"),
      gap("EffectGraph Editor"),
      gap("Bake/Proxy"),
    ],
    extras: [
      ours("filter/last-filter", "마지막 필터 다시 열기 — §15.3 Edit 의 ‘명령 반복’에 가까운 필터 전용판."),
      ours("filter/jpeg-artifact-reduction", "복원 계열 — §15.3 행이 없다."),
      ours("filter/edge-aware-denoise", "복원 계열."),
      ours("filter/dust-scratches", "복원 계열."),
    ],
  },
  {
    id: "vector",
    labelKo: "벡터",
    labelEn: "Vector",
    specName: "Vector",
    inV5Spec: true,
    hintKo: { description: "도형·프레임·화살표 같은 벡터 요소를 캔버스에 놓습니다." },
    rows: [
      part("Pen/Bezier/Shape", "SVG 도형·프레임 배치만. 베지어 편집은 없다.", "vector/elements"),
      gap("Anchor/Width/Edit Stroke"),
      gap("Boolean/Offset/Trim"),
      gap("Vector Eraser"),
      gap("Live Appearance"),
      gap("Pattern Along Path"),
      gap("Vectorize Raster"),
    ],
    extras: [],
  },
  {
    id: "text",
    labelKo: "텍스트",
    labelEn: "Text",
    specName: "Text & Balloon",
    inV5Spec: true,
    hintKo: {
      description: "대사 텍스트와 말풍선을 추가합니다.",
      tip: "말풍선을 먼저 놓고 안쪽을 두 번 눌러 대사를 입력하세요.",
    },
    rows: [
      has("CJK Text", "text/text"),
      gap("Vertical Writing/Ruby/Kinsoku"),
      gap("Paragraph/Style"),
      has("Balloon/Leader/Tail", "text/bubble"),
      gap("Dialogue Link"),
      gap("Localization Layout"),
      gap("Font Report"),
    ],
    extras: [],
  },
  {
    id: "comic",
    labelKo: "만화",
    labelEn: "Comic",
    specName: "Comic & Story",
    inV5Spec: true,
    hintKo: {
      description: "페이지를 추가하고 시퀀스를 열어 회차 전체를 관리합니다.",
      tip: "콜라주는 여러 칸을 한 번에 배치할 때 씁니다.",
    },
    rows: [
      part("Panel/Frame Border", "콜라주 레이아웃만. 칸 테두리 편집은 없다.", "comic/collage"),
      gap("Tone/Focus/Speed Lines", "톤·집중선은 필터와 배경 메뉴에 흩어져 있다."),
      has("Page Manager", "comic/page", "comic/page-sequence"),
      gap("Script/Shot/Panel"),
      gap("Continuity Check"),
      gap("Scroll Rhythm"),
      gap("Story Bible"),
      gap("Animatic"),
    ],
    extras: [],
  },
  {
    id: "animation",
    labelKo: "애니메이션",
    labelEn: "Animation",
    specName: "Animation",
    inV5Spec: true,
    hintKo: { description: "타임라인과 프레임 편집." },
    rows: [
      gap("Timeline"),
      gap("Frame/Cel"),
      gap("Rig/Puppet"),
      gap("State Machine"),
      gap("Onion Skin"),
      gap("Audio/Markers"),
      gap("Motion Capture"),
      gap("Export GIF/Video/Sequence/OTIO"),
    ],
    extras: [],
  },
  {
    id: "3d",
    labelKo: "3D",
    labelEn: "3D",
    specName: "3D & Physics",
    inV5Spec: true,
    hintKo: {
      description: "데생 인형·3D 캐릭터·3D 배경을 불러와 각도를 잡습니다.",
      tip: "포즈를 잡은 뒤 캔버스로 굽고 그 위에 선을 따세요.",
    },
    rows: [
      gap("Scene/Outliner"),
      has("VRM/Pose/Expression", "3d/mannequin3d", "3d/char"),
      gap("Camera/Light"),
      part("Room Builder", "3D 배경 패널 안에서만 구성한다.", "3d/bg3d"),
      gap("Modeling/Boolean"),
      gap("Physics/Cloth/Hair"),
      gap("3D→2D Pass", "굽기는 3D 패널 안에 있고 메뉴 항목이 없다."),
      gap("Surface Paint"),
      gap("Camera Tracking"),
    ],
    extras: [],
  },
  {
    id: "collaboration",
    labelKo: "협업",
    labelEn: "Collaboration",
    specName: "Collaboration",
    inV5Spec: true,
    hintKo: { description: "공유·권한·리뷰 세션." },
    rows: [
      gap("Share/Permission", "팀 작업공간 버튼으로만 도달한다."),
      gap("Presence/Soft Lock", "동작하지만 메뉴 항목이 없다."),
      gap("Comment/Paint-over", "댓글 도구는 툴레일에만 있다."),
      gap("Proposal Branch"),
      gap("Version Compare"),
      gap("Approval"),
      gap("Review Session"),
      gap("Audit Log"),
    ],
    extras: [],
  },
  {
    id: "window",
    labelKo: "창",
    labelEn: "Window",
    specName: "Window",
    inV5Spec: true,
    hintKo: {
      description: "패널을 여닫고 작업공간 밀도와 보조 창을 고릅니다.",
      tip: "‘캔버스만’은 ` 키로도 바로 들어갑니다.",
    },
    rows: [
      part(
        "Workspace Profile",
        "UI 밀도 2종과 보조 창만. §15.2 프로파일 12종 전환은 메뉴 밖이다.",
        "window/density-focus",
        "window/density-full",
        "window/tools-companion",
      ),
      part(
        "Panel Docking",
        "열고 닫기만. 도킹 재배치는 없다.",
        "window/left-panel",
        "window/right-panel",
        "window/wide",
        "window/canvas-only",
      ),
      has("Quick Deck", "window/quick-access-palette"),
      gap("Action Bar", "하단 액션바는 상시 노출이라 전환 명령이 없다."),
      part("Asset Vault", "템플릿·에셋 패널.", "window/template"),
      part("Reference Desk", "참고 이미지 삽입과 참고 창 토글.", "window/ref", "window/reference-window"),
      gap("Capability Center"),
      gap("Diagnostics"),
    ],
    extras: [
      ours(
        "window/app-settings-window",
        "애플리케이션 설정 — 편집▸Preferences 와 같은 대화상자를 여는 두 번째 진입점. 현행 동작 보존을 위해 남겼고 id 만 전역 유일하게 바꿨다.",
      ),
    ],
  },
  {
    id: "ai",
    labelKo: "AI",
    specName: "(§15.3 미정의 · 제품 고유)",
    inV5Spec: false,
    rows: [],
    extras: [
      ours("ai/ai-assist", "AI 어시스트 — §15.3에 대응 그룹이 없어 제품 고유 그룹으로 남긴다."),
      ours("ai/stock", "스톡 이미지."),
      ours("ai/integrations", "연동 설정."),
    ],
  },
  {
    id: "help",
    labelKo: "도움말",
    specName: "Help",
    inV5Spec: true,
    rows: [
      gap("Command Search", "통합 명령 검색이 없다(감사 §2.8)."),
      gap("Current Tool Help"),
      part("Tutorial Project", "기능 튜토리얼 허브. 튜토리얼 ‘프로젝트’는 아니다.", "help/feature-tutorials"),
      gap("CSP/Photoshop terminology search"),
      gap("Device/Browser Diagnosis"),
      gap("Recovery Guide"),
      gap("License/Attribution"),
      gap("Bug Report Package"),
    ],
    extras: [ours("help/shortcuts", "단축키 · 기본 조작.")],
  },
]);

/** Menubar order. §15.3 order, with the product-only AI group before Window. */
export const STUDIO_MENU_GROUP_ORDER: readonly string[] = Object.freeze(
  STUDIO_MENU_GROUP_SPEC.map((group) => group.id),
);

export function studioMenuGroupSpec(id: string): StudioMenuGroupSpec | undefined {
  return STUDIO_MENU_GROUP_SPEC.find((group) => group.id === id);
}

/** Every qualified item id this table claims for a group, rows first then extras. */
export function studioMenuSpecClaimedItems(groupId: string): readonly string[] {
  const group = studioMenuGroupSpec(groupId);
  if (!group) return [];
  return [
    ...group.rows.flatMap((row) => row.items),
    ...group.extras.map((extra) => extra.item),
  ];
}

export interface StudioMenuSpecCoverageSummary {
  readonly specGroups: number;
  readonly groupsWithItems: number;
  readonly emptyGroupIds: readonly string[];
  readonly specRows: number;
  readonly rowsPresent: number;
  readonly rowsPartial: number;
  readonly rowsAbsent: number;
  readonly extras: number;
}

export function studioMenuSpecCoverageSummary(): StudioMenuSpecCoverageSummary {
  const spec = STUDIO_MENU_GROUP_SPEC.filter((group) => group.inV5Spec);
  const rows = spec.flatMap((group) => group.rows);
  const empty = spec.filter((group) => studioMenuSpecClaimedItems(group.id).length === 0);
  return {
    specGroups: spec.length,
    groupsWithItems: spec.length - empty.length,
    emptyGroupIds: empty.map((group) => group.id),
    specRows: rows.length,
    rowsPresent: rows.filter((row) => row.coverage === "present").length,
    rowsPartial: rows.filter((row) => row.coverage === "partial").length,
    rowsAbsent: rows.filter((row) => row.coverage === "absent").length,
    extras: STUDIO_MENU_GROUP_SPEC.reduce((sum, group) => sum + group.extras.length, 0),
  };
}

/** §15.3 rows we ship nothing for, as `Group ▸ row`. The Wave C shortfall list. */
export function studioMenuSpecMissingRows(): readonly string[] {
  return STUDIO_MENU_GROUP_SPEC.filter((group) => group.inV5Spec).flatMap((group) =>
    group.rows
      .filter((row) => row.coverage === "absent")
      .map((row) => `${group.specName} ▸ ${row.spec}`),
  );
}
