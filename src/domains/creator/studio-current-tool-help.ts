/**
 * §15.3 Help ▸ Current Tool Help — "지금 잡고 있는 도구가 뭘 하는 물건인가".
 *
 * 정직성 규율이 이 파일의 설계를 결정한다. 우리에게는 **산문 도움말(HelpGraph)이
 * 아직 없다.** Wave A 카탈로그는 명령마다 `helpNodeId` 를 들고 있지만 그 노드를
 * 채운 문서는 한 글자도 없다. 그래서 이 모듈은 도움말이 있는 척하지 않는다.
 * `authoredHelp: false` 를 그대로 내보내고, 대신 **실재하는 것**만 모아 준다.
 *
 * - 카탈로그의 한국어·영어 라벨과 설명(있으면)
 * - 그 도구가 실제로 주장하는 단축키
 * - CSP·Photoshop·Krita·Procreate 에서 이 도구를 부르던 이름(별칭 실측치)
 * - 통합 검색 색인이 그 이름으로 찾아 주는 관련 명령·속성·패널·튜토리얼
 *
 * 관련 항목을 손으로 적지 않고 검색 색인에서 끌어오는 이유: 손으로 적은 표는
 * 기능이 바뀌면 조용히 거짓말이 된다. 색인은 카탈로그가 바뀌면 같이 바뀐다.
 *
 * 순수 모듈 — React·DOM 없음.
 */

import { STUDIO_COMMAND_CATALOG } from "./studio-command-catalog";
import { searchStudio } from "./studio-command-search";

import type { StudioCommandCatalogEntry } from "./studio-command-catalog";
import type { StudioSearchEntry } from "./studio-command-search";
import type { DrawMode, Tool } from "./studio-editor-tool-model";
import type { SelectionToolKind } from "./studio-selection-tools";
import type { TerminologyAlias } from "@toonspectrum/studio-command-registry";

/**
 * 캔버스 포인터를 지금 누가 쥐고 있는지 판정하는 데 필요한 최소 신호.
 *
 * `studio-canvas-tool-state-machine.ts` 의 보조 소유자(auxiliary owner) 개념과
 * 같은 우선순위를 쓴다 — 무장된 보조 도구가 기억된 기본 도구를 이긴다.
 */
export interface StudioActiveToolSignals {
  readonly tool: Tool;
  readonly drawMode: DrawMode;
  readonly commentPlacementActive?: boolean;
  readonly cropActive?: boolean;
  readonly transformActive?: boolean;
  readonly liquifyArmed?: boolean;
  readonly dodgeBurnArmed?: boolean;
  readonly wetMixArmed?: boolean;
  readonly smudgeArmed?: boolean;
  readonly quickMaskArmed?: boolean;
  readonly eyedropperArmed?: boolean;
  readonly quickShapeActive?: boolean;
  /** 픽셀 선택 도구가 무장돼 있으면 그 종류. */
  readonly pixelSelectionTool?: SelectionToolKind | "wand" | null;
}

/**
 * 픽셀 선택 도구 → 카탈로그 명령. `brush`(선택 영역을 붓으로 칠하기)와 `wand`
 * (마술봉)는 카탈로그에 대응 명령이 **없다** — 없는 것을 가까운 것에 억지로
 * 붙이면 도움말이 다른 도구를 설명하게 되므로 비워 둔다.
 */
const PIXEL_SELECTION_COMMANDS: Readonly<Record<string, string | null>> =
  Object.freeze({
    rect: "tool.marquee-rect",
    ellipse: "tool.marquee-ellipse",
    lasso: "tool.lasso",
    "poly-lasso": "tool.lasso",
    brush: null,
    wand: null,
  });

const DRAW_MODE_COMMANDS: Readonly<Record<DrawMode, string>> = Object.freeze({
  pen: "tool.pen",
  eraser: "tool.eraser",
  shape: "tool.smart-shape",
  pixel: "tool.pixel-pen",
  "lasso-fill": "tool.fill",
});

/**
 * 활성 도구를 카탈로그 명령 id 로 환원한다. 보조 도구 → 그리기 모드 → 기본 도구
 * 순서다. 카탈로그에 대응 명령이 없는 도구가 잡고 있으면 `null` — 그때 도움말은
 * "확인 못 함"이라고 말하지, 엉뚱한 도구를 설명하지 않는다.
 */
