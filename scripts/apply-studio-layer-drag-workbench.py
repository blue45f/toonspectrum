from __future__ import annotations

from pathlib import Path
from textwrap import dedent

ROOT = Path(__file__).resolve().parents[1]


def replace_once(relative: str, old: str, new: str) -> None:
    path = ROOT / relative
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{relative}: expected one replacement target, found {count}: {old[:120]!r}")
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


def insert_before_once(relative: str, marker: str, addition: str) -> None:
    replace_once(relative, marker, addition + marker)


def write(relative: str, content: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dedent(content).lstrip(), encoding="utf-8")


# ---------------------------------------------------------------------------
# Core immutable z-order planner
# ---------------------------------------------------------------------------
insert_before_once(
    "apps/web/src/domains/creator/studio-layers.ts",
    "/**\n * 단일 레이어의 모든 순서 명령을 그룹 블록 불변식에 맞춰 처리한다.\n",
    r'''
export type LayerSelectionDropSide = "front" | "back";

export type LayerSelectionDropScope =
  | { kind: "units" }
  | { kind: "siblings"; groupId: string | undefined };

/**
 * 선택 레이어를 임의의 대상 앞/뒤로 옮기는 드롭 플래너.
 *
 * - `units`: 그룹 자식 하나라도 선택되면 그룹 전체를 하나의 시각 단위로 이동한다.
 * - `siblings`: 같은 그룹의 자식 또는 그룹 밖 레이어만 정확히 이동한다. 그룹 밖 형제는
 *   다른 그룹 블록을 안전하게 건널 수 있지만 그 블록을 절대 찢지 않는다.
 * - `side=front`: 패널에서 대상 위, z-order 배열에서는 대상 뒤(더 큰 인덱스).
 * - `side=back`: 패널에서 대상 아래, z-order 배열에서는 대상 앞(더 작은 인덱스).
 *
 * 입력 배열과 객체는 변형하지 않으며, 결과가 같거나 불변식을 확인할 수 없으면 원본 참조를
 * 반환한다. 그래서 UI의 반복 dragover 표본이 문서 히스토리를 오염시키지 않는다.
 */
export function reorderLayerSelectionToTarget<T extends LayerItemLike>(
  items: T[],
  selectedIds: readonly string[],
  targetId: string,
  side: LayerSelectionDropSide,
  scope: LayerSelectionDropScope = { kind: "units" }
): T[] {
  const requestedIds = new Set(selectedIds);
  if (requestedIds.size === 0 || !items.some((item) => item.id === targetId)) return items;

  if (scope.kind === "siblings" && scope.groupId !== undefined) {
    const run = groupRun(items, scope.groupId);
    if (!run.contiguous || run.count === 0) return items;
    const block = items.slice(run.first, run.last + 1);
    if (!block.some((item) => item.id === targetId)) return items;
    const moving = block.filter((item) => requestedIds.has(item.id));
    if (moving.length === 0 || moving.some((item) => item.id === targetId)) return items;
    const rest = block.filter((item) => !requestedIds.has(item.id));
    const targetIndex = rest.findIndex((item) => item.id === targetId);
    if (targetIndex < 0) return items;
    const insertIndex = targetIndex + (side === "front" ? 1 : 0);
    const nextBlock = [
      ...rest.slice(0, insertIndex),
      ...moving,
      ...rest.slice(insertIndex),
    ];
    const next = [
      ...items.slice(0, run.first),
      ...nextBlock,
      ...items.slice(run.last + 1),
    ];
    return next.every((item, index) => item === items[index]) ? items : next;
  }

  if (scope.kind === "siblings") {
    const target = items.find((item) => item.id === targetId);
    if (!target || target.groupId !== undefined) return items;
    for (const item of items) {
      if (requestedIds.has(item.id) && item.groupId !== undefined) return items;
    }
  }

  const units: T[][] = [];
  for (let index = 0; index < items.length;) {
    const item = items[index]!;
    if (item.groupId === undefined) {
      units.push([item]);
      index += 1;
      continue;
    }
    const run = groupRun(items, item.groupId);
    if (!run.contiguous || run.first !== index) return items;
    units.push(items.slice(run.first, run.last + 1));
    index = run.last + 1;
  }

  const selectedGroupIds = scope.kind === "units"
    ? new Set(
        items
          .filter((item) => requestedIds.has(item.id) && item.groupId !== undefined)
          .map((item) => item.groupId!)
      )
    : new Set<string>();
  const unitSelected = (unit: readonly T[]) =>
    scope.kind === "units"
      ? unit.some(
          (item) =>
            requestedIds.has(item.id) ||
            (item.groupId !== undefined && selectedGroupIds.has(item.groupId))
        )
      : unit.length === 1 &&
        unit[0]!.groupId === undefined &&
        requestedIds.has(unit[0]!.id);

  const movingUnits = units.filter(unitSelected);
  if (movingUnits.length === 0 || movingUnits.length === units.length) return items;
  const remainingUnits = units.filter((unit) => !unitSelected(unit));
  const targetUnitIndex = remainingUnits.findIndex((unit) =>
    unit.some((item) => item.id === targetId)
  );
  if (targetUnitIndex < 0) return items;
  const insertIndex = targetUnitIndex + (side === "front" ? 1 : 0);
  const next = [
    ...remainingUnits.slice(0, insertIndex),
    ...movingUnits,
    ...remainingUnits.slice(insertIndex),
  ].flat();
  return next.every((item, index) => item === items[index]) ? items : next;
}

''',
)

replace_once(
    "apps/web/src/domains/creator/studio-layers.test.ts",
    "  reorderLayerSelection,\n",
    "  reorderLayerSelection,\n  reorderLayerSelectionToTarget,\n",
)
insert_before_once(
    "apps/web/src/domains/creator/studio-layers.test.ts",
    'describe("insertLayerCopiesAdjacent", () => {\n',
    r'''
describe("reorderLayerSelectionToTarget", () => {
  it("moves a scattered root selection around an arbitrary target as one stable block", () => {
    const input = makeItems(["back", "a", "middle", "b", "front"]);

    expect(ids(reorderLayerSelectionToTarget(input, ["a", "b"], "middle", "front"))).toEqual([
      "back",
      "middle",
      "a",
      "b",
      "front",
    ]);
    expect(ids(reorderLayerSelectionToTarget(input, ["a", "b"], "middle", "back"))).toEqual([
      "back",
      "a",
      "b",
      "middle",
      "front",
    ]);
  });

  it("expands a selected group child and moves the complete contiguous group unit", () => {
    const input = makeItems([
      "back",
      { id: "g1", groupId: "g" },
      { id: "g2", groupId: "g" },
      "middle",
      "front",
    ]);

    const next = reorderLayerSelectionToTarget(input, ["g1"], "front", "front");
    expect(ids(next)).toEqual(["back", "middle", "front", "g1", "g2"]);
    expect(hasContiguousLayerGroups(next)).toBe(true);
  });

  it("reorders exact children inside one group without moving the group block", () => {
    const input = makeItems([
      "back",
      { id: "g1", groupId: "g" },
      { id: "g2", groupId: "g" },
      { id: "g3", groupId: "g" },
      "front",
    ]);

    const next = reorderLayerSelectionToTarget(
      input,
      ["g1", "g3"],
      "g2",
      "front",
      { kind: "siblings", groupId: "g" }
    );
    expect(ids(next)).toEqual(["back", "g2", "g1", "g3", "front"]);
    expect(hasContiguousLayerGroups(next)).toBe(true);
  });

  it("moves root siblings across complete group units without splitting them", () => {
    const input = makeItems([
      "root-a",
      { id: "g1", groupId: "g" },
      { id: "g2", groupId: "g" },
      "root-b",
      "root-c",
    ]);

    const next = reorderLayerSelectionToTarget(
      input,
      ["root-a"],
      "root-b",
      "front",
      { kind: "siblings", groupId: undefined }
    );
    expect(ids(next)).toEqual(["g1", "g2", "root-b", "root-a", "root-c"]);
    expect(hasContiguousLayerGroups(next)).toBe(true);
  });

  it("fails closed for self drops, cross-scope targets, and damaged groups", () => {
    const input = makeItems(["back", "front"]);
    expect(reorderLayerSelectionToTarget(input, ["front"], "front", "back")).toBe(input);

    const grouped = makeItems([{ id: "a", groupId: "g" }, { id: "b", groupId: "g" }]);
    expect(
      reorderLayerSelectionToTarget(grouped, ["a"], "b", "front", {
        kind: "siblings",
        groupId: undefined,
      })
    ).toBe(grouped);

    const damaged = makeItems([
      { id: "a", groupId: "g" },
      "gap",
      { id: "b", groupId: "g" },
      "front",
    ]);
    expect(reorderLayerSelectionToTarget(damaged, ["a"], "front", "front")).toBe(damaged);
  });
});

''',
)

