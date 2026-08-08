/**
 * Studio Command Catalog — the single declaration that the five hand-maintained
 * command lists collapse into.
 *
 * This file is **declaration data only**. It carries no `execute`, no React, no
 * store access; wiring the entries into `CommandRegistry` and retiring the old
 * lists happens in later waves (see `docs/rewrite/command-consolidation-plan.md`).
 * Keeping it inert is what lets the coverage tests run against the live lists
 * without dragging StudioPage into the test graph.
 *
 * Provenance rule: every entry records **which of the five lists it came from**
 * (`origins`). Nothing is silently merged — where two lists disagree on an id, a
 * shortcut or a behaviour, the disagreement is recorded in `COMMAND_CONFLICTS`
 * rather than resolved by picking a winner here.
 *
 * Measured 2026-08-08 against:
 * - `studio-main-menu-groups.ts`      8 groups / 116 items
 * - `studio-edit-controls.ts`         STUDIO_EDIT_MENU_COMMANDS, 20 entries
 * - `studio-quick-access-integration.ts` STUDIO_QUICK_ACCESS_COMMAND_IDS, 18
 * - `studio-quick-actions.ts`         QUICK_ACTION_IDS, 16
 * - `studio-app-settings.ts`          STUDIO_SHORTCUT_ACTIONS, 34
 * - `StudioShortcutsHelp.tsx`         GROUPS, 37 rows
 */

import type {
  CommandId,
  LocaleTag,
  LocalizedLabel,
  TerminologyAlias,
  TerminologyVendor,
} from "@toonspectrum/studio-command-registry";

/* ------------------------------------------------------------------ types */

export type StudioCommandSource =
  | "menu"
  | "edit-menu"
  | "quick-access"
  | "radial"
  | "keymap"
  | "help";

/**
 * `wired` — a reachable execution path exists.
 * `dead` — the entry exists in its list but nothing routes to it.
 * `advertised-only` — a chord is displayed but no handler claims it.
 * `documented-only` — a help row that describes host behaviour, not a command.
 */
export type StudioCommandOriginStatus =
  | "wired"
  | "dead"
  | "advertised-only"
  | "documented-only";

export interface StudioCommandOrigin {
  source: StudioCommandSource;
  /**
   * The id exactly as the source list spells it. Menu items are qualified
   * `<group>/<item>` because menu item ids are **not** globally unique
   * (see conflict `menu-item-id-collision`). Help rows use their `labelKey`
   * suffix.
   */
  nativeId: string;
  /** Chord as that list advertises it — display text, not a parsed chord. */
  shortcut?: string;
  status?: StudioCommandOriginStatus;
  note?: string;
}

export interface StudioCommandCatalogEntry {
  id: CommandId;
  /** Namespace segment of `id`. §15.3 menu group where one exists. */
  category: string;
  labels: readonly LocalizedLabel[];
  aliases: readonly TerminologyAlias[];
  /** Chord this command should own after consolidation. */
  shortcut?: string;
  helpNodeId: string;
  origins: readonly StudioCommandOrigin[];
  note?: string;
}

export type StudioCommandConflictKind =
  /** One chord claimed by two different commands. */
  | "shortcut-collision"
  /** One command documented with different chords across lists. */
  | "shortcut-divergence"
  /** One command called by different ids across lists. */
  | "id-divergence"
  /** Same name or chord, different observable result. */
  | "behavior-divergence"
  /** A chord is displayed but nothing binds it. */
  | "unbound-shortcut"
  /** The entry exists but is unreachable. */
  | "dead-entry"
  /** One source row stands in for more than one command. */
  | "row-covers-multiple-commands";

export interface StudioCommandConflict {
  id: string;
  kind: StudioCommandConflictKind;
  /** Chord involved, when the conflict is about a chord. */
  key?: string;
  commandIds: readonly CommandId[];
  detail: string;
  /** file:line evidence, measured — not inferred. */
  evidence: readonly string[];
  /** Intended resolution; the absorbing wave is expected to implement it. */
  resolution: string;
}

export interface StudioCommandSourceInfo {
  label: string;
  file: string;
  declarationRef: string;
  /** Entry count measured 2026-08-08. Drift guards assert against this. */
  measuredCount: number;
}

/* ---------------------------------------------------------------- helpers */

const ko = (label: string, description?: string): LocalizedLabel =>
  description === undefined ? { locale: "ko", label } : { locale: "ko", label, description };

const en = (label: string, description?: string): LocalizedLabel =>
  description === undefined ? { locale: "en", label } : { locale: "en", label, description };

const vendorAlias =
  (vendor: TerminologyVendor, locale: LocaleTag) =>
  (term: string, note?: string): TerminologyAlias =>
    note === undefined ? { vendor, term, locale } : { vendor, term, locale, note };

/** CLIP STUDIO PAINT (Korean UI). */
const csp = vendorAlias("csp", "ko");
/** CLIP STUDIO PAINT (English UI). */
const cspEn = vendorAlias("csp", "en");
const ps = vendorAlias("photoshop", "en");
const krita = vendorAlias("krita", "en");
const procreate = vendorAlias("procreate", "en");
/** Our own legacy wording, kept searchable so renames do not orphan habits. */
const ours = vendorAlias("toonstudio", "ko");

const helpNode = (id: CommandId): string => `help/${id.replace(/\./gu, "/")}`;

interface CommandSpec {
  id: CommandId;
  labels: readonly LocalizedLabel[];
  aliases?: readonly TerminologyAlias[];
  shortcut?: string;
  helpNodeId?: string;
  origins: readonly StudioCommandOrigin[];
  note?: string;
}

function defineCommand(spec: CommandSpec): StudioCommandCatalogEntry {
  return {
    id: spec.id,
    category: spec.id.split(".")[0] ?? "",
    labels: spec.labels,
    aliases: spec.aliases ?? [],
    ...(spec.shortcut === undefined ? {} : { shortcut: spec.shortcut }),
    helpNodeId: spec.helpNodeId ?? helpNode(spec.id),
    origins: spec.origins,
    ...(spec.note === undefined ? {} : { note: spec.note }),
  };
}

const menu = (
  nativeId: string,
  extra: Omit<StudioCommandOrigin, "source" | "nativeId"> = {},
): StudioCommandOrigin => ({ source: "menu", nativeId, ...extra });

const editMenu = (
  nativeId: string,
  extra: Omit<StudioCommandOrigin, "source" | "nativeId"> = {},
): StudioCommandOrigin => ({ source: "edit-menu", nativeId, ...extra });

const quickAccess = (
  nativeId: string,
  extra: Omit<StudioCommandOrigin, "source" | "nativeId"> = {},
): StudioCommandOrigin => ({ source: "quick-access", nativeId, ...extra });

const radial = (
  nativeId: string,
  extra: Omit<StudioCommandOrigin, "source" | "nativeId"> = {},
): StudioCommandOrigin => ({ source: "radial", nativeId, ...extra });

const keymap = (
  nativeId: string,
  extra: Omit<StudioCommandOrigin, "source" | "nativeId"> = {},
): StudioCommandOrigin => ({ source: "keymap", nativeId, ...extra });

const help = (
  nativeId: string,
  extra: Omit<StudioCommandOrigin, "source" | "nativeId"> = {},
): StudioCommandOrigin => ({ source: "help", nativeId, ...extra });

/* ------------------------------------------------------------- inventories */

export const STUDIO_COMMAND_SOURCES: Readonly<
  Record<StudioCommandSource, StudioCommandSourceInfo>
> = Object.freeze({
  menu: {
    label: "메인 메뉴",
    file: "src/domains/creator/studio-main-menu-groups.ts",
    declarationRef: "studio-main-menu-groups.ts:228-1121 (buildStudioMainMenuGroups)",
    measuredCount: 116,
  },
  "edit-menu": {
    label: "편집 메뉴 명령 테이블",
    file: "src/domains/creator/studio-edit-controls.ts",
    declarationRef: "studio-edit-controls.ts:6-111 (STUDIO_EDIT_MENU_COMMANDS)",
    measuredCount: 20,
  },
  "quick-access": {
    label: "⇧Q 빠른 액세스 팔레트",
    file: "src/domains/creator/studio-quick-access-integration.ts",
    declarationRef:
      "studio-quick-access-integration.ts:10-28 (STUDIO_QUICK_ACCESS_COMMAND_IDS)",
    measuredCount: 18,
  },
  radial: {
    label: "라디얼 퀵 액션",
    file: "src/domains/creator/studio-quick-actions.ts",
    declarationRef: "studio-quick-actions.ts:19-35 (QUICK_ACTION_IDS)",
    measuredCount: 16,
  },
  keymap: {
    label: "커스터마이즈 키맵",
    file: "src/domains/creator/studio-app-settings.ts",
    declarationRef: "studio-app-settings.ts:82-117 (STUDIO_SHORTCUT_ACTIONS)",
    measuredCount: 34,
  },
  help: {
    label: "단축키 도움말",
    file: "src/domains/creator/StudioShortcutsHelp.tsx",
    declarationRef: "StudioShortcutsHelp.tsx:34-146 (GROUPS)",
    measuredCount: 37,
  },
});

/**
 * Menu items, qualified `<group>/<item>`, in declaration order.
 * Not importable at test time (the builder needs the whole StudioPage state), so
 * this snapshot plus a source-file drift guard stands in for a live import.
 */