export function resolveStudioActiveToolCommandId(
  signals: StudioActiveToolSignals,
): string | null {
  if (signals.commentPlacementActive) return "tool.comment";
  if (signals.cropActive) return "tool.crop";
  if (signals.transformActive) return "tool.transform";
  if (signals.liquifyArmed) return "tool.liquify";
  if (signals.dodgeBurnArmed) return "tool.dodge-burn";
  if (signals.wetMixArmed) return "tool.wet-mix";
  if (signals.smudgeArmed) return "tool.smudge";
  if (signals.quickMaskArmed) return "select.quick-mask";
  if (signals.eyedropperArmed) return "tool.eyedropper";
  const pixelSelection = signals.pixelSelectionTool;
  if (pixelSelection) return PIXEL_SELECTION_COMMANDS[pixelSelection] ?? null;
  if (signals.tool === "hand") return "tool.hand";
  if (signals.tool === "select") return "tool.select";
  if (signals.quickShapeActive) return "tool.smart-shape";
  return DRAW_MODE_COMMANDS[signals.drawMode] ?? "tool.pen";
}

/* ------------------------------------------------------------------ view */

export interface StudioToolHelpRelatedItem {
  readonly id: string;
  readonly kind: StudioSearchEntry["kind"];
  readonly label: string;
  readonly location: string;
  readonly shortcut?: string;
  readonly description?: string;
}

export interface StudioToolHelpView {
  readonly commandId: string;
  readonly label: string;
  readonly labelEn: string | null;
  /** 카탈로그가 들고 있는 한 줄 설명. 없으면 `null` — 지어내지 않는다. */
  readonly description: string | null;
  readonly shortcut: string | null;
  readonly helpNodeId: string;
  /**
   * 이 도움말 노드를 채운 **산문 문서가 있는가**. 지금은 언제나 `false` 다.
   * HelpGraph 가 실제로 출하되면 이 값이 근거와 함께 바뀌어야 한다.
   */
  readonly authoredHelp: boolean;
  readonly aliases: readonly TerminologyAlias[];
  readonly related: readonly StudioToolHelpRelatedItem[];
  readonly tutorialIds: readonly string[];
}

let catalogIndex: Map<string, StudioCommandCatalogEntry> | null = null;

function entryById(commandId: string): StudioCommandCatalogEntry | null {
  catalogIndex ??= new Map(
    STUDIO_COMMAND_CATALOG.map((entry) => [entry.id, entry]),
  );
  return catalogIndex.get(commandId) ?? null;
}

function localized(
  entry: StudioCommandCatalogEntry,
  locale: string,
): { label: string | null; description: string | null } {
  const match = entry.labels.find((label) => label.locale === locale);
  return {
    label: match?.label ?? null,
    description: match?.description ?? null,
  };
}

const RELATED_LIMIT = 8;

/**
 * 카탈로그 + 검색 색인에서 실재하는 것만 모아 도구 도움말 뷰를 만든다.
 * 모르는 명령 id 면 `null` — 빈 껍데기를 만들어 "도움말이 있다"고 속이지 않는다.
 */
export function buildStudioToolHelp(commandId: string): StudioToolHelpView | null {
  const entry = entryById(commandId);
  if (!entry) return null;

  const ko = localized(entry, "ko");
  const en = localized(entry, "en");
  const label = ko.label ?? en.label ?? entry.id;

  // 색인은 라벨로 조회한다 — 사용자가 도구 이름으로 검색했을 때와 같은 결과를
  // 보여 주는 편이 "검색과 도움말이 다른 말을 한다"는 혼란보다 낫다.
  const outcome = searchStudio(label, { sectionLimit: 4, totalLimit: 16 });
  const related: StudioToolHelpRelatedItem[] = [];
  const tutorialIds: string[] = [];
  for (const section of outcome.sections) {
    for (const result of section.results) {
      const target = result.entry.target;
      if (target.type === "tutorial") tutorialIds.push(target.tutorialId);
      if (result.entry.id === entry.id) continue;
      if (related.length >= RELATED_LIMIT) continue;
      related.push({
        id: result.entry.id,
        kind: result.entry.kind,
        label: result.entry.label,
        location: result.entry.location,
        ...(result.entry.shortcut === undefined
          ? {}
          : { shortcut: result.entry.shortcut }),
        ...(result.entry.description === undefined
          ? {}
          : { description: result.entry.description }),
      });
    }
  }

  return {
    commandId: entry.id,
    label,
    labelEn: en.label,
    description: ko.description ?? en.description,
    shortcut: entry.shortcut ?? null,
    helpNodeId: entry.helpNodeId,
    authoredHelp: false,
    aliases: entry.aliases,
    related,
    tutorialIds,
  };
}