# ---------------------------------------------------------------------------
# Pure UI drag-intent resolver
# ---------------------------------------------------------------------------
write(
    "apps/web/src/domains/creator/layer/studio-layer-drag.ts",
    r'''
import type { LayerSelectionDropSide } from "../studio-layers";

export interface StudioLayerDragItemLike {
  id: string;
  groupId?: string;
}

export type StudioLayerDragSourceGroup = string | null | "mixed";

export type StudioLayerDragPayload =
  | {
      kind: "items";
      ids: readonly string[];
      sourceGroupId: StudioLayerDragSourceGroup;
      label: string;
    }
  | {
      kind: "group";
      ids: readonly string[];
      groupId: string;
      sourceGroupId: string;
      label: string;
    };

export type StudioLayerDropIntent =
  | {
      kind: "around";
      mode: "units" | "to-root";
      targetKey: string;
      targetId: string;
      side: LayerSelectionDropSide;
    }
  | {
      kind: "around";
      mode: "within-group" | "into-group";
      targetKey: string;
      targetId: string;
      side: LayerSelectionDropSide;
      groupId: string;
    }
  | {
      kind: "into-group";
      targetKey: string;
      groupId: string;
    };

export function studioLayerDragSourceGroup(
  items: readonly StudioLayerDragItemLike[],
  ids: readonly string[]
): StudioLayerDragSourceGroup {
  const requested = new Set(ids);
  let found = false;
  let common: string | null = null;
  for (const item of items) {
    if (!requested.has(item.id)) continue;
    const next = item.groupId ?? null;
    if (!found) {
      common = next;
      found = true;
      continue;
    }
    if (common !== next) return "mixed";
  }
  return common;
}

export function studioLayerDropSideFromPointer(
  clientY: number,
  top: number,
  height: number
): LayerSelectionDropSide {
  return clientY < top + Math.max(1, height) / 2 ? "front" : "back";
}

export function resolveStudioLayerItemDropIntent(input: {
  payload: StudioLayerDragPayload;
  targetKey: string;
  targetId: string;
  targetGroupId: string | null;
  side: LayerSelectionDropSide;
}): StudioLayerDropIntent | null {
  const { payload, targetKey, targetId, targetGroupId, side } = input;
  if (payload.ids.includes(targetId)) return null;

  if (payload.kind === "group") {
    if (targetGroupId === payload.groupId) return null;
    return { kind: "around", mode: "units", targetKey, targetId, side };
  }

  if (payload.sourceGroupId === "mixed") {
    return { kind: "around", mode: "units", targetKey, targetId, side };
  }

  if (targetGroupId !== null) {
    return payload.sourceGroupId === targetGroupId
      ? {
          kind: "around",
          mode: "within-group",
          targetKey,
          targetId,
          side,
          groupId: targetGroupId,
        }
      : {
          kind: "around",
          mode: "into-group",
          targetKey,
          targetId,
          side,
          groupId: targetGroupId,
        };
  }

  return typeof payload.sourceGroupId === "string"
    ? { kind: "around", mode: "to-root", targetKey, targetId, side }
    : { kind: "around", mode: "units", targetKey, targetId, side };
}

export function resolveStudioLayerGroupDropIntent(input: {
  payload: StudioLayerDragPayload;
  targetKey: string;
  targetGroupId: string;
  targetId: string | null;
  relativeY: number;
}): StudioLayerDropIntent | null {
  const { payload, targetKey, targetGroupId, targetId } = input;
  const relativeY = Math.max(0, Math.min(1, input.relativeY));
  if (payload.kind === "group" && payload.groupId === targetGroupId) return null;

  const centerDrop = relativeY >= 0.28 && relativeY <= 0.72;
  if (
    payload.kind === "items" &&
    payload.sourceGroupId !== "mixed" &&
    payload.sourceGroupId !== targetGroupId &&
    centerDrop
  ) {
    return { kind: "into-group", targetKey, groupId: targetGroupId };
  }
  if (!targetId) return null;

  const side: LayerSelectionDropSide = relativeY < 0.5 ? "front" : "back";
  if (payload.kind === "group") {
    return { kind: "around", mode: "units", targetKey, targetId, side };
  }
  if (payload.sourceGroupId === targetGroupId) return null;
  if (payload.sourceGroupId === "mixed") {
    return { kind: "around", mode: "units", targetKey, targetId, side };
  }
  return typeof payload.sourceGroupId === "string"
    ? { kind: "around", mode: "to-root", targetKey, targetId, side }
    : { kind: "around", mode: "units", targetKey, targetId, side };
}

export function studioLayerDropIntentEqual(
  left: StudioLayerDropIntent | null,
  right: StudioLayerDropIntent | null
): boolean {
  if (left === right) return true;
  if (!left || !right || left.kind !== right.kind) return false;
  if (left.kind === "into-group" && right.kind === "into-group") {
    return left.targetKey === right.targetKey && left.groupId === right.groupId;
  }
  if (left.kind !== "around" || right.kind !== "around") return false;
  const leftGroupId = "groupId" in left ? left.groupId : null;
  const rightGroupId = "groupId" in right ? right.groupId : null;
  return (
    left.mode === right.mode &&
    left.targetKey === right.targetKey &&
    left.targetId === right.targetId &&
    left.side === right.side &&
    leftGroupId === rightGroupId
  );
}
''',
)

write(
    "apps/web/src/domains/creator/layer/studio-layer-drag.test.ts",
    r'''
import { describe, expect, it } from "vitest";

import {
  resolveStudioLayerGroupDropIntent,
  resolveStudioLayerItemDropIntent,
  studioLayerDragSourceGroup,
  studioLayerDropIntentEqual,
  studioLayerDropSideFromPointer,
  type StudioLayerDragPayload,
} from "./studio-layer-drag";

const rootPayload: StudioLayerDragPayload = {
  kind: "items",
  ids: ["loose"],
  sourceGroupId: null,
  label: "loose",
};
const groupedPayload: StudioLayerDragPayload = {
  kind: "items",
  ids: ["child"],
  sourceGroupId: "source",
  label: "child",
};

describe("studio layer drag intent", () => {
  it("classifies root, common-group, and mixed selections deterministically", () => {
    const items = [
      { id: "root" },
      { id: "a", groupId: "g" },
      { id: "b", groupId: "g" },
      { id: "c", groupId: "other" },
    ];
    expect(studioLayerDragSourceGroup(items, ["root"])).toBeNull();
    expect(studioLayerDragSourceGroup(items, ["a", "b"])).toBe("g");
    expect(studioLayerDragSourceGroup(items, ["a", "c"])).toBe("mixed");
  });

  it("maps the pointer half to front/back panel placement", () => {
    expect(studioLayerDropSideFromPointer(109, 100, 20)).toBe("front");
    expect(studioLayerDropSideFromPointer(111, 100, 20)).toBe("back");
  });

  it("resolves item drops as root reorder, group-local reorder, cross-group move, or detach", () => {
    expect(
      resolveStudioLayerItemDropIntent({
        payload: rootPayload,
        targetKey: "root-target",
        targetId: "target",
        targetGroupId: null,
        side: "front",
      })
    ).toMatchObject({ kind: "around", mode: "units", side: "front" });

    expect(
      resolveStudioLayerItemDropIntent({
        payload: { ...groupedPayload, sourceGroupId: "target" },
        targetKey: "same-group",
        targetId: "sibling",
        targetGroupId: "target",
        side: "back",
      })
    ).toMatchObject({ kind: "around", mode: "within-group", groupId: "target" });

    expect(
      resolveStudioLayerItemDropIntent({
        payload: groupedPayload,
        targetKey: "other-group",
        targetId: "other-child",
        targetGroupId: "target",
        side: "front",
      })
    ).toMatchObject({ kind: "around", mode: "into-group", groupId: "target" });

    expect(
      resolveStudioLayerItemDropIntent({
        payload: groupedPayload,
        targetKey: "root",
        targetId: "loose-target",
        targetGroupId: null,
        side: "back",
      })
    ).toMatchObject({ kind: "around", mode: "to-root" });
  });

  it("uses a group-row center as an explicit membership target and its edges as root order", () => {
    expect(
      resolveStudioLayerGroupDropIntent({
        payload: rootPayload,
        targetKey: "group:g",
        targetGroupId: "g",
        targetId: "g-front",
        relativeY: 0.5,
      })
    ).toEqual({ kind: "into-group", targetKey: "group:g", groupId: "g" });

    expect(
      resolveStudioLayerGroupDropIntent({
        payload: groupedPayload,
        targetKey: "group:g",
        targetGroupId: "g",
        targetId: "g-front",
        relativeY: 0.05,
      })
    ).toMatchObject({ kind: "around", mode: "to-root", side: "front" });

    expect(
      resolveStudioLayerGroupDropIntent({
        payload: rootPayload,
        targetKey: "group:empty",
        targetGroupId: "empty",
        targetId: null,
        relativeY: 0.5,
      })
    ).toEqual({ kind: "into-group", targetKey: "group:empty", groupId: "empty" });
  });

  it("rejects self targets and compares intents without allocations", () => {
    expect(
      resolveStudioLayerItemDropIntent({
        payload: rootPayload,
        targetKey: "self",
        targetId: "loose",
        targetGroupId: null,
        side: "front",
      })
    ).toBeNull();

    const first = {
      kind: "around" as const,
      mode: "units" as const,
      targetKey: "target",
      targetId: "target",
      side: "front" as const,
    };
    expect(studioLayerDropIntentEqual(first, { ...first })).toBe(true);
    expect(studioLayerDropIntentEqual(first, { ...first, side: "back" })).toBe(false);
  });
});
''',
)