export const STUDIO_MENU_ITEM_INVENTORY: readonly string[] = Object.freeze([
  // file (10) — studio-main-menu-groups.ts:230-325
  "file/save-draft",
  "file/publish",
  "file/import-json",
  "file/import-psd",
  "file/import-ora-cbz",
  "file/project",
  "file/export",
  "file/copy-image",
  "file/export-json",
  "file/export-archive",
  // edit (20) — spread from STUDIO_EDIT_MENU_COMMANDS, :330-497
  "edit/undo",
  "edit/redo",
  "edit/cut",
  "edit/copy",
  "edit/paste",
  "edit/paste-in-place",
  "edit/paste-file",
  "edit/select-all",
  "edit/deselect",
  "edit/invert-selection",
  "edit/clear-selection",
  "edit/duplicate",
  "edit/bring-front",
  "edit/bring-forward",
  "edit/send-back",
  "edit/send-backward",
  "edit/crop-layer",
  "edit/history",
  "edit/pen-pressure",
  "edit/app-settings",
  // insert (11) — :500-593
  "insert/template",
  "insert/collage",
  "insert/elements",
  "insert/bubble",
  "insert/text",
  "insert/image",
  "insert/mannequin3d",
  "insert/char",
  "insert/bg3d",
  "insert/ref",
  "insert/page",
  // view (31) — :596-877
  "view/zoom-in",
  "view/zoom-out",
  "view/flip-horizontal",
  "view/rotate-left",
  "view/rotate-right",
  "view/reset-rotation",
  "view/fit",
  "view/actual-pixels",
  "view/canvas-rulers",
  "view/fullscreen",
  "view/color-vision-original",
  "view/color-vision-grayscale",
  "view/color-vision-protanopia",
  "view/color-vision-deuteranopia",
  "view/color-vision-tritanopia",
  "view/reference-window",
  "view/page-sequence",
  "view/save-current-view",
  "view/restore-view",
  "view/perspective-guide",
  "view/reset-local-visibility",
  "view/production-insights",
  "view/density-focus",
  "view/density-full",
  "view/wide",
  "view/tools-companion",
  "view/canvas-only",
  "view/quick-access-palette",
  "view/left-panel",
  "view/right-panel",
  "view/app-settings",
  // filter (33) — :880-1000
  "filter/last-filter",
  "filter/gaussian-blur",
  "filter/motion-blur",
  "filter/hue-saturation-brightness",
  "filter/brightness-contrast",
  "filter/color-curves",
  "filter/mosaic",
  "filter/radial-blur",
  "filter/zoom-blur",
  "filter/chromatic-aberration",
  "filter/glitch",
  "filter/scanline",
  "filter/vignette",
  "filter/lens-flare",
  "filter/emboss",
  "filter/solarize",
  "filter/threshold",
  "filter/oil-paint",
  "filter/surface-blur",
  "filter/lens-blur",
  "filter/field-iris-blur",
  "filter/tilt-shift-blur",
  "filter/selective-gaussian-blur",
  "filter/tileable-blur",
  "filter/line-cleanup",
  "filter/screentone-removal",
  "filter/jpeg-artifact-reduction",
  "filter/edge-aware-denoise",
  "filter/dust-scratches",
  "filter/difference-of-gaussians",
  "filter/color-to-alpha",
  "filter/duotone",
  "filter/noise-add",
  // draw (6) — :1003-1058
  "draw/pen",
  "draw/eraser",
  "draw/fill",
  "draw/smart-shape",
  "draw/bg",
  "draw/style",
  // ai (3) — :1061-1088
  "ai/ai-assist",
  "ai/stock",
  "ai/integrations",
  // help (2) — :1091-1118
  "help/feature-tutorials",
  "help/shortcuts",
]);

/**
 * Help rows by `labelKey` suffix (the part after `studio.shortcuts.row.`), in
 * declaration order. `StudioShortcutsHelp.tsx` does not export `GROUPS`, so this
 * snapshot plus a drift guard stands in for a live import.
 */
export const STUDIO_HELP_ROW_INVENTORY: readonly string[] = Object.freeze([
  // drawing (11)
  "drawing.pen",
  "drawing.eraser",
  "drawing.blendWet",
  "drawing.dodgeBurn",
  "drawing.brushSize",
  "drawing.brushSizeStep",
  "drawing.opacity",
  "drawing.recentBrushSlots",
  "drawing.saveBrushSlot",
  "drawing.straighten",
  "drawing.swapColors",
  // edit (14)
  "edit.text",
  "edit.confirmBubble",
  "edit.undo",
  "edit.redo",
  "edit.cutCopy",
  "edit.paste",
  "edit.selectAll",
  "edit.deselect",
  "edit.invert",
  "edit.quickMask",
  "edit.duplicate",
  "edit.fill",
  "edit.delete",
  "edit.cancel",
  // layers (4)
  "layers.forward",
  "layers.backward",
  "layers.move1px",
  "layers.move10px",
  // view (8)
  "view.zoomIn",
  "view.zoomOut",
  "view.zoomFit",
  "view.zoomAtPointer",
  "view.pan",
  "view.toggleCanvas",
  "view.flipCanvas",
  "view.help",
]);

/* ----------------------------------------------------------------- catalog */

export const STUDIO_COMMAND_CATALOG: readonly StudioCommandCatalogEntry[] =
  Object.freeze([
    /* ---------------------------------------------------------------- file */
    defineCommand({
      id: "file.save-draft",
      labels: [ko("임시저장", "현재 원고를 임시저장합니다."), en("Save draft")],
      aliases: [csp("저장"), cspEn("Save"), ps("Save"), krita("Save"), procreate("자동 저장", "Procreate saves continuously; no explicit command.")],
      shortcut: "⌘S",
      origins: [
        menu("file/save-draft", {
          shortcut: "⌘S",
          status: "advertised-only",
          note: "studio-main-menu-groups.ts:237 은 ⌘S 를 표시하지만 KeyS+meta 핸들러가 없다.",
        }),
        quickAccess("save", { shortcut: "⌘S", status: "advertised-only" }),
      ],
    }),
    defineCommand({
      id: "file.publish",
      labels: [ko("게시 · 수정 게시"), en("Publish")],
      aliases: [ps("Publish"), ours("게시")],
      origins: [menu("file/publish")],
    }),
    defineCommand({
      id: "file.import-project",
      labels: [ko("프로젝트 가져오기…"), en("Import project…")],
      aliases: [csp("가져오기"), ps("Open"), krita("Open")],
      origins: [menu("file/import-json")],
    }),
    defineCommand({
      id: "file.import-psd",
      labels: [ko("PSD 가져오기…"), en("Import PSD…")],
      aliases: [csp("PSD 가져오기"), ps("Open PSD"), krita("Import PSD")],
      origins: [menu("file/import-psd")],
    }),
    defineCommand({
      id: "file.import-interchange",
      labels: [ko("ORA · CBZ · WILL 가져오기…"), en("Import ORA · CBZ · WILL…")],
      aliases: [krita("Open ORA"), csp("파일 가져오기")],
      origins: [menu("file/import-ora-cbz")],
    }),
    defineCommand({
      id: "file.project-tools",
      labels: [ko("프로젝트 도구…"), en("Project tools…")],
      aliases: [csp("작품 관리"), ps("Bridge")],
      origins: [menu("file/project")],
    }),
    defineCommand({
      id: "file.export",
      labels: [ko("내보내기 / 다운로드"), en("Export / download")],
      aliases: [csp("내보내기"), cspEn("Export"), ps("Export As"), krita("Export"), procreate("Share")],
      origins: [
        menu("file/export", {
          note: "메뉴는 setExportMenuOpen(true), 메뉴바는 토글 — 같은 명령이 다른 의미(DUP-LOGIC 4사이트).",
        }),
      ],
    }),
    defineCommand({
      id: "file.copy-image-to-clipboard",
      labels: [ko("이미지를 클립보드로"), en("Copy image to clipboard")],
      aliases: [ps("Copy Merged"), krita("Copy Merged")],
      origins: [menu("file/copy-image")],
    }),
    defineCommand({
      id: "file.export-backup",
      labels: [ko("백업 (.json)"), en("Backup (.json)")],
      aliases: [ours("백업")],
      origins: [menu("file/export-json")],
    }),
    defineCommand({
      id: "file.export-archive",
      labels: [ko("아카이브 백업"), en("Archive backup")],
      aliases: [ours("아카이브")],
      origins: [menu("file/export-archive")],
    }),

    /* ---------------------------------------------------------------- edit */
    defineCommand({
      id: "edit.undo",
      labels: [ko("실행취소"), en("Undo")],
      aliases: [csp("실행 취소"), cspEn("Undo"), ps("Undo"), krita("Undo"), procreate("두 손가락 탭")],
      shortcut: "⌘Z",
      origins: [
        menu("edit/undo", { shortcut: "⌘Z" }),
        editMenu("undo", { shortcut: "⌘Z" }),
        keymap("undo", {
          shortcut: "Mod+Z",
          status: "dead",
          note: "studio-app-settings.ts:104 — 실제 실행은 StudioPage.tsx:23821 하드코딩이라 재매핑이 먹지 않는다.",
        }),
        radial("undo"),
        quickAccess("undo", { shortcut: "⌘Z" }),
        help("edit.undo", { shortcut: "⌘Z" }),
      ],
    }),
    defineCommand({
      id: "edit.redo",
      labels: [ko("다시실행"), en("Redo")],
      aliases: [csp("다시 실행"), cspEn("Redo"), ps("Redo"), krita("Redo"), procreate("세 손가락 탭")],
      shortcut: "⌘⇧Z",
      origins: [
        menu("edit/redo", { shortcut: "⌘⇧Z" }),
        editMenu("redo", { shortcut: "⌘⇧Z" }),
        keymap("redo", {
          shortcut: "Mod+Shift+Z",
          status: "dead",
          note: "studio-app-settings.ts:105 — undo 와 같은 이유로 dead.",
        }),
        radial("redo"),
        quickAccess("redo", { shortcut: "⇧⌘Z" }),
        help("edit.redo", { shortcut: "⌘⇧Z · ⌘Y" }),
      ],
    }),
    defineCommand({
      id: "edit.cut",
      labels: [ko("잘라내기"), en("Cut")],
      aliases: [csp("잘라내기"), ps("Cut"), krita("Cut")],
      shortcut: "⌘X",
      origins: [
        menu("edit/cut", { shortcut: "⌘X" }),
        editMenu("cut", { shortcut: "⌘X" }),
        help("edit.cutCopy", { shortcut: "⌘X · ⌘C" }),
      ],
    }),
    defineCommand({
      id: "edit.copy",
      labels: [ko("복사"), en("Copy")],
      aliases: [csp("복사"), ps("Copy"), krita("Copy"), procreate("Copy")],
      shortcut: "⌘C",
      origins: [
        menu("edit/copy", { shortcut: "⌘C" }),
        editMenu("copy", { shortcut: "⌘C" }),
        help("edit.cutCopy", { shortcut: "⌘X · ⌘C" }),
      ],
    }),
    defineCommand({
      id: "edit.paste",
      labels: [ko("붙여넣기"), en("Paste")],
      aliases: [csp("붙여넣기"), ps("Paste"), krita("Paste"), procreate("Paste")],
      shortcut: "⌘V",
      origins: [
        menu("edit/paste", { shortcut: "⌘V" }),
        editMenu("paste", { shortcut: "⌘V" }),
        help("edit.paste", { shortcut: "⌘V · ⌘⇧V" }),
      ],
    }),
    defineCommand({
      id: "edit.paste-in-place",
      labels: [ko("현재 위치에 붙여넣기"), en("Paste in place")],
      aliases: [ps("Paste in Place"), krita("Paste in Place"), csp("같은 위치에 붙여넣기")],
      shortcut: "⌘⇧V",
      origins: [
        menu("edit/paste-in-place", { shortcut: "⌘⇧V" }),
        editMenu("paste-in-place", { shortcut: "⌘⇧V" }),
        help("edit.paste", { shortcut: "⌘V · ⌘⇧V" }),
      ],
    }),
    defineCommand({
      id: "edit.paste-file",
      labels: [ko("이미지 파일 붙여넣기…"), en("Paste image file…")],
      aliases: [ps("Place Embedded"), csp("파일에서 읽어들이기")],
      origins: [menu("edit/paste-file"), editMenu("paste-file")],
    }),
    defineCommand({
      id: "edit.duplicate",
      labels: [ko("복제"), en("Duplicate")],
      aliases: [csp("복제"), ps("Duplicate"), krita("Duplicate"), procreate("Duplicate")],
      shortcut: "⌘J",
      origins: [
        menu("edit/duplicate", { shortcut: "⌘J" }),
        editMenu("duplicate", { shortcut: "⌘J" }),
        radial("duplicate"),
        quickAccess("duplicate", {
          shortcut: "⌘D",
          note: "⌘D 는 선택 해제(select.deselect)가 이미 주장한다 — conflict `cmd-d-duplicate-vs-deselect`.",
        }),
        help("edit.duplicate", { shortcut: "⌘J" }),
      ],
    }),
    defineCommand({
      id: "edit.clear-selection",
      labels: [ko("선택 제거", "선택 영역의 내용을 지웁니다."), en("Clear selection")],
      aliases: [ps("Clear"), krita("Clear"), csp("삭제")],
      shortcut: "Delete",
      origins: [
        menu("edit/clear-selection", { shortcut: "Delete" }),
        editMenu("clear-selection", { shortcut: "Delete" }),
        help("edit.delete", { shortcut: "Delete · ⌫" }),
      ],
      note: "라디얼·팔레트의 `delete`(요소 삭제)와 다른 명령이다 — conflict `delete-clear-vs-remove`.",
    }),
    defineCommand({
      id: "edit.delete-selection",
      labels: [ko("선택 삭제", "선택한 요소를 삭제합니다."), en("Delete selection")],
      aliases: [ps("Delete Layer"), csp("레이어 삭제"), procreate("Delete")],
      shortcut: "Delete",
      origins: [
        radial("delete"),
        quickAccess("delete", { shortcut: "Delete" }),
      ],
      note: "키보드 Del 경로만 말풍선 포인트 / 픽셀 영역 / 엘리먼트 3분기를 갖는다(StudioPage.tsx:24030-24058).",
    }),
    defineCommand({
      id: "edit.crop-layer",
      labels: [ko("레이어 자르기…"), en("Crop layer…")],
      aliases: [ps("Crop"), csp("자르기"), krita("Crop Layer")],
      origins: [menu("edit/crop-layer"), editMenu("crop-layer")],
    }),
    defineCommand({
      id: "edit.history",
      labels: [ko("작업 내역"), en("History")],
      aliases: [csp("히스토리"), ps("History"), krita("Undo History")],
      origins: [menu("edit/history"), editMenu("history")],
    }),
    defineCommand({
      id: "edit.pen-pressure",
      labels: [ko("펜 압력 설정…"), en("Pen pressure settings…")],
      aliases: [csp("필압 검지 레벨 조절"), ps("Pen Pressure"), krita("Tablet Settings")],
      origins: [menu("edit/pen-pressure"), editMenu("pen-pressure")],
    }),
    defineCommand({
      id: "edit.cancel",
      labels: [ko("현재 조작 취소"), en("Cancel current interaction")],
      aliases: [ps("Escape"), krita("Cancel")],
      shortcut: "Esc",
      origins: [help("edit.cancel", { shortcut: "Esc" })],
    }),
    defineCommand({
      id: "edit.confirm-balloon",
      labels: [ko("말풍선 입력 확정"), en("Confirm balloon text")],
      aliases: [csp("텍스트 확정"), ps("Commit Text")],
      shortcut: "⌘Enter",
      origins: [help("edit.confirmBubble", { shortcut: "⌘ Enter" })],
    }),

    /* -------------------------------------------------------------- select */
    defineCommand({
      id: "select.all",
      labels: [ko("모두 선택"), en("Select all")],
      aliases: [csp("모두 선택"), ps("Select All"), krita("Select All"), procreate("Select All")],
      shortcut: "⌘A",
      origins: [
        menu("edit/select-all", { shortcut: "⌘A" }),
        editMenu("select-all", { shortcut: "⌘A" }),
        help("edit.selectAll", { shortcut: "⌘A" }),
      ],
    }),
    defineCommand({
      id: "select.deselect",
      labels: [ko("선택 해제"), en("Deselect")],
      aliases: [csp("선택 해제"), ps("Deselect"), krita("Deselect"), procreate("Clear")],
      shortcut: "⌘D",
      origins: [
        menu("edit/deselect", { shortcut: "⌘D" }),
        editMenu("deselect", { shortcut: "⌘D" }),
        keymap("deselect-pixels", { shortcut: "Mod+D" }),
        help("edit.deselect", { shortcut: "⌘D" }),
      ],
    }),
    defineCommand({
      id: "select.invert",
      labels: [ko("선택 반전"), en("Invert selection")],
      aliases: [csp("선택 범위 반전"), ps("Inverse"), krita("Invert Selection"), procreate("Invert")],
      shortcut: "⌘⇧I",
      origins: [
        menu("edit/invert-selection", { shortcut: "⌘⇧I" }),
        editMenu("invert-selection", { shortcut: "⌘⇧I" }),
        keymap("invert-pixels", { shortcut: "Mod+Shift+I" }),
        help("edit.invert", { shortcut: "⌘⇧I" }),
      ],
    }),
    defineCommand({
      id: "select.quick-mask",
      labels: [ko("퀵 마스크"), en("Quick mask")],
      aliases: [csp("퀵 마스크"), ps("Quick Mask Mode"), krita("Global Selection Mask")],
      shortcut: "Q",
      origins: [
        radial("quick-mask"),
        quickAccess("quick-mask", { shortcut: "Q" }),
        help("edit.quickMask", { shortcut: "Q" }),
      ],
      note: "`Q` 를 view.color-vision-grayscale 도 주장한다 — conflict `q-quickmask-vs-grayscale`.",
    }),

    /* --------------------------------------------------------------- layer */
    defineCommand({
      id: "layer.bring-front",
      labels: [ko("레이어 · 맨 위로"), en("Bring to front")],
      aliases: [csp("맨 앞으로"), ps("Bring to Front"), krita("Move Layer to Top")],
      shortcut: "⌘⇧]",
      origins: [
        menu("edit/bring-front", { shortcut: "⌘⇧]" }),
        editMenu("bring-front", { shortcut: "⌘⇧]" }),
        radial("bring-front"),
        quickAccess("bring-front"),
        help("layers.forward", { shortcut: "⌘] · ⌘⇧]" }),
      ],
    }),
    defineCommand({
      id: "layer.bring-forward",
      labels: [ko("레이어 · 위로"), en("Bring forward")],
      aliases: [csp("앞으로"), ps("Bring Forward"), krita("Raise Layer")],
      shortcut: "⌘]",
      origins: [
        menu("edit/bring-forward", { shortcut: "⌘]" }),
        editMenu("bring-forward", { shortcut: "⌘]" }),
        help("layers.forward", { shortcut: "⌘] · ⌘⇧]" }),
      ],
    }),
    defineCommand({
      id: "layer.send-back",
      labels: [ko("레이어 · 맨 뒤로"), en("Send to back")],
      aliases: [csp("맨 뒤로"), ps("Send to Back"), krita("Move Layer to Bottom")],
      shortcut: "⌘[",
      origins: [
        menu("edit/send-back", { shortcut: "⌘[" }),
        editMenu("send-back", { shortcut: "⌘[" }),
        help("layers.backward", { shortcut: "⌘[ · ⌘⇧[" }),
      ],
      note: "Photoshop 은 맨 뒤로가 ⌘⇧[ 다 — conflict `layer-order-chord-inversion`.",
    }),
    defineCommand({
      id: "layer.send-backward",
      labels: [ko("레이어 · 뒤로"), en("Send backward")],
      aliases: [csp("뒤로"), ps("Send Backward"), krita("Lower Layer")],
      shortcut: "⌘⇧[",
      origins: [
        menu("edit/send-backward", { shortcut: "⌘⇧[" }),
        editMenu("send-backward", { shortcut: "⌘⇧[" }),
        help("layers.backward", { shortcut: "⌘[ · ⌘⇧[" }),
      ],
    }),
    defineCommand({
      id: "layer.nudge-1px",
      labels: [ko("선택 1px 이동"), en("Nudge 1px")],
      aliases: [ps("Nudge"), krita("Move Layer")],
      shortcut: "방향키",
      origins: [help("layers.move1px", { shortcut: "방향키" })],
    }),
    defineCommand({
      id: "layer.nudge-10px",
      labels: [ko("선택 10px 이동"), en("Nudge 10px")],
      aliases: [ps("Big Nudge")],
      shortcut: "⇧방향키",
      origins: [help("layers.move10px", { shortcut: "⇧ + 방향키" })],
    }),
    defineCommand({
      id: "layer.show-locally-hidden",
      labels: [ko("나만 숨긴 레이어 모두 표시"), en("Show all locally hidden layers")],
      aliases: [ps("Show All Layers"), ours("로컬 숨김 해제")],
      origins: [menu("view/reset-local-visibility")],
    }),

    /* ---------------------------------------------------------------- view */
    defineCommand({
      id: "view.zoom-in",
      labels: [ko("확대"), en("Zoom in")],
      aliases: [csp("확대"), ps("Zoom In"), krita("Zoom In"), procreate("Pinch out")],
      shortcut: "=",
      origins: [
        menu("view/zoom-in", { shortcut: "=" }),
        help("view.zoomIn", { shortcut: "⌘ +" }),
      ],
      note: "동일 식 setZoom((c)=>stepStudioViewZoom(c,1)) 이 7곳에 복붙돼 있다(ux-audit-v5 §2.4).",
    }),
    defineCommand({
      id: "view.zoom-out",
      labels: [ko("축소"), en("Zoom out")],
      aliases: [csp("축소"), ps("Zoom Out"), krita("Zoom Out"), procreate("Pinch in")],
      shortcut: "-",
      origins: [
        menu("view/zoom-out", { shortcut: "-" }),
        help("view.zoomOut", { shortcut: "⌘ −" }),
      ],
    }),
    defineCommand({
      id: "view.flip-horizontal",
      labels: [ko("수평 반전(보기)"), en("Flip view horizontally")],
      aliases: [csp("좌우 반전"), ps("Flip Horizontal"), krita("Mirror View"), procreate("Flip Canvas Horizontal")],
      shortcut: "H",
      origins: [
        menu("view/flip-horizontal", { shortcut: "H" }),
        keymap("flip-canvas", { shortcut: "H" }),
        help("view.flipCanvas", { shortcut: "H" }),
      ],
    }),
    defineCommand({
      id: "view.rotate-left",
      labels: [ko("왼쪽으로 90° 회전"), en("Rotate view 90° left")],
      aliases: [csp("왼쪽 회전"), ps("Rotate View Left"), krita("Rotate Canvas Left")],
      origins: [menu("view/rotate-left")],
    }),
    defineCommand({
      id: "view.rotate-right",
      labels: [ko("오른쪽으로 90° 회전"), en("Rotate view 90° right")],
      aliases: [csp("오른쪽 회전"), ps("Rotate View Right"), krita("Rotate Canvas Right")],
      origins: [menu("view/rotate-right")],
    }),
    defineCommand({
      id: "view.reset-rotation",
      labels: [ko("보기 회전 초기화"), en("Reset view rotation")],
      aliases: [ps("Reset View"), krita("Reset Canvas Rotation")],
      origins: [menu("view/reset-rotation")],
    }),
    defineCommand({
      id: "view.fit-width",
      labels: [ko("화면에 맞게 조정"), en("Fit on screen")],
      aliases: [csp("화면 맞춤"), ps("Fit on Screen"), krita("Fit Page"), procreate("Pinch to fit")],
      shortcut: "Home",
      origins: [
        menu("view/fit", { shortcut: "Home" }),
        quickAccess("fit-canvas", { shortcut: "Home" }),
        radial("fit-width"),
        help("view.zoomFit", {
          shortcut: "⌘ 0",
          note: "도움말만 ⌘0 으로 문서화 — 메뉴·팔레트는 Home.",
        }),
      ],
    }),
    defineCommand({
      id: "view.actual-pixels",
      labels: [ko("실제 픽셀 (100%)"), en("Actual pixels (100%)")],
      aliases: [csp("100%"), ps("100%"), krita("Reset Zoom")],
      shortcut: "End",
      origins: [menu("view/actual-pixels", { shortcut: "End" })],
    }),
    defineCommand({
      id: "view.canvas-rulers",
      labels: [ko("캔버스 px 눈금자"), en("Canvas pixel rulers")],
      aliases: [csp("자 표시"), ps("Rulers"), krita("Show Rulers")],
      shortcut: "⌥⌘R",
      origins: [menu("view/canvas-rulers", { shortcut: "⌥⌘R" })],
    }),
    defineCommand({
      id: "view.fullscreen",
      labels: [ko("전체화면"), en("Fullscreen")],
      aliases: [ps("Full Screen Mode"), krita("Fullscreen Mode"), procreate("Full Screen")],
      shortcut: "F11",
      origins: [menu("view/fullscreen", { shortcut: "F11" })],
    }),
    defineCommand({
      id: "view.color-vision-original",
      labels: [ko("색각 검수 · 원본"), en("Color vision proof · original")],
      aliases: [ps("Proof Colors Off")],
      origins: [menu("view/color-vision-original")],
    }),
    defineCommand({
      id: "view.color-vision-grayscale",
      labels: [ko("색각 검수 · 흑백 명암"), en("Color vision proof · grayscale")],
      aliases: [ps("Proof Colors · Grayscale"), krita("Grayscale Preview")],
      shortcut: "Q",
      origins: [
        menu("view/color-vision-grayscale", { shortcut: "Q" }),
      ],
      note: "`Q` 를 select.quick-mask 도 주장한다 — conflict `q-quickmask-vs-grayscale`.",
    }),
    defineCommand({
      id: "view.color-vision-protanopia",
      labels: [ko("색각 검수 · 1형 적록"), en("Color vision proof · protanopia")],
      aliases: [ps("Proof Colors · Protanopia")],
      origins: [menu("view/color-vision-protanopia")],
    }),
    defineCommand({
      id: "view.color-vision-deuteranopia",
      labels: [ko("색각 검수 · 2형 적록"), en("Color vision proof · deuteranopia")],
      aliases: [ps("Proof Colors · Deuteranopia")],
      origins: [menu("view/color-vision-deuteranopia")],
    }),
    defineCommand({
      id: "view.color-vision-tritanopia",
      labels: [ko("색각 검수 · 3형 청황"), en("Color vision proof · tritanopia")],
      aliases: [ps("Proof Colors · Tritanopia")],
      origins: [menu("view/color-vision-tritanopia")],
    }),
    defineCommand({
      id: "view.save-current-view",
      labels: [ko("현재 보기 저장"), en("Save current view")],
      aliases: [ps("New Window Arrangement"), krita("Save Workspace"), ours("보기 저장")],
      shortcut: "⇧S",
      origins: [menu("view/save-current-view", { shortcut: "⇧S" })],
      note: "`⇧S` 를 그리기 리졸버의 크기 잠금도 주장하지만 view 가 먼저 실행된다 — conflict `shift-s-saveview-vs-sizelock`.",
    }),
    defineCommand({
      id: "view.restore-view",
      labels: [ko("보기 복원"), en("Restore saved view")],
      aliases: [ours("보기 복원")],
      shortcut: "⇧Z",
      origins: [menu("view/restore-view", { shortcut: "⇧Z" })],
    }),
    defineCommand({
      id: "view.perspective-guide",
      labels: [ko("원근 도우미 보기"), en("Perspective guide")],
      aliases: [csp("퍼스자"), ps("Perspective Grid"), krita("Perspective Assistant")],
      shortcut: "⇧G",
      origins: [menu("view/perspective-guide", { shortcut: "⇧G" })],
    }),
    defineCommand({
      id: "view.reset",
      labels: [ko("화면 리셋(줌 · 위치 · 반전)"), en("Reset view")],
      aliases: [krita("Reset Canvas Transformations"), ps("Reset View")],
      shortcut: "⇧0",
      origins: [keymap("reset-view", { shortcut: "Shift+0" })],
    }),
    defineCommand({
      id: "view.zoom-to-selection",
      labels: [ko("선택 영역으로 확대"), en("Zoom to selection")],
      aliases: [ps("Zoom to Selection"), krita("Zoom to Selection")],
      shortcut: "⇧F",
      origins: [keymap("zoom-to-selection", { shortcut: "Shift+F" })],
    }),
    defineCommand({
      id: "view.zoom-at-pointer",
      labels: [ko("포인터 기준 확대·축소"), en("Zoom at pointer")],
      aliases: [ps("Scrubby Zoom"), krita("Zoom at cursor")],
      shortcut: "⌘+휠",
      origins: [help("view.zoomAtPointer", { shortcut: "⌘ + 휠", status: "documented-only" })],
    }),
    defineCommand({
      id: "view.pan",
      labels: [ko("화면 이동"), en("Pan view")],
      aliases: [csp("손바닥"), ps("Hand Tool"), krita("Pan"), procreate("두 손가락 드래그")],
      shortcut: "Space+드래그",
      origins: [help("view.pan", { shortcut: "Space + 드래그", status: "documented-only" })],
    }),
    defineCommand({
      id: "view.production-insights",
      labels: [ko("제작 인사이트…"), en("Production insights…")],
      aliases: [ours("제작 인사이트")],
      origins: [menu("view/production-insights")],
    }),

    /* -------------------------------------------------------------- window */
    defineCommand({
      id: "window.canvas-only",
      labels: [ko("캔버스만 보기"), en("Canvas only")],
      aliases: [csp("전체 화면 표시"), ps("Screen Mode"), krita("Canvas Only Mode"), procreate("Full Screen")],
      shortcut: "`",
      origins: [
        menu("view/canvas-only", { shortcut: "`" }),
        keymap("toggle-chrome", { shortcut: "`" }),
        help("view.toggleCanvas", { shortcut: "`" }),
      ],
    }),
    defineCommand({
      id: "window.quick-access-palette",
      labels: [ko("빠른 액세스 팔레트"), en("Quick access palette")],
      aliases: [csp("퀵 액세스"), ps("Command Search"), krita("Search Actions")],
      shortcut: "⇧Q",
      origins: [menu("view/quick-access-palette", { shortcut: "⇧Q" })],
    }),
    defineCommand({
      id: "window.left-panel",
      labels: [ko("왼쪽 패널 표시 전환"), en("Toggle left panel")],
      aliases: [ps("Toggle Panels"), krita("Show Dockers")],
      origins: [menu("view/left-panel")],
    }),
    defineCommand({
      id: "window.right-panel",
      labels: [ko("속성 패널 표시 전환"), en("Toggle properties panel")],
      aliases: [ps("Properties Panel"), krita("Tool Options Docker")],
      origins: [menu("view/right-panel")],
    }),
    defineCommand({
      id: "window.tool-properties",
      labels: [ko("도구 속성", "현재 도구와 선택 항목의 속성 팔레트를 엽니다."), en("Tool properties")],
      aliases: [csp("도구 속성"), ps("Options Bar"), krita("Tool Options"), procreate("Brush Settings")],
      origins: [radial("properties"), quickAccess("properties")],
    }),
    defineCommand({
      id: "window.reference-panel",
      labels: [ko("참고 이미지 창"), en("Reference window")],
      aliases: [csp("서브 뷰"), ps("Reference Panel"), krita("Reference Images Tool"), procreate("Reference")],
      origins: [menu("view/reference-window")],
    }),
    defineCommand({
      id: "window.page-sequence",
      labels: [ko("페이지 시퀀스"), en("Page sequence")],
      aliases: [csp("페이지 관리"), ps("Artboards")],
      origins: [menu("view/page-sequence")],
    }),
    defineCommand({
      id: "window.density-focus",
      labels: [ko("슈퍼심플 레이아웃"), en("Focus layout")],
      aliases: [ours("슈퍼심플"), procreate("Minimal UI")],
      origins: [menu("view/density-focus")],
    }),
    defineCommand({
      id: "window.density-full",
      labels: [ko("전체 레이아웃"), en("Full layout")],
      aliases: [ours("전체 레이아웃")],
      origins: [menu("view/density-full")],
    }),
    defineCommand({
      id: "window.collapse-side-panels",
      labels: [ko("패널 접어 넓게"), en("Collapse side panels")],
      aliases: [ps("Collapse Panels"), krita("Hide Dockers")],
      origins: [menu("view/wide")],
    }),
    defineCommand({
      id: "window.tools-companion",
      labels: [ko("멀티 디스플레이 작업공간…"), en("Multi-display companion…")],
      aliases: [ps("New Window for"), krita("New Window")],
      origins: [menu("view/tools-companion")],
    }),
    defineCommand({
      id: "window.app-settings",
      labels: [ko("애플리케이션 설정"), en("Application settings")],
      aliases: [csp("환경 설정"), ps("Preferences"), krita("Configure Krita"), procreate("Settings")],
      origins: [
        menu("view/app-settings"),
        menu("edit/app-settings", {
          note: "메뉴 항목 id `app-settings` 가 view·edit 두 그룹에 중복 등재 — conflict `menu-item-id-collision`.",
        }),
        editMenu("app-settings"),
      ],
    }),

    /* ---------------------------------------------------------------- tool */
    defineCommand({
      id: "tool.select",
      labels: [ko("오브젝트 선택", "요소를 선택하고 이동합니다."), en("Object select")],
      aliases: [csp("오브젝트"), ps("Move Tool"), krita("Select Shapes Tool"), procreate("Selection")],
      shortcut: "V",
      origins: [
        keymap("tool-select", { shortcut: "V" }),
        radial("select"),
        quickAccess("select", { shortcut: "V" }),
      ],
    }),
    defineCommand({
      id: "tool.hand",
      labels: [ko("핸드(팬)"), en("Hand (pan)")],
      aliases: [csp("손바닥"), ps("Hand Tool"), krita("Pan Tool"), procreate("두 손가락 드래그")],
      shortcut: "Space",
      origins: [
        keymap("tool-hand", {
          shortcut: "Space",
          status: "dead",
          note: "studio-app-settings.ts:85 — 재매핑해도 아무 일도 일어나지 않는다.",
        }),
      ],
    }),
    defineCommand({
      id: "tool.pen",
      labels: [ko("펜"), en("Pen")],
      aliases: [csp("펜"), cspEn("Pen"), ps("Brush Tool"), krita("Freehand Brush Tool"), procreate("Brush")],
      shortcut: "B",
      origins: [
        keymap("tool-pen", { shortcut: "B" }),
        menu("draw/pen", { shortcut: "B" }),
        radial("pen"),
        quickAccess("pen", { shortcut: "B" }),
        help("drawing.pen", { shortcut: "B" }),
      ],
      note: "펜/지우개 전환이 8사이트에 복붙돼 있고 부수효과가 4갈래다(ux-audit-v5 §2.4).",
    }),
    defineCommand({
      id: "tool.pixel-pen",
      labels: [ko("픽셀 펜"), en("Pixel pen")],
      aliases: [csp("도트 펜"), ps("Pencil Tool"), krita("Pixel Brush")],
      shortcut: "P",
      origins: [keymap("tool-pixel", { shortcut: "P" })],
    }),
    defineCommand({
      id: "tool.eraser",
      labels: [ko("지우개"), en("Eraser")],
      aliases: [csp("지우개"), ps("Eraser Tool"), krita("Eraser"), procreate("Erase")],
      shortcut: "E",
      origins: [
        keymap("tool-eraser", { shortcut: "E" }),
        menu("draw/eraser", { shortcut: "E" }),
        radial("eraser"),
        quickAccess("eraser", { shortcut: "E" }),
        help("drawing.eraser", { shortcut: "E" }),
      ],
    }),
    defineCommand({
      id: "tool.fill",
      labels: [ko("채우기"), en("Fill")],
      aliases: [csp("채우기"), ps("Paint Bucket"), krita("Fill Tool"), procreate("ColorDrop")],
      shortcut: "G",
      origins: [
        keymap("tool-fill", { shortcut: "G" }),
        menu("draw/fill", { shortcut: "G" }),
        quickAccess("fill", { shortcut: "G" }),
        radial("advanced-fill", {
          note: "라디얼만 `advanced-fill` 로 부른다 — conflict `fill-id-divergence`.",
        }),
        help("edit.fill", { shortcut: "G" }),
      ],
    }),
    defineCommand({
      id: "tool.eyedropper",
      labels: [ko("스포이드"), en("Eyedropper")],
      aliases: [csp("스포이트"), ps("Eyedropper Tool"), krita("Color Sampler"), procreate("Color Picker")],
      shortcut: "I",
      origins: [
        keymap("tool-eyedropper", { shortcut: "I" }),
        radial("eyedropper"),
        quickAccess("eyedropper", { shortcut: "I" }),
      ],
      note: "키보드·툴레일은 토글, Quick Deck·라디얼은 항상 ON — conflict `eyedropper-toggle-divergence`.",
    }),
    defineCommand({
      id: "tool.lasso",
      labels: [ko("올가미 선택"), en("Lasso select")],
      aliases: [csp("올가미 선택"), ps("Lasso Tool"), krita("Freehand Selection"), procreate("Freehand")],
      shortcut: "L",
      origins: [keymap("tool-lasso", { shortcut: "L" })],
    }),
    defineCommand({
      id: "tool.marquee-rect",
      labels: [ko("사각 선택"), en("Rectangular marquee")],
      aliases: [csp("선택 범위(직사각형)"), ps("Rectangular Marquee"), krita("Rectangular Selection"), procreate("Rectangle")],
      shortcut: "M",
      origins: [keymap("tool-marquee", { shortcut: "M" })],
    }),
    defineCommand({
      id: "tool.marquee-ellipse",
      labels: [ko("원형 선택"), en("Elliptical marquee")],
      aliases: [csp("선택 범위(타원)"), ps("Elliptical Marquee"), krita("Elliptical Selection"), procreate("Ellipse")],
      shortcut: "⇧M",
      origins: [keymap("tool-marquee-circle", { shortcut: "Shift+M" })],
    }),
    defineCommand({
      id: "tool.transform",
      labels: [ko("변형"), en("Transform")],
      aliases: [csp("변형"), ps("Free Transform"), krita("Transform Tool"), procreate("Transform")],
      shortcut: "⇧T",
      origins: [keymap("tool-transform", { shortcut: "Shift+T" })],
      note: "팔레트의 `transform`(픽셀 선택 변형)과 다른 명령이다 — conflict `transform-tool-vs-pixel`.",
    }),
    defineCommand({
      id: "tool.crop",
      labels: [ko("자르기"), en("Crop")],
      aliases: [csp("자르기"), ps("Crop Tool"), krita("Crop Tool"), procreate("Crop & Resize")],
      shortcut: "C",
      origins: [keymap("tool-crop", { shortcut: "C" })],
    }),
    defineCommand({
      id: "tool.comment",
      labels: [ko("위치 댓글"), en("Pin comment")],
      aliases: [ps("Note Tool"), ours("위치 댓글")],
      shortcut: "⌥C",
      origins: [keymap("tool-comment", { shortcut: "Alt+C" })],
    }),
    defineCommand({
      id: "tool.smudge",
      labels: [ko("문지르기"), en("Smudge")],
      aliases: [csp("색 혼합"), ps("Smudge Tool"), krita("Smudge Brush"), procreate("Smudge")],
      shortcut: "N",
      origins: [
        keymap("tool-blend", { shortcut: "N" }),
        help("drawing.blendWet", {
          shortcut: "N · ⇧N",
          note: "한 행이 문지르기·혼색 두 명령을 겸한다.",
        }),
      ],
    }),
    defineCommand({
      id: "tool.wet-mix",
      labels: [ko("혼색 브러시"), en("Wet mix brush")],
      aliases: [csp("색 혼합 · 흐리기"), ps("Mixer Brush"), krita("Color Smudge Brush")],
      shortcut: "⇧N",
      origins: [
        keymap("tool-wet-mix", { shortcut: "Shift+N" }),
        radial("wet-mix"),
        quickAccess("wet-mix"),
        help("drawing.blendWet", { shortcut: "N · ⇧N" }),
      ],
    }),
    defineCommand({
      id: "tool.dodge-burn",
      labels: [ko("닷지 · 번"), en("Dodge · burn")],
      aliases: [csp("닷지"), ps("Dodge Tool"), krita("Dodge and Burn"), procreate("Adjustments")],
      shortcut: "O",
      origins: [
        keymap("tool-dodge-burn", { shortcut: "O" }),
        radial("dodge-burn"),
        quickAccess("dodge-burn"),
        help("drawing.dodgeBurn", { shortcut: "O" }),
      ],
    }),
    defineCommand({
      id: "tool.liquify",
      labels: [ko("리퀴파이"), en("Liquify")],
      aliases: [csp("액화"), ps("Liquify"), krita("Liquify Transform"), procreate("Liquify")],
      shortcut: "J",
      origins: [keymap("tool-liquify", { shortcut: "J" })],
    }),
    defineCommand({
      id: "tool.lettering",
      labels: [ko("레터링(텍스트 · 말풍선)"), en("Lettering (text · balloon)")],
      aliases: [csp("텍스트"), ps("Type Tool"), krita("Text Tool"), procreate("Add Text")],
      shortcut: "T",
      origins: [
        keymap("tool-lettering", { shortcut: "T" }),
        help("edit.text", { shortcut: "T" }),
      ],
    }),
    defineCommand({
      id: "tool.zoom",
      labels: [ko("보기 확대 · 축소"), en("Zoom tool")],
      aliases: [csp("돋보기"), ps("Zoom Tool"), krita("Zoom Tool")],
      shortcut: "Z",
      origins: [keymap("tool-zoom", { shortcut: "Z" })],
    }),
    defineCommand({
      id: "tool.rotate-view",
      labels: [ko("보기 회전"), en("Rotate view tool")],
      aliases: [csp("회전"), ps("Rotate View Tool"), krita("Rotate Canvas")],
      shortcut: "R",
      origins: [keymap("tool-rotate-view", { shortcut: "R" })],
    }),
    defineCommand({
      id: "tool.smart-shape",
      labels: [ko("스마트 도형"), en("Smart shape")],
      aliases: [csp("도형"), ps("Shape Tool"), krita("Shape Tools"), procreate("QuickShape")],
      origins: [menu("draw/smart-shape")],
    }),

    /* --------------------------------------------------------------- brush */
    defineCommand({
      id: "brush.size-decrease",
      labels: [ko("브러시 작게"), en("Decrease brush size")],
      aliases: [csp("브러시 크기 줄이기"), ps("Decrease Brush Size"), krita("Decrease Brush Size")],
      shortcut: "[",
      origins: [
        keymap("brush-smaller", { shortcut: "[" }),
        help("drawing.brushSize", { shortcut: "[ · ]" }),
      ],
      note: "클램프가 2원화돼 있다: studio-brush-library.ts:184 [1,80] vs studio-draw-ux.ts:17 {min:1,max:80}.",
    }),
    defineCommand({
      id: "brush.size-increase",
      labels: [ko("브러시 크게"), en("Increase brush size")],
      aliases: [csp("브러시 크기 늘리기"), ps("Increase Brush Size"), krita("Increase Brush Size")],
      shortcut: "]",
      origins: [
        keymap("brush-larger", { shortcut: "]" }),
        help("drawing.brushSize", { shortcut: "[ · ]" }),
      ],
    }),
    defineCommand({
      id: "brush.size-step",
      labels: [ko("브러시 크기 미세 조절"), en("Fine brush size step")],
      aliases: [ps("Brush Size Step")],
      shortcut: "⇧[ · ⇧]",
      origins: [help("drawing.brushSizeStep", { shortcut: "⇧ [ · ⇧ ]" })],
    }),
    defineCommand({
      id: "brush.opacity-step",
      labels: [ko("브러시 불투명도 조절"), en("Brush opacity step")],
      aliases: [csp("불투명도"), ps("Opacity"), krita("Opacity")],
      shortcut: "⌥[ · ⌥]",
      origins: [help("drawing.opacity", { shortcut: "⌥ [ · ⌥ ]" })],
    }),
    defineCommand({
      id: "brush.recent-slot",
      labels: [ko("최근 브러시 슬롯"), en("Recent brush slot")],
      aliases: [csp("보조 도구 전환"), procreate("Brush Library")],
      shortcut: "1–6",
      origins: [help("drawing.recentBrushSlots", { shortcut: "1–6" })],
    }),
    defineCommand({
      id: "brush.save-slot",
      labels: [ko("브러시 슬롯 저장"), en("Save brush slot")],
      aliases: [csp("보조 도구 등록"), krita("Save New Brush Preset")],
      shortcut: "⇧1–6",
      origins: [help("drawing.saveBrushSlot", { shortcut: "⇧ 1–6" })],
    }),
    defineCommand({
      id: "brush.straighten-stroke",
      labels: [ko("직선 그리기"), en("Straighten stroke")],
      aliases: [csp("직선"), ps("Straight Line"), procreate("QuickLine")],
      shortcut: "⇧+드래그",
      origins: [help("drawing.straighten", { shortcut: "⇧ + 드래그", status: "documented-only" })],
    }),
    defineCommand({
      id: "brush.background-tone",
      labels: [ko("배경 · 톤"), en("Background · tone")],
      aliases: [csp("톤"), ps("Halftone Pattern"), krita("Screentone")],
      origins: [menu("draw/bg")],
    }),
    defineCommand({
      id: "brush.palette-brand",
      labels: [ko("팔레트 · 브랜드"), en("Palette · brand")],
      aliases: [csp("컬러 세트"), ps("Swatches"), krita("Palette Docker")],
      origins: [menu("draw/style")],
    }),

    /* --------------------------------------------------------------- color */
    defineCommand({
      id: "color.swap-primary-secondary",
      labels: [ko("주 · 보조 색 교체"), en("Swap primary and secondary color")],
      aliases: [csp("그리기색과 배경색 전환"), ps("Switch Foreground/Background"), krita("Swap Foreground/Background")],
      shortcut: "X",
      origins: [
        keymap("swap-colors", { shortcut: "X" }),
        help("drawing.swapColors", { shortcut: "X" }),
      ],
    }),

    /* ----------------------------------------------------------- transform */
    defineCommand({
      id: "transform.pixel-selection",
      labels: [ko("픽셀 선택 변형"), en("Transform pixel selection")],
      aliases: [csp("선택 범위 변형"), ps("Transform Selection"), krita("Transform Selection")],
      origins: [quickAccess("transform")],
    }),
    defineCommand({
      id: "transform.flip-selection-horizontal",
      labels: [ko("선택 좌우 반전"), en("Flip selection horizontally")],
      aliases: [csp("좌우 반전"), ps("Flip Horizontal"), krita("Mirror Horizontally")],
      shortcut: "⇧H",
      origins: [keymap("flip-selection-h", { shortcut: "Shift+H" })],
    }),
    defineCommand({
      id: "transform.flip-selection-vertical",
      labels: [ko("선택 상하 반전"), en("Flip selection vertically")],
      aliases: [csp("상하 반전"), ps("Flip Vertical"), krita("Mirror Vertically")],
      shortcut: "⇧V",
      origins: [keymap("flip-selection-v", { shortcut: "Shift+V" })],
    }),

    /* -------------------------------------------------------------- insert */
    defineCommand({
      id: "insert.template",
      labels: [ko("템플릿 · 에셋"), en("Template · assets")],
      aliases: [csp("소재"), ps("Libraries"), krita("Resources")],
      origins: [menu("insert/template")],
    }),
    defineCommand({
      id: "insert.collage",
      labels: [ko("콜라주"), en("Collage")],
      aliases: [ours("콜라주")],
      origins: [menu("insert/collage")],
    }),
    defineCommand({
      id: "insert.elements",
      labels: [ko("요소 · 도형"), en("Elements · shapes")],
      aliases: [csp("도형"), ps("Custom Shape")],
      origins: [menu("insert/elements")],
    }),
    defineCommand({
      id: "insert.balloon",
      labels: [ko("말풍선"), en("Speech balloon")],
      aliases: [csp("말풍선"), cspEn("Balloon"), ours("말풍선 삽입")],
      origins: [menu("insert/bubble")],
      note: "라디얼·팔레트의 `add-bubble`(text.add-balloon)과 중복 — conflict `balloon-id-divergence`.",
    }),
    defineCommand({
      id: "insert.text",
      labels: [ko("텍스트"), en("Text")],
      aliases: [csp("텍스트"), ps("Type Tool"), krita("Text Tool")],
      origins: [menu("insert/text")],
    }),
    defineCommand({
      id: "insert.image",
      labels: [ko("이미지…"), en("Image…")],
      aliases: [csp("화상 읽어들이기"), ps("Place Embedded"), krita("Insert Image")],
      origins: [menu("insert/image")],
    }),
    defineCommand({
      id: "insert.mannequin-3d",
      labels: [ko("3D 데생 인형"), en("3D drawing mannequin")],
      aliases: [csp("3D 데생 인형"), cspEn("3D Drawing Figure")],
      origins: [menu("insert/mannequin3d")],
    }),
    defineCommand({
      id: "insert.character-3d",
      labels: [ko("3D 캐릭터"), en("3D character")],
      aliases: [csp("3D 소재"), ours("VRM 캐릭터")],
      origins: [menu("insert/char")],
    }),
    defineCommand({
      id: "insert.background-3d",
      labels: [ko("3D 배경"), en("3D background")],
      aliases: [csp("3D 배경 소재")],
      origins: [menu("insert/bg3d")],
    }),
    defineCommand({
      id: "insert.reference-image",
      labels: [ko("참고 이미지"), en("Reference image")],
      aliases: [krita("Reference Images Tool"), procreate("Reference")],
      origins: [menu("insert/ref")],
    }),
    defineCommand({
      id: "insert.page",
      labels: [ko("새 페이지"), en("New page")],
      aliases: [csp("페이지 추가"), ps("New Artboard")],
      origins: [menu("insert/page")],
    }),

    /* ---------------------------------------------------------------- text */
    defineCommand({
      id: "text.add-balloon",
      labels: [ko("말풍선 추가", "기본 대사 말풍선을 현재 페이지에 추가합니다."), en("Add speech balloon")],
      aliases: [csp("말풍선 추가"), ours("대사 말풍선")],
      origins: [radial("add-bubble"), quickAccess("add-bubble")],
      note: "메뉴의 `insert/bubble` 과 같은 결과를 내지만 별도 id 로 유지되고 있다.",
    }),

    /* -------------------------------------------------------------- filter */
    defineCommand({
      id: "filter.last",
      labels: [ko("마지막 필터 다시 열기"), en("Reopen last filter")],
      aliases: [ps("Last Filter"), krita("Repeat Filter")],
      origins: [menu("filter/last-filter")],
    }),
    defineCommand({
      id: "filter.gaussian-blur",
      labels: [ko("가우시안 블러"), en("Gaussian blur")],
      aliases: [csp("가우시안 흐리기"), ps("Gaussian Blur"), krita("Gaussian Blur"), procreate("Gaussian Blur")],
      shortcut: "⌘⇧1",
      origins: [menu("filter/gaussian-blur", { shortcut: "⌘⇧1" })],
    }),
    defineCommand({
      id: "filter.motion-blur",
      labels: [ko("모션 블러"), en("Motion blur")],
      aliases: [csp("이동 흐리기"), ps("Motion Blur"), krita("Motion Blur"), procreate("Motion Blur")],
      shortcut: "⌘⇧2",
      origins: [menu("filter/motion-blur", { shortcut: "⌘⇧2" })],
    }),
    defineCommand({
      id: "filter.hue-saturation-brightness",
      labels: [ko("색조 / 채도 / 밝기"), en("Hue / saturation / brightness")],
      aliases: [csp("색조·채도·명도"), ps("Hue/Saturation"), krita("HSV Adjustment"), procreate("Hue, Saturation, Brightness")],
      shortcut: "⌘⇧3",
      origins: [menu("filter/hue-saturation-brightness", { shortcut: "⌘⇧3" })],
    }),
    defineCommand({
      id: "filter.brightness-contrast",
      labels: [ko("명도 / 대비"), en("Brightness / contrast")],
      aliases: [csp("밝기·대비"), ps("Brightness/Contrast"), krita("Brightness/Contrast")],
      shortcut: "⌘⇧4",
      origins: [menu("filter/brightness-contrast", { shortcut: "⌘⇧4" })],
    }),
    defineCommand({
      id: "filter.color-curves",
      labels: [ko("색상 커브"), en("Color curves")],
      aliases: [csp("톤 커브"), ps("Curves"), krita("Color Adjustment Curves"), procreate("Curves")],
      shortcut: "⌘⇧5",
      origins: [menu("filter/color-curves", { shortcut: "⌘⇧5" })],
    }),
    defineCommand({
      id: "filter.mosaic",
      labels: [ko("모자이크 / 픽셀화"), en("Mosaic / pixelate")],
      aliases: [csp("모자이크"), ps("Mosaic"), krita("Pixelize")],
      origins: [menu("filter/mosaic")],
    }),
    defineCommand({
      id: "filter.radial-blur",
      labels: [ko("방사형 블러"), en("Radial blur")],
      aliases: [csp("방사 흐리기"), ps("Radial Blur"), krita("Lens Blur")],
      origins: [menu("filter/radial-blur")],
    }),
    defineCommand({
      id: "filter.zoom-blur",
      labels: [ko("줌 블러"), en("Zoom blur")],
      aliases: [csp("줌 흐리기"), ps("Radial Blur · Zoom")],
      origins: [menu("filter/zoom-blur")],
    }),
    defineCommand({
      id: "filter.chromatic-aberration",
      labels: [ko("색수차"), en("Chromatic aberration")],
      aliases: [ps("Lens Correction"), procreate("Chromatic Aberration")],
      origins: [menu("filter/chromatic-aberration")],
    }),
    defineCommand({
      id: "filter.glitch",
      labels: [ko("글리치"), en("Glitch")],
      aliases: [procreate("Glitch"), ours("글리치")],
      origins: [menu("filter/glitch")],
    }),
    defineCommand({
      id: "filter.scanline",
      labels: [ko("스캔라인 (CRT)"), en("Scanline (CRT)")],
      aliases: [ps("Halftone Pattern · Line"), ours("스캔라인")],
      origins: [menu("filter/scanline")],
    }),
    defineCommand({
      id: "filter.vignette",
      labels: [ko("비네트"), en("Vignette")],
      aliases: [ps("Lens Correction · Vignette"), krita("Vignette"), procreate("Vignette")],
      origins: [menu("filter/vignette")],
    }),
    defineCommand({
      id: "filter.lens-flare",
      labels: [ko("렌즈 플레어"), en("Lens flare")],
      aliases: [ps("Lens Flare"), krita("Lens Flare")],
      origins: [menu("filter/lens-flare")],
    }),
    defineCommand({
      id: "filter.emboss",
      labels: [ko("엠보스"), en("Emboss")],
      aliases: [csp("엠보스"), ps("Emboss"), krita("Emboss")],
      origins: [menu("filter/emboss")],
    }),
    defineCommand({
      id: "filter.solarize",
      labels: [ko("솔라라이즈"), en("Solarize")],
      aliases: [ps("Solarize"), krita("Solarize")],
      origins: [menu("filter/solarize")],
    }),
    defineCommand({
      id: "filter.threshold",
      labels: [ko("한계값 (흑백 2값)"), en("Threshold")],
      aliases: [csp("2치화"), ps("Threshold"), krita("Threshold")],
      origins: [menu("filter/threshold")],
    }),
    defineCommand({
      id: "filter.oil-paint",
      labels: [ko("유화"), en("Oil paint")],
      aliases: [ps("Oil Paint"), krita("Oilpaint")],
      origins: [menu("filter/oil-paint")],
    }),
    defineCommand({
      id: "filter.surface-blur",
      labels: [ko("표면 블러"), en("Surface blur")],
      aliases: [ps("Surface Blur"), krita("Edge preserving blur")],
      origins: [menu("filter/surface-blur")],
    }),
    defineCommand({
      id: "filter.lens-blur",
      labels: [ko("렌즈 블러"), en("Lens blur")],
      aliases: [ps("Lens Blur"), krita("Lens Blur")],
      origins: [menu("filter/lens-blur")],
    }),
    defineCommand({
      id: "filter.field-iris-blur",
      labels: [ko("필드 아이리스 블러"), en("Field / iris blur")],
      aliases: [ps("Iris Blur")],
      origins: [menu("filter/field-iris-blur")],
    }),
    defineCommand({
      id: "filter.tilt-shift-blur",
      labels: [ko("틸트 시프트 블러"), en("Tilt-shift blur")],
      aliases: [ps("Tilt-Shift"), procreate("Perspective Blur")],
      origins: [menu("filter/tilt-shift-blur")],
    }),
    defineCommand({
      id: "filter.selective-gaussian-blur",
      labels: [ko("선택적 가우시안 블러"), en("Selective Gaussian blur")],
      aliases: [krita("Gaussian Blur · selective")],
      origins: [menu("filter/selective-gaussian-blur")],
    }),
    defineCommand({
      id: "filter.tileable-blur",
      labels: [ko("타일러블 블러"), en("Tileable blur")],
      aliases: [krita("Blur · wrap around")],
      origins: [menu("filter/tileable-blur")],
    }),
    defineCommand({
      id: "filter.line-cleanup",
      labels: [ko("스케치 선화 정리"), en("Line art cleanup")],
      aliases: [csp("선화 추출"), ps("Sketch Cleanup")],
      origins: [menu("filter/line-cleanup")],
    }),
    defineCommand({
      id: "filter.screentone-removal",
      labels: [ko("스크린톤 제거"), en("Screentone removal")],
      aliases: [csp("톤 제거"), ours("스크린톤 제거")],
      origins: [menu("filter/screentone-removal")],
    }),
    defineCommand({
      id: "filter.jpeg-artifact-reduction",
      labels: [ko("JPEG 아티팩트 감소"), en("JPEG artifact reduction")],
      aliases: [ps("Reduce Noise · JPEG Artifact")],
      origins: [menu("filter/jpeg-artifact-reduction")],
    }),
    defineCommand({
      id: "filter.edge-aware-denoise",
      labels: [ko("엣지 보존 노이즈 감소"), en("Edge-aware denoise")],
      aliases: [ps("Reduce Noise"), krita("Wavelet Noise Reducer")],
      origins: [menu("filter/edge-aware-denoise")],
    }),
    defineCommand({
      id: "filter.dust-scratches",
      labels: [ko("먼지와 스크래치 제거"), en("Dust and scratches")],
      aliases: [ps("Dust & Scratches")],
      origins: [menu("filter/dust-scratches")],
    }),
    defineCommand({
      id: "filter.difference-of-gaussians",
      labels: [ko("가우시안 차분 선화"), en("Difference of Gaussians")],
      aliases: [krita("Edge Detection · DoG"), ps("High Pass")],
      origins: [menu("filter/difference-of-gaussians")],
    }),
    defineCommand({
      id: "filter.color-to-alpha",
      labels: [ko("색상 투명화"), en("Color to alpha")],
      aliases: [krita("Color to Alpha"), ps("Blending Options · Blend If")],
      origins: [menu("filter/color-to-alpha")],
    }),
    defineCommand({
      id: "filter.duotone",
      labels: [ko("세피아 / 듀오톤"), en("Sepia / duotone")],
      aliases: [ps("Duotone"), krita("Gradient Map")],
      origins: [menu("filter/duotone")],
    }),
    defineCommand({
      id: "filter.noise-add",
      labels: [ko("노이즈 추가"), en("Add noise")],
      aliases: [ps("Add Noise"), krita("Random Noise"), procreate("Noise")],
      origins: [menu("filter/noise-add")],
    }),

    /* ------------------------------------------------------------------ ai */
    defineCommand({
      id: "ai.assist",
      labels: [ko("AI 어시스트"), en("AI assist")],
      aliases: [ps("Generative Fill"), ours("AI 어시스트")],
      origins: [menu("ai/ai-assist")],
    }),
    defineCommand({
      id: "ai.stock-images",
      labels: [ko("스톡 이미지"), en("Stock images")],
      aliases: [ps("Adobe Stock")],
      origins: [menu("ai/stock")],
    }),
    defineCommand({
      id: "ai.integrations",
      labels: [ko("연동 설정"), en("Integrations")],
      aliases: [ours("연동 설정")],
      origins: [menu("ai/integrations")],
    }),

    /* ---------------------------------------------------------------- help */
    defineCommand({
      id: "help.feature-tutorials",
      labels: [ko("사용법 · 기능 튜토리얼"), en("Feature tutorials")],
      aliases: [csp("사용법"), ps("Learn"), krita("Tutorials")],
      origins: [menu("help/feature-tutorials")],
    }),
    defineCommand({
      id: "help.shortcuts",
      labels: [ko("단축키 · 기본 조작"), en("Shortcuts")],
      aliases: [csp("단축키 설정"), ps("Keyboard Shortcuts"), krita("Configure Shortcuts"), procreate("Gesture Controls")],
      shortcut: "?",
      origins: [
        menu("help/shortcuts", { shortcut: "?" }),
        keymap("shortcuts-help", { shortcut: "?" }),
        help("view.help", { shortcut: "?" }),
      ],
    }),
  ]);