# ---------------------------------------------------------------------------
# Navigator action contract and host operations
# ---------------------------------------------------------------------------
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "  Ghost,\n  Crosshair,\n",
    "  Ghost,\n  GripVertical,\n  Crosshair,\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "  type KeyboardEvent as ReactKeyboardEvent,\n  type MouseEvent as ReactMouseEvent,\n",
    "  type DragEvent as ReactDragEvent,\n  type KeyboardEvent as ReactKeyboardEvent,\n  type MouseEvent as ReactMouseEvent,\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    'import type { LayerGroup } from "../studio-layers";\n',
    'import type {\n  LayerGroup,\n  LayerItemReorderDirection,\n  LayerSelectionDropSide,\n} from "../studio-layers";\n',
)
insert_before_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    'import { StudioLayerNavigatorBatchBar } from "./StudioLayerNavigatorBatchBar";\n',
    r'''import {
  resolveStudioLayerGroupDropIntent,
  resolveStudioLayerItemDropIntent,
  studioLayerDragSourceGroup,
  studioLayerDropIntentEqual,
  studioLayerDropSideFromPointer,
  type StudioLayerDragPayload,
  type StudioLayerDropIntent,
} from "./studio-layer-drag";
''',
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    '  | { type: "set-items-color"; ids: readonly string[]; color?: StudioLayerColor }\n  /** up=FRONT/높은 z 쪽, down=BACK/낮은 z 쪽. 필터 활성 중에는 UI가 명령을 내보내지 않는다. */\n',
    '  | { type: "set-items-color"; ids: readonly string[]; color?: StudioLayerColor }\n'
    '  | { type: "reorder-items"; ids: readonly string[]; direction: LayerItemReorderDirection }\n'
    '  | {\n'
    '      type: "drop-items";\n'
    '      ids: readonly string[];\n'
    '      targetId: string;\n'
    '      side: LayerSelectionDropSide;\n'
    '      mode: "units" | "to-root";\n'
    '    }\n'
    '  | {\n'
    '      type: "drop-items";\n'
    '      ids: readonly string[];\n'
    '      targetId: string;\n'
    '      side: LayerSelectionDropSide;\n'
    '      mode: "within-group" | "into-group";\n'
    '      groupId: string;\n'
    '    }\n'
    '  /** up=FRONT/높은 z 쪽, down=BACK/낮은 z 쪽. 필터 활성 중에는 UI가 명령을 내보내지 않는다. */\n',
)
insert_before_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "/**\n * The host can only bake a merge when every source is an image layer; anything else falls back to a\n",
    r'''
function layerOrderShortcutDirection(
  event: ReactKeyboardEvent<HTMLElement>
): LayerItemReorderDirection | null {
  const command = event.metaKey || event.ctrlKey;
  if (command && !event.altKey) {
    if (event.code === "BracketRight" || event.key === "]") {
      return event.shiftKey ? "front" : "forward";
    }
    if (event.code === "BracketLeft" || event.key === "[") {
      return event.shiftKey ? "back" : "backward";
    }
  }
  if (event.altKey && !command) {
    if (event.key === "ArrowUp") return event.shiftKey ? "front" : "forward";
    if (event.key === "ArrowDown") return event.shiftKey ? "back" : "backward";
  }
  return null;
}

function layerOrderDirectionLabel(direction: LayerItemReorderDirection): string {
  switch (direction) {
    case "front":
      return "맨 앞으로";
    case "back":
      return "맨 뒤로";
    case "forward":
      return "한 단계 앞으로";
    case "backward":
      return "한 단계 뒤로";
  }
}

''',
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "  const mergeDownFallbackNoteId = useId();\n  const [query, setQuery] = useState(\"\");\n",
    "  const mergeDownFallbackNoteId = useId();\n  const dragHelpId = useId();\n  const [query, setQuery] = useState(\"\");\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "  const [readOnlyCollapsed, setReadOnlyCollapsed] = useState<Record<string, boolean>>({});\n\n  const searchInputRef",
    "  const [readOnlyCollapsed, setReadOnlyCollapsed] = useState<Record<string, boolean>>({});\n"
    "  const [draggingLabel, setDraggingLabel] = useState<string | null>(null);\n"
    "  const [dropIntent, setDropIntent] = useState<StudioLayerDropIntent | null>(null);\n\n"
    "  const searchInputRef",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "  const rowRefs = useRef(new Map<string, HTMLElement>());\n\n  const displayItems = stableFrontToBack(items);\n",
    "  const rowRefs = useRef(new Map<string, HTMLElement>());\n"
    "  const dragPayloadRef = useRef<StudioLayerDragPayload | null>(null);\n"
    "  const dropIntentRef = useRef<StudioLayerDropIntent | null>(null);\n\n"
    "  const displayItems = stableFrontToBack(items);\n"
    "  const displayItemById = new Map(displayItems.map((item) => [item.id, item]));\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "    setReadOnlyCollapsed({});\n    actionFallbackKeyRef.current = null;\n",
    "    setReadOnlyCollapsed({});\n"
    "    dragPayloadRef.current = null;\n"
    "    dropIntentRef.current = null;\n"
    "    setDraggingLabel(null);\n"
    "    setDropIntent(null);\n"
    "    actionFallbackKeyRef.current = null;\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === \"a\") {\n"
    "      event.preventDefault();\n"
    "      event.stopPropagation();\n"
    "      onSelectionChange(visibleItemIds.slice(0, 500));\n"
    "      setSelectionAnchorId(visibleItemIds[0] ?? null);\n"
    "      return;\n"
    "    }\n"
    "    if ((event.shiftKey && event.key === \"F10\") || event.key === \"ContextMenu\") {\n",
    "    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === \"a\") {\n"
    "      event.preventDefault();\n"
    "      event.stopPropagation();\n"
    "      onSelectionChange(visibleItemIds.slice(0, 500));\n"
    "      setSelectionAnchorId(visibleItemIds[0] ?? null);\n"
    "      return;\n"
    "    }\n"
    "    const reorderDirection = layerOrderShortcutDirection(event);\n"
    "    if (reorderDirection) {\n"
    "      event.preventDefault();\n"
    "      event.stopPropagation();\n"
    "      const reorderIds = target.kind === \"group\"\n"
    "        ? target.itemIds\n"
    "        : selectedIdSet.has(target.entry.item.id)\n"
    "          ? selectedIds\n"
    "          : [target.entry.item.id];\n"
    "      if (filterActive) {\n"
    "        setDragAnnouncement(\"검색·필터를 지운 뒤 레이어 순서를 바꿀 수 있어요.\");\n"
    "        return;\n"
    "      }\n"
    "      const reorderGate = studioLiveSelectionEditGate({\n"
    "        selectedIds: reorderIds,\n"
    "        ownershipByItemId: liveOwnershipByItemId,\n"
    "      });\n"
    "      if (readOnly || reorderGate.allowed === false || reorderIds.length === 0) {\n"
    "        setDragAnnouncement(\n"
    "          reorderGate.reason ?? \"현재 상태에서는 레이어 순서를 바꿀 수 없어요.\"\n"
    "        );\n"
    "        return;\n"
    "      }\n"
    "      onAction({ type: \"reorder-items\", ids: [...reorderIds], direction: reorderDirection });\n"
    "      setDragAnnouncement(\n"
    "        `${reorderIds.length}개 레이어를 ${layerOrderDirectionLabel(reorderDirection)} 이동했습니다.`\n"
    "      );\n"
    "      return;\n"
    "    }\n"
    "    if ((event.shiftKey && event.key === \"F10\") || event.key === \"ContextMenu\") {\n",
)

# Add drag state helpers before the stable row handler bridge.
insert_before_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "  // 행 memo 를 깨지 않는 identity-stable 이벤트 브리지 — 이벤트 시점에 최신 클로저를 읽는다.\n",
    r'''
  function updateLayerDropIntent(next: StudioLayerDropIntent | null) {
    dropIntentRef.current = next;
    setDropIntent((current) => (studioLayerDropIntentEqual(current, next) ? current : next));
  }

  function finishLayerDrag() {
    dragPayloadRef.current = null;
    setDraggingLabel(null);
    updateLayerDropIntent(null);
  }

  function seedNativeLayerDrag(
    event: ReactDragEvent<HTMLElement>,
    payload: StudioLayerDragPayload
  ) {
    dragPayloadRef.current = payload;
    setDraggingLabel(payload.label);
    updateLayerDropIntent(null);
    event.dataTransfer.effectAllowed = "move";
    try {
      event.dataTransfer.setData("application/x-toonstudio-layer", JSON.stringify(payload.ids));
      event.dataTransfer.setData("text/plain", payload.label);
    } catch {
      // Some embedded WebViews restrict custom data types; the in-memory payload remains canonical.
    }
  }

  function beginItemLayerDrag(
    event: ReactDragEvent<HTMLElement>,
    itemId: string
  ) {
    const item = displayItemById.get(itemId);
    if (!item || filterActive || readOnly) {
      event.preventDefault();
      return;
    }
    const ids = selectedIdSet.has(itemId)
      ? [...new Set(selectedIds)].filter((id) => displayItemById.has(id)).slice(0, 500)
      : [itemId];
    if (ids.length === 0) {
      event.preventDefault();
      return;
    }
    const gate = studioLiveSelectionEditGate({
      selectedIds: ids,
      ownershipByItemId: liveOwnershipByItemId,
    });
    if (gate.allowed === false) {
      event.preventDefault();
      setDragAnnouncement(gate.reason ?? "다른 참가자가 편집 중인 레이어예요.");
      return;
    }
    if (!selectedIdSet.has(itemId)) {
      onSelectionChange(ids);
      setSelectionAnchorId(itemId);
    }
    seedNativeLayerDrag(event, {
      kind: "items",
      ids,
      sourceGroupId: studioLayerDragSourceGroup(displayItems, ids),
      label: ids.length > 1 ? `선택 레이어 ${ids.length}개` : item.label,
    });
  }

  function beginGroupLayerDrag(
    event: ReactDragEvent<HTMLElement>,
    groupId: string,
    groupName: string,
    itemIds: readonly string[]
  ) {
    if (filterActive || readOnly || itemIds.length === 0) {
      event.preventDefault();
      return;
    }
    const gate = studioLiveSelectionEditGate({
      selectedIds: itemIds,
      ownershipByItemId: liveOwnershipByItemId,
    });
    if (gate.allowed === false) {
      event.preventDefault();
      setDragAnnouncement(gate.reason ?? "다른 참가자가 편집 중인 그룹이에요.");
      return;
    }
    if (!itemIds.every((id) => selectedIdSet.has(id))) replaceWithGroupItems(itemIds);
    seedNativeLayerDrag(event, {
      kind: "group",
      ids: [...itemIds],
      groupId,
      sourceGroupId: groupId,
      label: `${groupName} 그룹 · ${itemIds.length}개`,
    });
  }

  function updateItemLayerDrop(
    event: ReactDragEvent<HTMLElement>,
    itemId: string,
    targetKey: string
  ) {
    const payload = dragPayloadRef.current;
    const item = displayItemById.get(itemId);
    if (!payload || !item || filterActive || readOnly) {
      updateLayerDropIntent(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const intent = resolveStudioLayerItemDropIntent({
      payload,
      targetKey,
      targetId: itemId,
      targetGroupId: item.groupId ?? null,
      side: studioLayerDropSideFromPointer(event.clientY, rect.top, rect.height),
    });
    if (!intent) {
      event.dataTransfer.dropEffect = "none";
      updateLayerDropIntent(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    updateLayerDropIntent(intent);
  }

  function updateGroupLayerDrop(
    event: ReactDragEvent<HTMLElement>,
    groupId: string,
    targetKey: string,
    itemIds: readonly string[]
  ) {
    const payload = dragPayloadRef.current;
    if (!payload || filterActive || readOnly) {
      updateLayerDropIntent(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const intent = resolveStudioLayerGroupDropIntent({
      payload,
      targetKey,
      targetGroupId: groupId,
      targetId: itemIds[0] ?? null,
      relativeY: (event.clientY - rect.top) / Math.max(1, rect.height),
    });
    if (!intent) {
      event.dataTransfer.dropEffect = "none";
      updateLayerDropIntent(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    updateLayerDropIntent(intent);
  }

  function leaveLayerDropTarget(event: ReactDragEvent<HTMLElement>, targetKey: string) {
    const related = event.relatedTarget;
    if (related instanceof Node && event.currentTarget.contains(related)) return;
    if (dropIntentRef.current?.targetKey === targetKey) updateLayerDropIntent(null);
  }

  function commitLayerDrop(event: ReactDragEvent<HTMLElement>) {
    const payload = dragPayloadRef.current;
    const intent = dropIntentRef.current;
    if (!payload || !intent) {
      finishLayerDrag();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (intent.kind === "into-group") {
      onAction({
        type: "assign-items-to-group",
        ids: [...payload.ids],
        groupId: intent.groupId,
      });
      setDragAnnouncement(`${payload.label}를 그룹 안으로 이동했습니다.`);
    } else if (intent.mode === "within-group" || intent.mode === "into-group") {
      onAction({
        type: "drop-items",
        ids: [...payload.ids],
        targetId: intent.targetId,
        side: intent.side,
        mode: intent.mode,
        groupId: intent.groupId,
      });
      setDragAnnouncement(`${payload.label}의 그룹 내 순서를 변경했습니다.`);
    } else {
      onAction({
        type: "drop-items",
        ids: [...payload.ids],
        targetId: intent.targetId,
        side: intent.side,
        mode: intent.mode,
      });
      setDragAnnouncement(
        intent.mode === "to-root"
          ? `${payload.label}를 그룹 밖으로 이동했습니다.`
          : `${payload.label}의 레이어 순서를 변경했습니다.`
      );
    }
    finishLayerDrag();
  }

''',
)

# Wire row handlers.
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "    onOpenItemActionMenu: (event, itemId) => {\n"
    "      openActionMenu(event, { kind: \"item\", id: itemId });\n"
    "    },\n"
    "    registerRowRef: (key, node) => {\n",
    "    onOpenItemActionMenu: (event, itemId) => {\n"
    "      openActionMenu(event, { kind: \"item\", id: itemId });\n"
    "    },\n"
    "    onItemDragStart: (event, itemId) => beginItemLayerDrag(event, itemId),\n"
    "    onItemDragEnd: finishLayerDrag,\n"
    "    onItemDragOver: (event, itemId, key) => updateItemLayerDrop(event, itemId, key),\n"
    "    onItemDragLeave: (event, key) => leaveLayerDropTarget(event, key),\n"
    "    onItemDrop: commitLayerDrop,\n"
    "    registerRowRef: (key, node) => {\n",
)

# Wire row drag props.
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "    const editing = renameTarget?.kind === \"item\" && renameTarget.id === item.id;\n"
    "    const liveOwnership = liveOwnershipByItemId.get(item.id) ?? null;\n"
    "    return (\n",
    "    const editing = renameTarget?.kind === \"item\" && renameTarget.id === item.id;\n"
    "    const liveOwnership = liveOwnershipByItemId.get(item.id) ?? null;\n"
    "    const rowDragIds = selectedIdSet.has(item.id) ? selectedIds : [item.id];\n"
    "    const rowDragGate = studioLiveSelectionEditGate({\n"
    "      selectedIds: rowDragIds,\n"
    "      ownershipByItemId: liveOwnershipByItemId,\n"
    "    });\n"
    "    const rowDropSide =\n"
    "      dropIntent?.kind === \"around\" && dropIntent.targetKey === key\n"
    "        ? dropIntent.side\n"
    "        : null;\n"
    "    return (\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "        actionPopoverId={actionPopoverId}\n"
    "        stableHandlers={rowHandlers}\n"
    "        liveOwnership={liveOwnership}\n",
    "        actionPopoverId={actionPopoverId}\n"
    "        stableHandlers={rowHandlers}\n"
    "        liveOwnership={liveOwnership}\n"
    "        dragEnabled={!editing && !filterActive && !readOnly && rowDragGate.allowed !== false}\n"
    "        dropSide={rowDropSide}\n"
    "        dragHelpId={dragHelpId}\n",
)

# Visible drag help and status.
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "        {filterActive ? (\n"
    "          <div className=\"mt-1.5 flex max-w-full items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden\">\n",
    "        {filterActive ? (\n"
    "          <div className=\"mt-1.5 flex max-w-full items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden\">\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "        ) : null}\n      </div>\n\n      <StudioLayerNavigatorFilterPanel\n",
    "        ) : null}\n"
    "        <p\n"
    "          id={dragHelpId}\n"
    "          className={cn(\n"
    "            \"mt-1.5 flex min-h-5 items-center gap-1 text-[0.58rem] leading-relaxed\",\n"
    "            filterActive ? \"text-warning\" : draggingLabel ? \"text-accent\" : \"text-fg-3\"\n"
    "          )}\n"
    "        >\n"
    "          <GripVertical size={11} aria-hidden />\n"
    "          <span className=\"min-w-0 flex-1 truncate\">\n"
    "            {filterActive\n"
    "              ? \"검색·필터를 지우면 끌어서 순서를 바꿀 수 있어요\"\n"
    "              : draggingLabel\n"
    "                ? `${draggingLabel} 이동 중 · 선은 순서, 그룹 중앙은 소속`\n"
    "                : \"핸들로 순서 변경 · 그룹 중앙에 놓아 소속 이동\"}\n"
    "          </span>\n"
    "          <kbd className=\"shrink-0 rounded border border-line bg-card px-1 py-0.5 font-mono text-[0.52rem]\">\n"
    "            ⌘[ / ⌘]\n"
    "          </kbd>\n"
    "        </p>\n"
    "        <p role=\"status\" aria-live=\"polite\" className=\"sr-only\">\n"
    "          {dragAnnouncement}\n"
    "        </p>\n"
    "      </div>\n\n"
    "      <StudioLayerNavigatorFilterPanel\n",
)