/* --------------------------------------------------------------- conflicts */

/**
 * Every disagreement the five lists have with each other, measured rather than
 * inferred. The shortcut-uniqueness test allows a collision **only** when it is
 * declared here, so silently adding a clashing chord fails the suite.
 */
export const COMMAND_CONFLICTS: readonly StudioCommandConflict[] = Object.freeze([
  {
    id: "q-quickmask-vs-grayscale",
    kind: "shortcut-collision",
    key: "Q",
    commandIds: ["select.quick-mask", "view.color-vision-grayscale"],
    detail:
      "퀵 마스크와 색각 검수 흑백 명암이 같은 `Q` 를 주장한다. 메뉴는 grayscale 을, 도움말은 quick mask 를 문서화해 두 문서가 서로 어긋난다.",
    evidence: [
      "StudioPage.tsx:23732 (quick mask)",
      "studio-view-controls.ts:695 (grayscale)",
      "studio-main-menu-groups.ts:703 (메뉴는 grayscale=Q)",
      "StudioShortcutsHelp.tsx:96 (도움말은 quick mask=Q)",
    ],
    resolution:
      "키맵 흡수(1단계)에서 `Q`=select.quick-mask 로 고정하고 grayscale 은 `⇧Q` 계열로 이전하거나 chord 없이 메뉴 전용으로 둔다. 결정 전까지 두 문서를 같은 값으로 맞춘다.",
  },
  {
    id: "shift-s-saveview-vs-sizelock",
    kind: "shortcut-collision",
    key: "⇧S",
    commandIds: ["view.save-current-view"],
    detail:
      "view 리졸버(보기 저장)와 drawing 리졸버(크기 잠금)가 `⇧S` 를 동시에 주장하고 view 가 먼저 실행되므로 크기 잠금은 도달 불가 dead code 다.",
    evidence: [
      "studio-view-controls.ts:698 (보기 저장)",
      "studio-drawing-shortcuts.ts:259 (크기 잠금 — 도달 불가)",
    ],
    resolution:
      "크기 잠금은 아직 카탈로그 명령이 아니다. 키맵 흡수 시 단일 리졸버가 되면 충돌이 컴파일 타임에 드러나므로 그 시점에 크기 잠금에 별도 chord 를 배정한다.",
  },
  {
    id: "cmd-d-duplicate-vs-deselect",
    kind: "shortcut-collision",
    key: "⌘D",
    commandIds: ["edit.duplicate", "select.deselect"],
    detail:
      "빠른 액세스 팔레트는 복제를 `⌘D` 로 광고하지만, 메뉴·키맵·도움말은 `⌘D` 를 선택 해제에 배정한다. 메뉴의 복제는 `⌘J` 다.",
    evidence: [
      "studio-quick-access-integration.ts:155-161 (duplicate, ⌘D)",
      "studio-edit-controls.ts:56 (deselect, ⌘D)",
      "studio-edit-controls.ts:71 (duplicate, ⌘J)",
      "studio-app-settings.ts:106 (deselect-pixels, Mod+D)",
    ],
    resolution:
      "팔레트 흡수(3단계)에서 팔레트 표기를 `⌘J` 로 정정한다. 카탈로그의 정본은 edit.duplicate=⌘J, select.deselect=⌘D.",
  },
  {
    id: "delete-clear-vs-remove",
    kind: "behavior-divergence",
    key: "Delete",
    commandIds: ["edit.clear-selection", "edit.delete-selection"],
    detail:
      "`Delete` 키 경로만 말풍선 포인트 / 픽셀 영역 / 엘리먼트 3분기를 갖는다. 메뉴의 `선택 제거`(내용 지우기)와 팔레트·라디얼의 `선택 삭제`(요소 삭제)가 다른 결과를 낸다.",
    evidence: [
      "StudioPage.tsx:24030-24058 (키보드 3분기)",
      "studio-edit-controls.ts:64 (clear-selection, Delete)",
      "studio-quick-access-integration.ts:163-169 (delete, Delete)",
    ],
    resolution:
      "두 명령을 분리 유지하고, `Delete` 는 컨텍스트에 따라 둘 중 하나로 라우팅하는 단일 디스패처를 둔다. 메뉴·팔레트 라벨을 '내용 지우기' / '요소 삭제'로 구분한다.",
  },
  {
    id: "layer-order-chord-inversion",
    kind: "shortcut-divergence",
    commandIds: ["layer.send-back", "layer.send-backward"],
    detail:
      "앞으로 보내기 쌍은 Photoshop 과 같지만(맨 위 ⌘⇧], 위 ⌘]), 뒤로 보내기 쌍은 뒤집혀 있다(맨 뒤 ⌘[, 뒤 ⌘⇧[). Photoshop·CSP 는 맨 뒤가 ⌘⇧[ 다.",
    evidence: [
      "studio-edit-controls.ts:76 (bring-front ⌘⇧])",
      "studio-edit-controls.ts:82 (bring-forward ⌘])",
      "studio-edit-controls.ts:88 (send-back ⌘[)",
      "studio-edit-controls.ts:94 (send-backward ⌘⇧[)",
    ],
    resolution:
      "메뉴 흡수(2단계)에서 send-back=⌘⇧[, send-backward=⌘[ 로 정정한다. 사용자 키맵 마이그레이션이 필요하므로 단독 커밋으로 분리한다.",
  },
  {
    id: "zoom-chord-divergence",
    kind: "shortcut-divergence",
    commandIds: ["view.zoom-in", "view.zoom-out", "view.fit-width"],
    detail:
      "메뉴는 확대·축소를 `=`/`-`, 화면 맞춤을 `Home` 으로 문서화하는데 도움말은 `⌘ +`/`⌘ −`/`⌘ 0` 으로 문서화한다. 같은 명령의 두 문서가 다르다.",
    evidence: [
      "studio-main-menu-groups.ts:603,613,662",
      "StudioShortcutsHelp.tsx:128,129,130",
    ],
    resolution:
      "키맵 흡수(1단계)에서 실제 바인딩을 계측해 정본을 정하고, 메뉴·도움말이 카탈로그의 `shortcut` 을 렌더하도록 바꾼다(수기 문자열 제거).",
  },
  {
    id: "cmd-s-unbound",
    kind: "unbound-shortcut",
    key: "⌘S",
    commandIds: ["file.save-draft"],
    detail:
      "메뉴와 빠른 액세스 deck 이 모두 `⌘S` 를 표시하지만 `KeyS`+meta 핸들러가 없다. 합성 keydown 결과 defaultPrevented=false 로 재확인됐다.",
    evidence: [
      "studio-main-menu-groups.ts:237",
      "studio-quick-access-integration.ts:85-92",
    ],
    resolution:
      "키맵 흡수(1단계)에서 바인딩을 추가하거나 표기를 제거한다. 표기만 남기는 선택지는 금지한다.",
  },
  {
    id: "dead-keymap-entries",
    kind: "dead-entry",
    commandIds: ["edit.undo", "edit.redo", "tool.hand"],
    detail:
      "커스터마이즈 키맵의 `undo`·`redo`·`tool-hand` 3개는 설정에서 바꿔도 아무 일도 일어나지 않는다. 실제 처리는 StudioPage 하드코딩이다.",
    evidence: [
      "studio-app-settings.ts:104 (undo)",
      "studio-app-settings.ts:105 (redo)",
      "studio-app-settings.ts:85 (tool-hand)",
      "StudioPage.tsx:23821 (하드코딩 undo)",
    ],
    resolution:
      "키맵 흡수(1단계)의 첫 작업. 레지스트리가 chord→CommandId 를 단일 소스로 갖게 되면 dead 엔트리는 구조적으로 불가능해진다.",
  },
  {
    id: "eyedropper-toggle-divergence",
    kind: "behavior-divergence",
    commandIds: ["tool.eyedropper"],
    detail:
      "키보드 `I` 와 툴레일은 토글이고, Quick Deck·라디얼은 항상 ON 이다. 같은 명령이 진입점에 따라 다르게 동작한다.",
    evidence: [
      "StudioPage.tsx:23581-23586 (키보드 토글)",
      "StudioLeftToolRail.tsx:787-793 (툴레일 토글)",
      "StudioPage.tsx:23117-23119 (라디얼 항상 ON)",
    ],
    resolution:
      "라디얼 흡수(4단계)에서 토글 시맨틱으로 통일한다. 스포이드는 '집고 원래 도구로 복귀'가 CSP·Procreate 공통 기대다.",
  },
  {
    id: "fill-id-divergence",
    kind: "id-divergence",
    commandIds: ["tool.fill"],
    detail:
      "같은 채우기 명령을 키맵은 `tool-fill`, 메뉴는 `draw/fill`, 팔레트는 `fill`, 라디얼은 `advanced-fill` 로 부른다.",
    evidence: [
      "studio-app-settings.ts:88",
      "studio-main-menu-groups.ts:1025",
      "studio-quick-access-integration.ts:15",
      "studio-quick-actions.ts:32 (advanced-fill)",
    ],
    resolution: "`tool.fill` 로 수렴. 라디얼의 `advanced-fill` 은 alias 로만 남긴다.",
  },
  {
    id: "balloon-id-divergence",
    kind: "id-divergence",
    commandIds: ["insert.balloon", "text.add-balloon"],
    detail:
      "메뉴 `insert/bubble` 과 라디얼·팔레트 `add-bubble` 이 같은 결과를 내지만 별도 id 로 유지된다.",
    evidence: [
      "studio-main-menu-groups.ts:528",
      "studio-quick-actions.ts:30",
      "studio-quick-access-integration.ts:24",
    ],
    resolution:
      "`text.add-balloon` 으로 수렴하고 메뉴 항목은 같은 명령을 가리키게 한다. §15.3 은 말풍선을 Text & Balloon 그룹에 둔다.",
  },
  {
    id: "transform-tool-vs-pixel",
    kind: "id-divergence",
    commandIds: ["tool.transform", "transform.pixel-selection"],
    detail:
      "키맵의 `tool-transform`(⇧T, 변형 도구)과 팔레트의 `transform`(픽셀 선택 변형)이 같은 단어를 쓰지만 다른 명령이다.",
    evidence: [
      "studio-app-settings.ts:95",
      "studio-quick-access-integration.ts:129-136",
    ],
    resolution:
      "라벨을 '변형 도구' / '픽셀 선택 변형'으로 명시 분리하고 팔레트 표기를 바꾼다.",
  },
  {
    id: "menu-item-id-collision",
    kind: "id-divergence",
    commandIds: ["window.app-settings"],
    detail:
      "메뉴 항목 id 는 전역 유일하지 않다. `app-settings` 가 view 그룹과 edit 그룹에 각각 존재한다. 그래서 카탈로그의 menu origin 은 `<group>/<item>` 로 한정한다.",
    evidence: [
      "studio-main-menu-groups.ts:870 (view/app-settings)",
      "studio-edit-controls.ts:108 (edit/app-settings)",
    ],
    resolution:
      "메뉴 흡수(2단계)에서 두 항목 모두 `window.app-settings` 를 가리키게 하고, 중복 노출은 제품 결정으로 남긴다(그룹별 접근성은 유지 가치가 있다).",
  },
  {
    id: "help-row-multiplexing",
    kind: "row-covers-multiple-commands",
    commandIds: [
      "tool.smudge",
      "tool.wet-mix",
      "edit.cut",
      "edit.copy",
      "edit.paste",
      "edit.paste-in-place",
      "layer.bring-front",
      "layer.bring-forward",
      "layer.send-back",
      "layer.send-backward",
      "brush.size-decrease",
      "brush.size-increase",
    ],
    detail:
      "도움말 37행 중 6행이 두 명령을 한 줄에 겸한다(`N · ⇧N`, `⌘X · ⌘C`, `⌘V · ⌘⇧V`, `⌘] · ⌘⇧]`, `⌘[ · ⌘⇧[`, `[ · ]`). 그래서 도움말 행 수(37)와 명령 수는 1:1 이 아니다.",
    evidence: [
      "StudioShortcutsHelp.tsx:49-55,63-66,91,92,111,112",
    ],
    resolution:
      "도움말이 카탈로그에서 렌더되면 행 병합은 표시 레이어의 결정이 된다. 병합 규칙을 `shortcut` 값에서 파생하도록 만든다.",
  },
]);