# The drag announcement state sits next to the other drag state.
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "  const [draggingLabel, setDraggingLabel] = useState<string | null>(null);\n"
    "  const [dropIntent, setDropIntent] = useState<StudioLayerDropIntent | null>(null);\n",
    "  const [draggingLabel, setDraggingLabel] = useState<string | null>(null);\n"
    "  const [dragAnnouncement, setDragAnnouncement] = useState(\"\");\n"
    "  const [dropIntent, setDropIntent] = useState<StudioLayerDropIntent | null>(null);\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "    setDraggingLabel(null);\n    setDropIntent(null);\n",
    "    setDraggingLabel(null);\n    setDragAnnouncement(\"\");\n    setDropIntent(null);\n",
)

# Batch reorder controls.
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "          mutationDisabled={mutationDisabled}\n          readOnly={readOnly}\n",
    "          mutationDisabled={mutationDisabled}\n"
    "          readOnly={readOnly}\n"
    "          reorderDisabled={mutationDisabled || filterActive || batchSelectedIds.length === 0}\n"
    "          reorderUnavailableReason={\n"
    "            readOnly\n"
    "              ? \"읽기 전용 작업공간에서는 레이어 순서를 바꿀 수 없어요.\"\n"
    "              : filterActive\n"
    "                ? \"검색·필터를 지운 뒤 전체 레이어 순서를 바꿀 수 있어요.\"\n"
    "                : liveSelectionBlocked\n"
    "                  ? selectionEditGate.reason\n"
    "                  : batchSelectedIds.length === 0\n"
    "                    ? \"먼저 레이어를 선택하세요.\"\n"
    "                    : undefined\n"
    "          }\n",
)

# Tree drag props.
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "          mutationDisabled={mutationDisabled}\n          mobileMultiSelect={mobileMultiSelect}\n",
    "          mutationDisabled={mutationDisabled}\n"
    "          mobileMultiSelect={mobileMultiSelect}\n"
    "          dragEnabled={!readOnly && !filterActive}\n"
    "          dragHelpId={dragHelpId}\n"
    "          dropIntent={dropIntent}\n"
    "          isGroupDragBlocked={(itemIds) =>\n"
    "            studioLiveSelectionEditGate({\n"
    "              selectedIds: itemIds,\n"
    "              ownershipByItemId: liveOwnershipByItemId,\n"
    "            }).allowed === false\n"
    "          }\n"
    "          onGroupDragStart={(event, group, itemIds) =>\n"
    "            beginGroupLayerDrag(event, group.id, group.name, itemIds)\n"
    "          }\n"
    "          onGroupDragEnd={finishLayerDrag}\n"
    "          onGroupDragOver={(event, group, key, itemIds) =>\n"
    "            updateGroupLayerDrop(event, group.id, key, itemIds)\n"
    "          }\n"
    "          onGroupDragLeave={leaveLayerDropTarget}\n"
    "          onGroupDrop={commitLayerDrop}\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    "      data-studio-shortcut-boundary=\"true\"\n",
    "      data-studio-shortcut-boundary=\"true\"\n"
    "      data-studio-layer-dragging={draggingLabel ? \"true\" : \"false\"}\n",
)

# Host operations use the same commit/history path as existing z-order commands.
replace_once(
    "apps/web/src/domains/creator/layer/studio-layer-operations.ts",
    "  reorderLayerSelection,\n  setItemGroup,\n",
    "  reorderLayerSelection,\n  reorderLayerSelectionToTarget,\n  setItemGroup,\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/studio-layer-operations.ts",
    "      case \"move-item\":\n        moveLayer(action.id, action.direction);\n        return;\n",
    r'''      case "reorder-items": {
        const requestedIds = [...new Set(action.ids)].filter((id) => elementById.has(id));
        if (requestedIds.length === 0) return;
        const next = reorderLayerSelection(elements, requestedIds, action.direction) as El[];
        if (next === elements || !commit(next)) return;
        announceDrawingShortcut(
          `${requestedIds.length}개 레이어 ${
            action.direction === "front"
              ? "맨 앞으로"
              : action.direction === "back"
                ? "맨 뒤로"
                : action.direction === "forward"
                  ? "한 단계 앞으로"
                  : "한 단계 뒤로"
          }`
        );
        return;
      }
      case "drop-items": {
        const requestedIds = [...new Set(action.ids)].filter((id) => elementById.has(id));
        if (requestedIds.length === 0 || !elementById.has(action.targetId)) return;
        let next = elements;
        if (action.mode === "to-root") {
          next = removeItemsFromGroups(next, requestedIds) as El[];
          next = reorderLayerSelectionToTarget(
            next,
            requestedIds,
            action.targetId,
            action.side,
            { kind: "siblings", groupId: undefined }
          ) as El[];
        } else if (action.mode === "within-group") {
          if (!groups.some((group) => group.id === action.groupId)) return;
          next = reorderLayerSelectionToTarget(
            next,
            requestedIds,
            action.targetId,
            action.side,
            { kind: "siblings", groupId: action.groupId }
          ) as El[];
        } else if (action.mode === "into-group") {
          if (!groups.some((group) => group.id === action.groupId)) return;
          next = groupItems(next, requestedIds, action.groupId) as El[];
          next = reorderLayerSelectionToTarget(
            next,
            requestedIds,
            action.targetId,
            action.side,
            { kind: "siblings", groupId: action.groupId }
          ) as El[];
        } else {
          next = reorderLayerSelectionToTarget(
            next,
            requestedIds,
            action.targetId,
            action.side
          ) as El[];
        }
        const changed =
          next.length !== elements.length ||
          next.some((item, index) => item !== elements[index]);
        if (!changed || !commit(next)) return;
        announceDrawingShortcut(
          action.mode === "into-group"
            ? `${requestedIds.length}개 레이어 그룹 이동`
            : action.mode === "to-root"
              ? `${requestedIds.length}개 레이어 그룹 밖으로 이동`
              : `${requestedIds.length}개 레이어 순서 변경`
        );
        return;
      }
      case "move-item":
        moveLayer(action.id, action.direction);
        return;
''',
)