/**
 * Source rows that intentionally have **no** catalog entry, with the reason.
 * Empty means the five lists are 100% covered; the coverage test asserts that
 * every uncovered row is listed here rather than silently dropped.
 */
export const STUDIO_COMMAND_CATALOG_UNCOVERED: readonly {
  source: StudioCommandSource;
  nativeId: string;
  reason: string;
}[] = Object.freeze([]);

/* ----------------------------------------------------------------- lookups */

/** Catalog entries that claim the given source list row. */
export function findCatalogEntriesBySource(
  source: StudioCommandSource,
  nativeId: string,
): StudioCommandCatalogEntry[] {
  return STUDIO_COMMAND_CATALOG.filter((entry) =>
    entry.origins.some(
      (origin) => origin.source === source && origin.nativeId === nativeId,
    ),
  );
}

/** All native ids the catalog claims for a source list, deduplicated. */
export function catalogNativeIds(source: StudioCommandSource): string[] {
  const ids = new Set<string>();
  for (const entry of STUDIO_COMMAND_CATALOG) {
    for (const origin of entry.origins) {
      if (origin.source === source) ids.add(origin.nativeId);
    }
  }
  return [...ids];
}

/** Canonical chord → command ids. Only conflicts declared above may repeat. */
export function catalogShortcutIndex(): Map<string, CommandId[]> {
  const index = new Map<string, CommandId[]>();
  for (const entry of STUDIO_COMMAND_CATALOG) {
    if (!entry.shortcut) continue;
    const bucket = index.get(entry.shortcut);
    if (bucket) bucket.push(entry.id);
    else index.set(entry.shortcut, [entry.id]);
  }
  return index;
}