# ---------------------------------------------------------------------------
# Item row drag handle and drop indicators
# ---------------------------------------------------------------------------
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorItemRow.tsx",
    "  Grid2X2,\n  Layers3,\n",
    "  Grid2X2,\n  GripVertical,\n  Layers3,\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorItemRow.tsx",
    "  type KeyboardEvent as ReactKeyboardEvent,\n",
    "  type DragEvent as ReactDragEvent,\n  type KeyboardEvent as ReactKeyboardEvent,\n",
)
insert_before_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorItemRow.tsx",
    'import type { StudioLiveLayerOwnership } from "../live/studio-live-layer-ownership";\n',
    'import type { LayerSelectionDropSide } from "../studio-layers";\n',
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorItemRow.tsx",
    "  onOpenItemActionMenu: (\n"
    "    event: ReactMouseEvent<HTMLButtonElement>,\n"
    "    itemId: string\n"
    "  ) => void;\n"
    "  registerRowRef: (key: string, node: HTMLElement | null) => void;\n",
    "  onOpenItemActionMenu: (\n"
    "    event: ReactMouseEvent<HTMLButtonElement>,\n"
    "    itemId: string\n"
    "  ) => void;\n"
    "  onItemDragStart?: (event: ReactDragEvent<HTMLElement>, itemId: string, key: string) => void;\n"
    "  onItemDragEnd?: () => void;\n"
    "  onItemDragOver?: (event: ReactDragEvent<HTMLElement>, itemId: string, key: string) => void;\n"
    "  onItemDragLeave?: (event: ReactDragEvent<HTMLElement>, key: string) => void;\n"
    "  onItemDrop?: (event: ReactDragEvent<HTMLElement>) => void;\n"
    "  registerRowRef: (key: string, node: HTMLElement | null) => void;\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorItemRow.tsx",
    "  liveOwnership?: StudioLiveLayerOwnership | null;\n}\n",
    "  liveOwnership?: StudioLiveLayerOwnership | null;\n"
    "  dragEnabled?: boolean;\n"
    "  dropSide?: LayerSelectionDropSide | null;\n"
    "  dragHelpId?: string;\n"
    "}\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorItemRow.tsx",
    "    stableHandlers,\n    liveOwnership = null,\n  }: StudioLayerNavigatorItemRowProps) {\n",
    "    stableHandlers,\n"
    "    liveOwnership = null,\n"
    "    dragEnabled = false,\n"
    "    dropSide = null,\n"
    "    dragHelpId,\n"
    "  }: StudioLayerNavigatorItemRowProps) {\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorItemRow.tsx",
    "          onDoubleClick={(event) =>\n"
    "            stableHandlers.onRowDoubleClick(event, item.id, item.label)\n"
    "          }\n"
    "          className={cn(\n",
    "          onDoubleClick={(event) =>\n"
    "            stableHandlers.onRowDoubleClick(event, item.id, item.label)\n"
    "          }\n"
    "          onDragOver={(event) => stableHandlers.onItemDragOver?.(event, item.id, rowKey)}\n"
    "          onDragLeave={(event) => stableHandlers.onItemDragLeave?.(event, rowKey)}\n"
    "          onDrop={(event) => stableHandlers.onItemDrop?.(event)}\n"
    "          className={cn(\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorItemRow.tsx",
    "          data-studio-live-ownership-blocked={peerBlocked ? \"true\" : \"false\"}\n        >\n",
    "          data-studio-live-ownership-blocked={peerBlocked ? \"true\" : \"false\"}\n"
    "          data-studio-layer-drop-side={dropSide ?? undefined}\n"
    "        >\n"
    "          {dropSide ? (\n"
    "            <span\n"
    "              aria-hidden\n"
    "              data-studio-layer-drop-indicator={dropSide}\n"
    "              className={cn(\n"
    "                \"pointer-events-none absolute inset-x-1 z-20 h-0.5 rounded-full bg-accent shadow-[0_0_0_1px_oklch(0.2_0.02_60),0_0_8px_oklch(0.72_0.18_42/0.75)]\",\n"
    "                dropSide === \"front\" ? \"-top-0.5\" : \"-bottom-0.5\"\n"
    "              )}\n"
    "            />\n"
    "          ) : null}\n",
)
# Add the handle immediately after the selection marker.
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorItemRow.tsx",
    "          </span>\n          {item.color ? (\n",
    "          </span>\n"
    "          <button\n"
    "            type=\"button\"\n"
    "            tabIndex={-1}\n"
    "            draggable={dragEnabled}\n"
    "            disabled={!dragEnabled}\n"
    "            data-layer-row-control\n"
    "            data-studio-layer-drag-handle=\"item\"\n"
    "            onClick={(event) => event.stopPropagation()}\n"
    "            onDragStart={(event) =>\n"
    "              stableHandlers.onItemDragStart?.(event, item.id, rowKey)\n"
    "            }\n"
    "            onDragEnd={() => stableHandlers.onItemDragEnd?.()}\n"
    "            aria-label={`${item.label} 레이어 끌어 순서 변경`}\n"
    "            aria-describedby={dragHelpId}\n"
    "            title={dragEnabled ? \"끌어서 순서를 바꾸거나 그룹으로 이동\" : undefined}\n"
    "            className={cn(\n"
    "              \"hidden size-6 shrink-0 cursor-grab place-items-center rounded text-fg-3 hover:bg-raised hover:text-fg active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-25 [@media(pointer:fine)]:grid\",\n"
    "              STUDIO_LAYER_NAVIGATOR_FOCUS_RING\n"
    "            )}\n"
    "          >\n"
    "            <GripVertical size={13} aria-hidden />\n"
    "          </button>\n"
    "          {item.color ? (\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorItemRow.tsx",
    '          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Space F2 Shift+F10 Control+A Meta+A Control+G Meta+G Shift+Control+G Shift+Meta+G"\n',
    '          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Space F2 Shift+F10 Control+A Meta+A Control+G Meta+G Shift+Control+G Shift+Meta+G Control+] Meta+] Shift+Control+] Shift+Meta+] Control+[ Meta+[ Shift+Control+[ Shift+Meta+[ Alt+ArrowUp Alt+ArrowDown Shift+Alt+ArrowUp Shift+Alt+ArrowDown"\n',
)

# ---------------------------------------------------------------------------
# Group row drag handle and target styling
# ---------------------------------------------------------------------------
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorTree.tsx",
    'import { ChevronDown, ChevronRight, Eye, EyeOff, Folder, Lock, LockOpen, MoreHorizontal, Search, Layers3, Check, Minus } from "lucide-react";\n',
    'import { ChevronDown, ChevronRight, Eye, EyeOff, Folder, GripVertical, Lock, LockOpen, MoreHorizontal, Search, Layers3, Check, Minus } from "lucide-react";\n',
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorTree.tsx",
    'import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";\n',
    'import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";\n',
)
insert_before_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorTree.tsx",
    'import type { StudioLayerNavigatorNode, StudioLayerNavigatorResult } from "./studio-layer-navigator";\n',
    'import type { LayerGroup } from "../studio-layers";\nimport type { StudioLayerDropIntent } from "./studio-layer-drag";\n',
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorTree.tsx",
    "  mutationDisabled: boolean;\n  mobileMultiSelect: boolean;\n",
    "  mutationDisabled: boolean;\n"
    "  mobileMultiSelect: boolean;\n"
    "  dragEnabled?: boolean;\n"
    "  dragHelpId?: string;\n"
    "  dropIntent?: StudioLayerDropIntent | null;\n"
    "  isGroupDragBlocked?: (itemIds: readonly string[]) => boolean;\n"
    "  onGroupDragStart?: (\n"
    "    event: ReactDragEvent<HTMLElement>,\n"
    "    group: LayerGroup,\n"
    "    itemIds: readonly string[]\n"
    "  ) => void;\n"
    "  onGroupDragEnd?: () => void;\n"
    "  onGroupDragOver?: (\n"
    "    event: ReactDragEvent<HTMLElement>,\n"
    "    group: LayerGroup,\n"
    "    key: string,\n"
    "    itemIds: readonly string[]\n"
    "  ) => void;\n"
    "  onGroupDragLeave?: (event: ReactDragEvent<HTMLElement>, key: string) => void;\n"
    "  onGroupDrop?: (event: ReactDragEvent<HTMLElement>) => void;\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorTree.tsx",
    "  mutationDisabled,\n  mobileMultiSelect,\n",
    "  mutationDisabled,\n"
    "  mobileMultiSelect,\n"
    "  dragEnabled = false,\n"
    "  dragHelpId,\n"
    "  dropIntent = null,\n"
    "  isGroupDragBlocked,\n"
    "  onGroupDragStart,\n"
    "  onGroupDragEnd,\n"
    "  onGroupDragOver,\n"
    "  onGroupDragLeave,\n"
    "  onGroupDrop,\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorTree.tsx",
    "        const selectedChildCount = target.itemIds.filter((id) => selectedIdSet.has(id)).length;\n",
    "        const selectedChildCount = target.itemIds.filter((id) => selectedIdSet.has(id)).length;\n"
    "        const groupDropIntent = dropIntent?.targetKey === key ? dropIntent : null;\n"
    "        const groupDropPosition =\n"
    "          groupDropIntent?.kind === \"into-group\" ? \"inside\" : groupDropIntent?.side ?? null;\n"
    "        const canDragGroup =\n"
    "          dragEnabled &&\n"
    "          !node.empty &&\n"
    "          !(isGroupDragBlocked?.(target.itemIds) ?? false);\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorTree.tsx",
    '              aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Space F2 Shift+F10 Control+A Meta+A Control+G Meta+G Shift+Control+G Shift+Meta+G"\n',
    '              aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Space F2 Shift+F10 Control+A Meta+A Control+G Meta+G Shift+Control+G Shift+Meta+G Control+] Meta+] Shift+Control+] Shift+Meta+] Control+[ Meta+[ Shift+Control+[ Shift+Meta+[ Alt+ArrowUp Alt+ArrowDown Shift+Alt+ArrowUp Shift+Alt+ArrowDown"\n',
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorTree.tsx",
    "              onDoubleClick={(event) => {\n"
    "                if (isLayerRowControl(event.target)) return;\n"
    "                beginRename(\"group\", node.group.id, node.group.name);\n"
    "              }}\n"
    "              className={cn(\n"
    "                \"flex min-h-9 items-center gap-1 rounded-lg px-1 py-0.5 [contain-intrinsic-size:44px] [content-visibility:auto] max-lg:min-h-11 pointer-coarse:min-h-11\",\n",
    "              onDoubleClick={(event) => {\n"
    "                if (isLayerRowControl(event.target)) return;\n"
    "                beginRename(\"group\", node.group.id, node.group.name);\n"
    "              }}\n"
    "              onDragOver={(event) => onGroupDragOver?.(event, node.group, key, target.itemIds)}\n"
    "              onDragLeave={(event) => onGroupDragLeave?.(event, key)}\n"
    "              onDrop={(event) => onGroupDrop?.(event)}\n"
    "              data-studio-layer-group-drop={groupDropPosition ?? undefined}\n"
    "              className={cn(\n"
    "                \"relative flex min-h-9 items-center gap-1 rounded-lg px-1 py-0.5 [contain-intrinsic-size:44px] [content-visibility:auto] max-lg:min-h-11 pointer-coarse:min-h-11\",\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorTree.tsx",
    "                    : \"hover:bg-raised/60\",\n                focusRing\n              )}\n            >\n",
    "                    : \"hover:bg-raised/60\",\n"
    "                groupDropPosition === \"inside\" && \"ring-2 ring-accent/80 bg-accent-soft/35\",\n"
    "                focusRing\n"
    "              )}\n"
    "            >\n"
    "              {groupDropPosition === \"front\" || groupDropPosition === \"back\" ? (\n"
    "                <span\n"
    "                  aria-hidden\n"
    "                  data-studio-layer-drop-indicator={groupDropPosition}\n"
    "                  className={cn(\n"
    "                    \"pointer-events-none absolute inset-x-1 z-20 h-0.5 rounded-full bg-accent shadow-[0_0_0_1px_oklch(0.2_0.02_60),0_0_8px_oklch(0.72_0.18_42/0.75)]\",\n"
    "                    groupDropPosition === \"front\" ? \"-top-0.5\" : \"-bottom-0.5\"\n"
    "                  )}\n"
    "                />\n"
    "              ) : null}\n",
)
# Insert group handle after the disclosure control.
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorTree.tsx",
    "              )}\n              <span\n                aria-hidden\n                className={cn(\n",
    "              )}\n"
    "              <button\n"
    "                type=\"button\"\n"
    "                tabIndex={-1}\n"
    "                draggable={canDragGroup}\n"
    "                disabled={!canDragGroup}\n"
    "                data-layer-row-control\n"
    "                data-studio-layer-drag-handle=\"group\"\n"
    "                onClick={(event) => event.stopPropagation()}\n"
    "                onDragStart={(event) =>\n"
    "                  onGroupDragStart?.(event, node.group, target.itemIds)\n"
    "                }\n"
    "                onDragEnd={() => onGroupDragEnd?.()}\n"
    "                aria-label={`${node.group.name} 그룹 끌어 순서 변경`}\n"
    "                aria-describedby={dragHelpId}\n"
    "                title={canDragGroup ? \"끌어서 그룹 블록 순서 변경\" : undefined}\n"
    "                className={cn(\n"
    "                  \"hidden size-6 shrink-0 cursor-grab place-items-center rounded text-fg-3 hover:bg-raised hover:text-fg active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-25 [@media(pointer:fine)]:grid\",\n"
    "                  focusRing\n"
    "                )}\n"
    "              >\n"
    "                <GripVertical size={13} aria-hidden />\n"
    "              </button>\n"
    "              <span\n"
    "                aria-hidden\n"
    "                className={cn(\n",
)

# ---------------------------------------------------------------------------
# Batch front/back controls
# ---------------------------------------------------------------------------
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorBatchBar.tsx",
    "import {\n  Eye,\n",
    "import {\n  ChevronsDown,\n  ChevronsUp,\n  Eye,\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorBatchBar.tsx",
    "  mutationDisabled: boolean;\n  readOnly: boolean;\n",
    "  mutationDisabled: boolean;\n"
    "  readOnly: boolean;\n"
    "  reorderDisabled: boolean;\n"
    "  reorderUnavailableReason: string | undefined;\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorBatchBar.tsx",
    "  mutationDisabled,\n  readOnly,\n",
    "  mutationDisabled,\n"
    "  readOnly,\n"
    "  reorderDisabled,\n"
    "  reorderUnavailableReason,\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorBatchBar.tsx",
    "      </span>\n      <StudioToolHintTarget\n        disabled={mutationDisabled || batchShowIds.length === 0}\n",
    r'''      </span>
      <StudioToolHintTarget
        disabled={reorderDisabled}
        unavailableReason={reorderUnavailableReason}
        preferredSide="top"
        hint={{
          id: "layer-batch-bring-front",
          title: "선택 레이어 맨 앞으로",
          description: "선택과 그 선택이 속한 그룹을 하나의 안정적인 블록으로 맨 앞에 배치합니다.",
          preview: "layer-actions",
          tip: "⌘⇧] 또는 Ctrl+Shift+] 단축키도 사용할 수 있어요.",
        }}
      >
        <button
          type="button"
          disabled={reorderDisabled}
          onClick={() =>
            onAction({ type: "reorder-items", ids: batchSelectedIds, direction: "front" })
          }
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded border border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
            coarseTarget,
            focusRing
          )}
          aria-label={`선택 ${batchSelectedIds.length}개 맨 앞으로`}
        >
          <ChevronsUp size={13} />
        </button>
      </StudioToolHintTarget>
      <StudioToolHintTarget
        disabled={reorderDisabled}
        unavailableReason={reorderUnavailableReason}
        preferredSide="top"
        hint={{
          id: "layer-batch-send-back",
          title: "선택 레이어 맨 뒤로",
          description: "선택과 그 선택이 속한 그룹을 하나의 안정적인 블록으로 맨 뒤에 배치합니다.",
          preview: "layer-actions",
          tip: "⌘⇧[ 또는 Ctrl+Shift+[ 단축키도 사용할 수 있어요.",
        }}
      >
        <button
          type="button"
          disabled={reorderDisabled}
          onClick={() =>
            onAction({ type: "reorder-items", ids: batchSelectedIds, direction: "back" })
          }
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded border border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
            coarseTarget,
            focusRing
          )}
          aria-label={`선택 ${batchSelectedIds.length}개 맨 뒤로`}
        >
          <ChevronsDown size={13} />
        </button>
      </StudioToolHintTarget>
      <StudioToolHintTarget
        disabled={mutationDisabled || batchShowIds.length === 0}
''',
)

# ---------------------------------------------------------------------------
# Interaction regression test
# ---------------------------------------------------------------------------
write(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.drag.test.tsx",
    r'''
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLayerGroup } from "../studio-layers";

import {
  StudioLayerNavigator,
  type StudioLayerNavigatorAction,
} from "./StudioLayerNavigator";

import type { StudioLayerNavigatorItem } from "./studio-layer-navigator";

const ITEMS: StudioLayerNavigatorItem[] = [
  { id: "back", type: "image", label: "배경 채색", zIndex: 0 },
  { id: "middle", type: "draw", label: "인물 선화", zIndex: 1 },
  { id: "front", type: "bubble", label: "주인공 대사", zIndex: 2 },
];

function dataTransfer(): DataTransfer {
  return {
    effectAllowed: "none",
    dropEffect: "none",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: vi.fn(),
    getData: vi.fn(() => ""),
    setData: vi.fn(),
    setDragImage: vi.fn(),
  } as unknown as DataTransfer;
}

function layerRow(name: RegExp): HTMLElement {
  return screen.getByRole("treeitem", { name });
}

afterEach(cleanup);

describe("StudioLayerNavigator drag workbench", () => {
  it("routes standard and arrow ordering shortcuts through one multi-selection action", () => {
    const actions: StudioLayerNavigatorAction[] = [];
    render(
      <StudioLayerNavigator
        items={ITEMS}
        groups={[]}
        selectedIds={["middle", "front"]}
        pageKey="shortcut-order"
        localHiddenIds={new Set()}
        onToggleLocalHidden={() => {}}
        onSelectionChange={() => {}}
        onAction={(action) => actions.push(action)}
      />
    );

    const target = layerRow(/인물 선화/);
    fireEvent.keyDown(target, { key: "]", code: "BracketRight", metaKey: true });
    fireEvent.keyDown(target, {
      key: "[",
      code: "BracketLeft",
      ctrlKey: true,
      shiftKey: true,
    });
    fireEvent.keyDown(target, { key: "ArrowUp", altKey: true });

    expect(actions).toEqual([
      { type: "reorder-items", ids: ["middle", "front"], direction: "forward" },
      { type: "reorder-items", ids: ["middle", "front"], direction: "back" },
      { type: "reorder-items", ids: ["middle", "front"], direction: "forward" },
    ]);
    expect(target.getAttribute("aria-keyshortcuts")).toContain("Shift+Meta+]");
    expect(target.getAttribute("aria-keyshortcuts")).toContain("Alt+ArrowUp");
  });

  it("emits an arbitrary root drop action and exposes a precise visual insertion line", () => {
    const actions: StudioLayerNavigatorAction[] = [];
    render(
      <StudioLayerNavigator
        items={ITEMS}
        groups={[]}
        selectedIds={["middle"]}
        pageKey="drag-root"
        localHiddenIds={new Set()}
        onToggleLocalHidden={() => {}}
        onSelectionChange={() => {}}
        onAction={(action) => actions.push(action)}
      />
    );

    const transfer = dataTransfer();
    const handle = screen.getByRole("button", { name: "인물 선화 레이어 끌어 순서 변경" });
    const target = layerRow(/주인공 대사/);
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 300,
      width: 300,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.dragStart(handle, { dataTransfer: transfer });
    fireEvent.dragOver(target, { dataTransfer: transfer, clientY: 105 });
    expect(target.getAttribute("data-studio-layer-drop-side")).toBe("front");
    expect(target.querySelector('[data-studio-layer-drop-indicator="front"]')).toBeTruthy();
    fireEvent.drop(target, { dataTransfer: transfer, clientY: 105 });

    expect(actions).toContainEqual({
      type: "drop-items",
      ids: ["middle"],
      targetId: "front",
      side: "front",
      mode: "units",
    });
  });

  it("uses the center of a group row as an explicit membership drop target", () => {
    const group = createLayerGroup("character", "캐릭터");
    const items: StudioLayerNavigatorItem[] = [
      { id: "loose", type: "image", label: "그룹 밖 채색", zIndex: 2 },
      { id: "ink", type: "draw", label: "그룹 선화", zIndex: 1, groupId: group.id },
      { id: "color", type: "image", label: "그룹 채색", zIndex: 0, groupId: group.id },
    ];
    const actions: StudioLayerNavigatorAction[] = [];
    render(
      <StudioLayerNavigator
        items={items}
        groups={[group]}
        selectedIds={["loose"]}
        pageKey="drag-group"
        localHiddenIds={new Set()}
        onToggleLocalHidden={() => {}}
        onSelectionChange={() => {}}
        onAction={(action) => actions.push(action)}
      />
    );

    const transfer = dataTransfer();
    const handle = screen.getByRole("button", { name: "그룹 밖 채색 레이어 끌어 순서 변경" });
    const target = layerRow(/캐릭터, 그룹, 2개 레이어/);
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 300,
      width: 300,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.dragStart(handle, { dataTransfer: transfer });
    fireEvent.dragOver(target, { dataTransfer: transfer, clientY: 120 });
    expect(target.getAttribute("data-studio-layer-group-drop")).toBe("inside");
    fireEvent.drop(target, { dataTransfer: transfer, clientY: 120 });

    expect(actions).toContainEqual({
      type: "assign-items-to-group",
      ids: ["loose"],
      groupId: "character",
    });
  });

  it("offers touch-friendly batch front/back controls and disables reorder while filtered", () => {
    const actions: StudioLayerNavigatorAction[] = [];
    render(
      <StudioLayerNavigator
        items={ITEMS}
        groups={[]}
        selectedIds={["middle"]}
        pageKey="batch-order"
        localHiddenIds={new Set()}
        onToggleLocalHidden={() => {}}
        onSelectionChange={() => {}}
        onAction={(action) => actions.push(action)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "선택 1개 맨 앞으로" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 1개 맨 뒤로" }));
    expect(actions).toEqual([
      { type: "reorder-items", ids: ["middle"], direction: "front" },
      { type: "reorder-items", ids: ["middle"], direction: "back" },
    ]);

    fireEvent.change(screen.getByRole("searchbox", { name: "레이어 이름·텍스트·그룹 검색" }), {
      target: { value: "인물" },
    });
    expect(
      (screen.getByRole("button", { name: "인물 선화 레이어 끌어 순서 변경" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "선택 1개 맨 앞으로" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});
''',
)

# ---------------------------------------------------------------------------
# Benchmark and architecture decision record
# ---------------------------------------------------------------------------
write(
    "docs/studio-layer-drag-workbench-benchmark-2026-09-09.md",
    r'''
# ToonStudio 레이어 드래그 워크벤치 벤치마크 · 2026-09-09

## 목표

검색·필터·스마트 보기·로컬 solo·마스크·클리핑·블렌드·병합·협업 소유권까지 갖춘 기존 레이어
내비게이터에, 전문 편집기에서 가장 자주 쓰는 **직접 순서 조작**을 안전하게 연결한다. 저장소의
`docs/perf/canvas-findings.md`에도 드래그 재정렬 어피던스 부재가 미해결 항목으로 기록돼 있었다.

## 공식 제품 관찰

| 제품 | 관찰한 레이어 조작 | ToonStudio 적용 판단 |
| --- | --- | --- |
| Clip Studio Paint | 검색 레이어 팔레트에서 종류·이름·표시·잠금·알파 잠금·참조·초안·폴더 범위를 조합한다. | 기존 #976 검색 DSL·스마트 보기를 유지한다. 순서 변경 중에는 필터 결과가 전체 순서를 숨기므로 드래그를 잠근다. |
| Adobe Photoshop | Layers 패널에서 그룹, 복제, 선택, 링크, 마스크, 레이어 스타일, Smart Object와 정렬 명령을 한 계층에서 다룬다. | 이미 존재하는 마스크·효과·병합 패널은 중복하지 않고, 선택 묶음의 z-order 명령을 레이어 패널에 직접 노출한다. |
| Krita | 레이어를 드래그해 순서를 바꾸고 그룹 안팎으로 이동하며, 색 라벨 필터와 비파괴 마스크를 제공한다. | 드롭 선은 순서, 그룹 중앙 강조는 소속 변경으로 의미를 분리한다. |
| Procreate | 다중 선택 뒤 Group/Merge/Duplicate/Delete를 일괄 실행하고, visibility를 길게 눌러 solo 한다. | 기존 다중 선택·solo·병합을 유지하고 일괄 맨 앞/뒤 명령을 추가한다. |
| Figma | Smart selection은 다중 항목을 드래그할 때 이동 가능 위치를 명확한 indicator로 보여 준다. | dragover마다 문서를 쓰지 않고 의도만 계산하며, 놓는 순간 한 번만 commit한다. |
| ibisPaint | 전용 reorder handle을 좌우로 밀어 폴더 안팎으로 이동한다. | 행 전체가 아니라 전용 핸들만 draggable로 만들어 표시·잠금·불투명도 조작과 충돌하지 않게 한다. |
| MediBang Paint | 레이어 순서 변경을 기본 레이어 작업으로 제공한다. | 데스크톱 드래그뿐 아니라 터치용 일괄 맨 앞/뒤 버튼과 키보드 명령을 함께 제공한다. |

참고 문서: Krita Layers docker, Procreate Layers Interface, Figma Arrange layers with Smart selection,
ibisPaint Layer Folders, MediBang How to Change the Layer Order, Adobe Photoshop Layers panel,
Clip Studio Paint Search Layer palette.

## 구현 결정

### 1. 한 드롭 = 한 문서 커밋

드래그 중에는 `StudioLayerDropIntent`만 갱신한다. 실제 `El[]` 변경은 drop 시점에 기존
`StudioLayerNavigatorAction → createStudioLayerOperations → commit()` 경로로 한 번만 전달한다.
따라서 undo 스택, dirty/autosave 세대, 검토 잠금, 선택 정리 계약을 우회하지 않는다.

### 2. 연속 그룹 불변식

문서 정본은 `BACK → FRONT` 평탄 배열이며 같은 `groupId`는 반드시 연속 구간이다.
`reorderLayerSelectionToTarget`은 다음 두 범위를 명시한다.

- `units`: 그룹 자식 하나가 선택돼도 그룹 전체를 한 단위로 이동
- `siblings`: 같은 그룹 자식끼리 또는 그룹 밖 형제끼리만 정확히 이동

비연속으로 손상된 그룹, 자기 자신 드롭, 범위가 다른 대상은 원본 참조를 반환해 fail-closed 한다.

### 3. 드롭 의미

- 레이어 행 위/아래 절반: 대상 앞/뒤 삽입
- 같은 그룹 자식 행: 그룹 내부 순서 변경
- 다른 그룹 자식 행: 해당 그룹으로 이동하면서 그 위치에 삽입
- 그룹 행 중앙: 그룹 소속 변경
- 그룹 행 위/아래 가장자리: 그룹 밖/그룹 블록 주변 순서 변경
- 그룹 핸들: 그룹 전체 블록 이동, 중첩 그룹 생성은 금지

### 4. 접근성과 입력 방식

- 모든 레이어/그룹 treeitem에 표준 `⌘/Ctrl + [`·`]` 및 Shift 조합을 노출
- `Alt + ↑/↓`, `Shift + Alt + ↑/↓`를 방향키 대안으로 제공
- 드롭 결과를 polite live region으로 알림
- 포인터가 정밀한 환경에서만 24px drag handle을 표시
- 터치에서는 선택 일괄 toolbar의 맨 앞/뒤 버튼과 기존 작업 메뉴 사용
- 검색·필터, 읽기 전용, 타인 소유 lease 상태에서는 drag/reorder를 명시적으로 비활성화

## 의도적으로 제외한 범위

- 현재 데이터 모델이 평면 그룹이므로 중첩 폴더 스키마 마이그레이션은 포함하지 않는다.
- 실제 캔버스 미리보기 썸네일 생성은 렌더러 캐시·메모리 예산 설계가 먼저 필요해 아이콘 표현을 유지한다.
- HTML Drag and Drop의 터치 브라우저 편차를 억지로 숨기지 않고, 터치 명령 경로를 별도로 유지한다.
- 복제는 요소 타입별 연결 데이터·애니메이션 트랙·3D bundle provenance까지 함께 복제해야 하므로 기존
  복제 명령 정본을 패널에 연결하는 별도 작업으로 남긴다.

## 검증 행렬

- 순수 엔진: 임의 위치 이동, 다중 선택 안정 순서, 그룹 전체 이동, 그룹 내부 이동, root 이동,
  손상 그룹 fail-closed
- 의도 해석기: 행 위/아래, 그룹 중앙, 같은/다른 그룹, 혼합 선택, 자기 드롭
- jsdom 상호작용: 표준 단축키, drag/drop action payload, 삽입선, 그룹 중앙 강조,
  일괄 맨 앞/뒤, 필터 중 비활성화
- 정적 검증: ESLint, TypeScript, Vite production bundle, `git diff --check`
''',
)

print("studio layer drag workbench patch applied")
