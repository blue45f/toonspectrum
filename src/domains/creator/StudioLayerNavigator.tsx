import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  FolderMinus,
  FolderPlus,
  Ghost,
  Crosshair,
  Grid2X2,
  Layers3,
  ListChecks,
  Lock,
  LockOpen,
  MoreHorizontal,
  Minus,
  Palette,
  ScanLine,
  Search,
  SlidersHorizontal,
  Tags,
  Trash2,
  Type as TypeIcon,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  DEFAULT_STUDIO_LAYER_NAVIGATOR_FILTERS,
  STUDIO_LAYER_COLORS,
  STUDIO_LAYER_COLOR_LABELS,
  STUDIO_LAYER_FLAGS,
  STUDIO_LAYER_FLAG_LABELS,
  STUDIO_LAYER_KIND_LABELS,
  STUDIO_LAYER_KINDS,
  STUDIO_LAYER_ROLES,
  STUDIO_LAYER_ROLE_LABELS,
  buildStudioLayerNavigatorNodes,
  countActiveStudioLayerFilters,
  countStudioLayerSelectionOutsideResults,
  filterStudioLayerNavigatorItems,
  reduceStudioLayerSelection,
  summarizeStudioLayerNavigator,
  type StudioLayerColor,
  type StudioLayerFlag,
  type StudioLayerNavigatorFilters,
  type StudioLayerNavigatorItem,
  type StudioLayerNavigatorResult,
  type StudioLayerRole,
  type StudioLayerSelectionMode,
} from "./studio-layer-navigator";
import {
  STUDIO_LAYER_NAVIGATOR_COARSE_TARGET as coarseTarget,
  STUDIO_LAYER_NAVIGATOR_FOCUS_RING as focusRing,
  STUDIO_LAYER_NAVIGATOR_KIND_ICONS as KIND_ICONS,
  studioLayerNavigatorItemStatusLabel as itemStatusLabel,
} from "./studio-layer-navigator-row-ui";
import { useStudioStableHandlers } from "./studio-stable-handlers";
import {
  StudioLayerNavigatorItemRow as LayerNavigatorItemRow,
  type LayerNavigatorRowHandlers,
} from "./StudioLayerNavigatorItemRow";
import { StudioToolHintTarget } from "./StudioToolHint";

import type { LayerGroup } from "./studio-layers";

import { cn } from "@/lib/utils";

export type StudioLayerNavigatorItemFlag = "alphaLocked" | "fillReference" | "maskEnabled";

export type StudioLayerNavigatorAction =
  | { type: "group-selection" }
  | { type: "ungroup-selection" }
  | { type: "create-group"; seedIds: readonly string[] }
  /**
   * CSP-class frame folder seed: bind selected layers under a contiguous group for a frame cut,
   * forcing panel clip (`noClip: false`). Shared-gutter edit topology is not included.
   */
  | { type: "create-frame-folder"; frameId: string; seedIds: readonly string[] }
  | { type: "rename-item"; id: string; name: string }
  | { type: "rename-group"; groupId: string; name: string }
  | {
      type: "set-group-flag";
      groupId: string;
      flag: "collapsed" | "hidden" | "locked";
      value: boolean;
    }
  | { type: "set-items-hidden"; ids: readonly string[]; hidden: boolean }
  | { type: "set-items-locked"; ids: readonly string[]; locked: boolean }
  /** 0–1. Emitted by the row's inline opacity scrubber (V5 §15 레이어 행 동작 120px). */
  | { type: "set-items-opacity"; ids: readonly string[]; opacity: number }
  | { type: "set-item-flag"; id: string; flag: StudioLayerNavigatorItemFlag; value: boolean }
  | { type: "assign-items-to-group"; ids: readonly string[]; groupId?: string }
  | { type: "set-items-role"; ids: readonly string[]; role?: StudioLayerRole }
  | { type: "set-items-color"; ids: readonly string[]; color?: StudioLayerColor }
  /** up=FRONT/높은 z 쪽, down=BACK/낮은 z 쪽. 필터 활성 중에는 UI가 명령을 내보내지 않는다. */
  | { type: "move-item"; id: string; direction: "up" | "down" }
  | { type: "move-group"; groupId: string; direction: "up" | "down" }
  | { type: "ungroup"; groupId: string }
  /** 선택 ID 집합 전체를 하나의 삭제 의도로 전달한다. 잠금·히스토리·선택 정리는 상위 문서 어댑터 책임이다. */
  | { type: "delete-items"; ids: readonly string[] }
  /** Merge selected layer with the one below (toward BACK). */
  | { type: "merge-down"; id: string }
  /** Merge all selected layers (2+). */
  | { type: "merge-selected"; ids: readonly string[] }
  /** Flatten all visible unlocked layers into one group plan (non-destructive group until raster bake). */
  | { type: "flatten-visible" };

export interface StudioLayerNavigatorProps {
  /** 문서의 BACK→FRONT 레이어. zIndex를 기준으로 FRONT→BACK 표시 순서를 안정적으로 만든다. */
  items: readonly StudioLayerNavigatorItem[];
  groups: readonly LayerGroup[];
  /** 단일·다중을 통합한 현재 선택. 내비게이터는 결과 순서의 고유 ID 최대 500개를 반환한다. */
  selectedIds: readonly string[];
  /** 페이지가 바뀔 때 포커스·범위 anchor·임시 편집만 초기화한다. 검색 필터는 작업공간 상태로 유지한다. */
  pageKey: string;
  readOnly?: boolean;
  /** 마스터 레이어처럼 그룹 데이터 모델을 지원하지 않는 작업면에서 그룹 생성·배정·해제·이동만 잠근다. */
  groupingDisabled?: boolean;
  /** 문서(CRDT)에 반영되지 않는, 이 클라이언트에서만 켜진 "나만 숨기기" 대상. */
  localHiddenIds: ReadonlySet<string>;
  onToggleLocalHidden: (id: string) => void;
  /**
   * CSP-class solo: temporary local view of one layer (others hidden only on this client).
   * Null when solo is off.
   */
  soloLayerId?: string | null;
  onToggleLayerSolo?: (id: string) => void;
  onSelectionChange: (ids: readonly string[]) => void;
  onAction: (action: StudioLayerNavigatorAction) => void;
}

type RenameTarget = { kind: "item" | "group"; id: string; value: string };
type ActionTarget =
  | { kind: "item" | "group"; id: string }
  | { kind: "batch"; id: "selection" };
type FocusTarget =
  | { key: string; kind: "item"; entry: StudioLayerNavigatorResult }
  | {
      key: string;
      kind: "group";
      group: LayerGroup;
      itemIds: readonly string[];
      expanded: boolean;
    };

const compactControl = cn(
  "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-line bg-card px-2 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40",
  coarseTarget,
  focusRing
);

function uniqueGroups(groups: readonly LayerGroup[]): readonly LayerGroup[] {
  const seen = new Set<string>();
  return groups.filter((group) => {
    if (seen.has(group.id)) return false;
    seen.add(group.id);
    return true;
  });
}

function stableFrontToBack(items: readonly StudioLayerNavigatorItem[]): readonly StudioLayerNavigatorItem[] {
  return items
    .map((item, sourceIndex) => ({ item, sourceIndex }))
    .sort((left, right) => right.item.zIndex - left.item.zIndex || left.sourceIndex - right.sourceIndex)
    .map(({ item }) => item);
}

function commonValue<Value extends string>(values: readonly (Value | undefined)[]): Value | "__mixed__" | undefined {
  if (values.length === 0) return undefined;
  const first = values[0];
  return values.every((value) => value === first) ? first : "__mixed__";
}

function selectionModeFromPointer(
  event: ReactMouseEvent<HTMLElement>,
  mobileMultiSelect: boolean
): StudioLayerSelectionMode {
  const modifier = event.metaKey || event.ctrlKey;
  if (event.shiftKey) return modifier ? "add-range" : "range";
  if (modifier || mobileMultiSelect) return "toggle";
  return "replace";
}

function isLayerRowControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-layer-row-control]") !== null;
}


export function StudioLayerNavigator({
  items,
  groups,
  selectedIds,
  pageKey,
  readOnly = false,
  groupingDisabled = false,
  localHiddenIds,
  onToggleLocalHidden,
  soloLayerId = null,
  onToggleLayerSolo,
  onSelectionChange,
  onAction,
}: StudioLayerNavigatorProps) {
  const filterPanelId = useId();
  const actionPopoverId = useId();
  const resultStatusId = useId();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<StudioLayerNavigatorFilters>(() => ({
    ...DEFAULT_STUDIO_LAYER_NAVIGATOR_FILTERS,
    flags: [],
  }));
  const [filterOpen, setFilterOpen] = useState(false);
  const [mobileMultiSelect, setMobileMultiSelect] = useState(false);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [readOnlyCollapsed, setReadOnlyCollapsed] = useState<Record<string, boolean>>({});

  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const actionTriggerRef = useRef<HTMLElement | null>(null);
  const actionPopoverRef = useRef<HTMLDivElement>(null);
  const actionFallbackKeyRef = useRef<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());

  const displayItems = stableFrontToBack(items);
  const availableGroups = uniqueGroups(groups).map((group) =>
    readOnly && Object.hasOwn(readOnlyCollapsed, group.id)
      ? { ...group, collapsed: readOnlyCollapsed[group.id] }
      : group
  );
  const stats = summarizeStudioLayerNavigator(displayItems, availableGroups);
  const activeFilterCount = countActiveStudioLayerFilters(filters);
  const filterActive = query.trim().length > 0 || activeFilterCount > 0;
  const results = filterStudioLayerNavigatorItems(displayItems, availableGroups, query, filters);
  const resultIds = [...new Set(results.map((entry) => entry.item.id))];
  const resultIdSet = new Set(resultIds);
  const nodes = buildStudioLayerNavigatorNodes(results, availableGroups, {
    filterActive,
    includeEmptyGroups: true,
  });
  const selectedIdSet = new Set(selectedIds);
  const selectionCount = selectedIdSet.size;
  const outsideSelectionCount = countStudioLayerSelectionOutsideResults(selectedIds, resultIds);
  const batchSelectedIds = [...new Set(
    filterActive ? selectedIds.filter((id) => resultIdSet.has(id)) : selectedIds
  )].slice(0, 500);
  const batchSelectedIdSet = new Set(batchSelectedIds);
  const batchSelectedItems = displayItems.filter((item) => batchSelectedIdSet.has(item.id));
  const availableGroupById = new Map(availableGroups.map((group) => [group.id, group]));
  const batchShowIds = batchSelectedItems
    .filter((item) => !item.groupId || availableGroupById.get(item.groupId)?.hidden !== true)
    .map((item) => item.id);
  const batchUnlockIds = batchSelectedItems
    .filter((item) => !item.groupId || availableGroupById.get(item.groupId)?.locked !== true)
    .map((item) => item.id);
  const batchShowBlockedCount = batchSelectedIds.length - batchShowIds.length;
  const batchUnlockBlockedCount = batchSelectedIds.length - batchUnlockIds.length;
  const commonSelectedGroup = commonValue(batchSelectedItems.map((item) => item.groupId));
  const selectionContainsGroupedItems = batchSelectedItems.some(
    (item) => item.groupId !== undefined
  );
  const createGroupUnavailableReason = readOnly
    ? "읽기 전용 작업공간에서는 그룹을 만들 수 없어요."
    : groupingDisabled
      ? "현재 작업면은 레이어 그룹을 지원하지 않아요."
      : filterActive
        ? "검색·필터를 지운 뒤 그룹을 만들 수 있어요."
        : selectionContainsGroupedItems
          ? "기존 그룹이 포함되어 있어요. 먼저 그룹을 해제해 주세요."
          : undefined;
  const commonSelectedRole = commonValue(batchSelectedItems.map((item) => item.role));
  const commonSelectedColor = commonValue(batchSelectedItems.map((item) => item.color));

  const focusTargets: FocusTarget[] = [];
  for (const node of nodes) {
    if (node.kind === "item") {
      focusTargets.push({ key: node.key, kind: "item", entry: node.entry });
      continue;
    }
    focusTargets.push({
      key: node.key,
      kind: "group",
      group: node.group,
      itemIds: node.entries.map((entry) => entry.item.id),
      expanded: node.expanded,
    });
    if (!node.expanded) continue;
    for (const entry of node.entries) {
      focusTargets.push({
        key: `${node.key}:item:${entry.item.id}`,
        kind: "item",
        entry,
      });
    }
  }
  const visibleItemIds = focusTargets.flatMap((target) =>
    target.kind === "item" ? [target.entry.item.id] : []
  );
  const focusKeySet = new Set(focusTargets.map((target) => target.key));
  const selectedFocusTarget = focusTargets.find(
    (target) => target.kind === "item" && selectedIdSet.has(target.entry.item.id)
  );
  const tabStopKey = focusedKey && focusKeySet.has(focusedKey)
    ? focusedKey
    : (selectedFocusTarget?.key ?? focusTargets[0]?.key ?? null);

  const activeItem = actionTarget?.kind === "item"
    ? displayItems.find((item) => item.id === actionTarget.id) ?? null
    : null;
  const activeGroup = actionTarget?.kind === "group"
    ? availableGroups.find((group) => group.id === actionTarget.id) ?? null
    : null;
  const actionTargetKind = actionTarget?.kind ?? null;
  const actionTargetId = actionTarget?.id ?? null;
  const actionTargetExists =
    actionTargetKind === "batch" || activeItem !== null || activeGroup !== null;
  const activeGroupItemIds = activeGroup
    ? displayItems.filter((item) => item.groupId === activeGroup.id).map((item) => item.id)
    : [];
  const activeGroupAllSelected =
    activeGroupItemIds.length > 0 &&
    activeGroupItemIds.every((id) => selectedIdSet.has(id));
  const activeItemGroup = activeItem?.groupId
    ? (availableGroups.find((group) => group.id === activeItem.groupId) ?? null)
    : null;
  const activeItemHiddenByGroup = activeItemGroup?.hidden === true && activeItem?.hidden !== true;
  const activeItemLockedByGroup = activeItemGroup?.locked === true && activeItem?.locked !== true;
  const activeItemEffectivelyLocked = activeItem?.locked === true || activeItemGroup?.locked === true;
  const activeItemLocallyHidden = activeItem ? localHiddenIds.has(activeItem.id) : false;

  useEffect(() => {
    void pageKey;
    setSelectionAnchorId(null);
    setFocusedKey(null);
    setRenameTarget(null);
    setActionTarget(null);
    setFilterOpen(false);
    setMobileMultiSelect(false);
    setReadOnlyCollapsed({});
    actionFallbackKeyRef.current = null;
  }, [pageKey]);

  useEffect(() => {
    if (!filterOpen && !actionTarget) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        filterOpen &&
        !filterPanelRef.current?.contains(target) &&
        !filterTriggerRef.current?.contains(target)
      ) {
        setFilterOpen(false);
      }
      if (
        actionTarget &&
        !actionPopoverRef.current?.contains(target) &&
        !actionTriggerRef.current?.contains(target)
      ) {
        setActionTarget(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || renameTarget) return;
      if (actionTarget) {
        event.preventDefault();
        event.stopPropagation();
        setActionTarget(null);
        actionTriggerRef.current?.focus();
      } else if (filterOpen) {
        event.preventDefault();
        event.stopPropagation();
        setFilterOpen(false);
        filterTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [actionTarget, filterOpen, renameTarget]);

  useEffect(() => {
    if (!filterOpen) return;
    globalThis.requestAnimationFrame?.(() => filterPanelRef.current?.focus());
  }, [filterOpen]);

  useEffect(() => {
    if (!actionTargetKind) return;
    if (actionTargetExists) {
      globalThis.requestAnimationFrame?.(() => actionPopoverRef.current?.focus());
      return;
    }
    const fallbackKey = actionFallbackKeyRef.current;
    setActionTarget(null);
    globalThis.requestAnimationFrame?.(() => {
      const fallback = fallbackKey ? rowRefs.current.get(fallbackKey) : null;
      if (fallback) {
        setFocusedKey(fallbackKey);
        fallback.focus();
      } else {
        searchInputRef.current?.focus();
      }
    });
  }, [
    actionTargetId,
    actionTargetKind,
    actionTargetExists,
  ]);

  function applyItemSelection(targetId: string, mode: StudioLayerSelectionMode) {
    const next = reduceStudioLayerSelection({
      orderedVisibleIds: visibleItemIds,
      currentIds: selectedIds,
      anchorId: selectionAnchorId,
      targetId,
      mode,
      maximum: 500,
    });
    setSelectionAnchorId(next.anchorId);
    onSelectionChange(next.selectedIds);
  }

  function selectGroupItems(itemIds: readonly string[]) {
    if (itemIds.length === 0) return;
    const allSelected = itemIds.every((id) => selectedIdSet.has(id));
    if (allSelected) {
      const groupSet = new Set(itemIds);
      onSelectionChange([...new Set(selectedIds)].filter((id) => !groupSet.has(id)));
      return;
    }
    onSelectionChange([...new Set([...selectedIds, ...itemIds])].slice(0, 500));
    setSelectionAnchorId(itemIds[0] ?? null);
  }

  function replaceWithGroupItems(itemIds: readonly string[]) {
    if (itemIds.length === 0) return;
    onSelectionChange([...new Set(itemIds)].slice(0, 500));
    setSelectionAnchorId(itemIds[0] ?? null);
  }

  function focusRow(key: string) {
    setFocusedKey(key);
    rowRefs.current.get(key)?.focus();
  }

  function moveRowFocus(currentKey: string, key: "ArrowUp" | "ArrowDown" | "Home" | "End") {
    if (focusTargets.length === 0) return;
    const currentIndex = Math.max(0, focusTargets.findIndex((target) => target.key === currentKey));
    const nextIndex = key === "ArrowUp"
      ? Math.max(0, currentIndex - 1)
      : key === "ArrowDown"
        ? Math.min(focusTargets.length - 1, currentIndex + 1)
        : key === "Home"
          ? 0
          : focusTargets.length - 1;
    const next = focusTargets[nextIndex];
    if (next) focusRow(next.key);
  }

  function beginRename(kind: RenameTarget["kind"], id: string, value: string) {
    if (readOnly) return;
    setRenameTarget({ kind, id, value });
    setActionTarget(null);
    globalThis.requestAnimationFrame?.(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }

  function commitRename() {
    if (!renameTarget) return;
    const value = renameTarget.value.trim();
    if (value) {
      onAction(
        renameTarget.kind === "item"
          ? { type: "rename-item", id: renameTarget.id, name: value }
          : { type: "rename-group", groupId: renameTarget.id, name: value }
      );
    }
    setRenameTarget(null);
  }

  function cancelRename(focusKey?: string) {
    setRenameTarget(null);
    if (focusKey) globalThis.requestAnimationFrame?.(() => focusRow(focusKey));
  }

  function handleRenameKeyDown(event: ReactKeyboardEvent<HTMLInputElement>, focusKey: string) {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
      globalThis.requestAnimationFrame?.(() => focusRow(focusKey));
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelRename(focusKey);
    }
  }

  function setGroupCollapsed(groupId: string, collapsed: boolean) {
    if (filterActive) return;
    if (readOnly) {
      setReadOnlyCollapsed((current) => ({ ...current, [groupId]: collapsed }));
      return;
    }
    onAction({ type: "set-group-flag", groupId, flag: "collapsed", value: collapsed });
  }

  function actionFallbackForKey(key: string): string | null {
    const index = focusTargets.findIndex((target) => target.key === key);
    if (index < 0) return null;
    return focusTargets[index + 1]?.key ?? focusTargets[index - 1]?.key ?? null;
  }

  function openActionTarget(trigger: HTMLElement, target: ActionTarget, focusKey?: string) {
    actionTriggerRef.current = trigger;
    actionFallbackKeyRef.current = focusKey ? actionFallbackForKey(focusKey) : null;
    setFilterOpen(false);
    setActionTarget((current) =>
      current?.kind === target.kind && current.id === target.id ? null : target
    );
  }

  function handleTreeItemKeyDown(event: ReactKeyboardEvent<HTMLElement>, target: FocusTarget) {
    if (event.target !== event.currentTarget) return;
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      (event.code === "KeyG" || event.key.toLocaleLowerCase() === "g")
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      onAction({
        type: event.shiftKey ? "ungroup-selection" : "group-selection",
      });
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "a") {
      event.preventDefault();
      event.stopPropagation();
      onSelectionChange(visibleItemIds.slice(0, 500));
      setSelectionAnchorId(visibleItemIds[0] ?? null);
      return;
    }
    if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
      event.preventDefault();
      event.stopPropagation();
      openActionTarget(
        event.currentTarget,
        target.kind === "item"
          ? { kind: "item", id: target.entry.item.id }
          : { kind: "group", id: target.group.id },
        target.key
      );
      return;
    }
    if (
      event.key === "ArrowUp" ||
      event.key === "ArrowDown" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      event.preventDefault();
      event.stopPropagation();
      moveRowFocus(target.key, event.key);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      if (target.kind === "group") {
        if (target.itemIds.length === 0) return;
        const expanded = target.expanded;
        if (event.key === "ArrowRight") {
          if (!expanded) setGroupCollapsed(target.group.id, false);
          else {
            const index = focusTargets.findIndex((candidate) => candidate.key === target.key);
            const child = focusTargets[index + 1];
            if (child?.kind === "item") focusRow(child.key);
          }
        } else if (expanded) {
          setGroupCollapsed(target.group.id, true);
        }
      } else if (event.key === "ArrowLeft") {
        const marker = target.key.indexOf(":item:");
        if (marker > 0) focusRow(target.key.slice(0, marker));
      }
      return;
    }
    if (event.key === "F2") {
      event.preventDefault();
      event.stopPropagation();
      if (target.kind === "item") beginRename("item", target.entry.item.id, target.entry.item.label);
      else beginRename("group", target.group.id, target.group.name);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (target.kind === "item") applyItemSelection(target.entry.item.id, "replace");
      else if (target.itemIds.length > 0) setGroupCollapsed(target.group.id, target.expanded);
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      if (target.kind === "item") applyItemSelection(target.entry.item.id, "toggle");
      else selectGroupItems(target.itemIds);
    }
  }

  function openActionMenu(event: ReactMouseEvent<HTMLButtonElement>, target: ActionTarget) {
    event.stopPropagation();
    const row = event.currentTarget.closest<HTMLElement>("[role='treeitem']");
    const focusKey = row
      ? [...rowRefs.current.entries()].find(([, element]) => element === row)?.[0]
      : undefined;
    openActionTarget(event.currentTarget, target, focusKey);
  }

  function resetFilters() {
    setQuery("");
    setFilters({ ...DEFAULT_STUDIO_LAYER_NAVIGATOR_FILTERS, flags: [] });
  }

  function toggleFilterFlag(flag: StudioLayerFlag) {
    setFilters((current) => ({
      ...current,
      flags: current.flags.includes(flag)
        ? current.flags.filter((candidate) => candidate !== flag)
        : [...current.flags, flag],
    }));
  }

  function setSelectedRole(value: string, ids = selectedIds) {
    if (value === "__mixed__") return;
    onAction({
      type: "set-items-role",
      ids: [...ids],
      role: value === "" ? undefined : (value as StudioLayerRole),
    });
  }

  function setSelectedColor(value: string, ids = selectedIds) {
    if (value === "__mixed__") return;
    onAction({
      type: "set-items-color",
      ids: [...ids],
      color: value === "" ? undefined : (value as StudioLayerColor),
    });
  }

  function setSelectedGroup(value: string, ids = selectedIds) {
    if (value === "__mixed__") return;
    onAction({
      type: "assign-items-to-group",
      ids: [...ids],
      groupId: value || undefined,
    });
  }

  // 행 memo 를 깨지 않는 identity-stable 이벤트 브리지 — 이벤트 시점에 최신 클로저를 읽는다.
  const rowHandlers = useStudioStableHandlers<LayerNavigatorRowHandlers>({
    onRowFocus: (key) => setFocusedKey(key),
    onRowKeyDown: (event, key) => {
      const target = focusTargets.find((candidate) => candidate.key === key);
      if (target) handleTreeItemKeyDown(event, target);
    },
    onRowClick: (event, itemId) => {
      if (isLayerRowControl(event.target)) return;
      applyItemSelection(itemId, selectionModeFromPointer(event, mobileMultiSelect));
    },
    onRowDoubleClick: (event, itemId, label) => {
      if (isLayerRowControl(event.target)) return;
      beginRename("item", itemId, label);
    },
    onToggleItemHidden: (itemId, hidden) => {
      onAction({ type: "set-items-hidden", ids: [itemId], hidden });
    },
    onToggleItemLocked: (itemId, locked) => {
      onAction({ type: "set-items-locked", ids: [itemId], locked });
    },
    onSetItemOpacity: (itemId, opacity) => {
      onAction({ type: "set-items-opacity", ids: [itemId], opacity });
    },
    onOpenItemActionMenu: (event, itemId) => {
      openActionMenu(event, { kind: "item", id: itemId });
    },
    registerRowRef: (key, node) => {
      if (node) rowRefs.current.set(key, node);
      else rowRefs.current.delete(key);
    },
  });

  function renderRenameInput(target: RenameTarget, focusKey: string) {
    return (
      <input
        ref={renameInputRef}
        value={target.value}
        maxLength={160}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setRenameTarget({ ...target, value: event.target.value })}
        onKeyDown={(event) => handleRenameKeyDown(event, focusKey)}
        onBlur={commitRename}
        className={cn(
          "min-h-8 min-w-0 flex-1 rounded-md border border-accent bg-card px-2 text-xs font-semibold text-fg",
          focusRing
        )}
        aria-label={target.kind === "item" ? "레이어 이름 편집" : "그룹 이름 편집"}
      />
    );
  }

  function renderItemRow(entry: StudioLayerNavigatorResult, key: string, level: number) {
    const item = entry.item;
    const editing = renameTarget?.kind === "item" && renameTarget.id === item.id;
    return (
      <LayerNavigatorItemRow
        key={key}
        rowKey={key}
        item={item}
        level={level}
        kind={entry.kind}
        groupName={entry.group?.name ?? null}
        effectivelyHidden={entry.effectivelyHidden}
        locallyHidden={localHiddenIds.has(item.id)}
        effectivelyLocked={entry.effectivelyLocked}
        statusLabel={itemStatusLabel(entry)}
        selected={selectedIdSet.has(item.id)}
        current={selectionCount === 1 && selectedIdSet.has(item.id)}
        selectionCount={selectionCount}
        tabStop={tabStopKey === key}
        renameInput={editing && renameTarget ? renderRenameInput(renameTarget, key) : null}
        mobileMultiSelect={mobileMultiSelect}
        readOnly={readOnly}
        hiddenByGroup={entry.group?.hidden === true && item.hidden !== true}
        lockedByGroup={entry.group?.locked === true && item.locked !== true}
        actionOpen={actionTarget?.kind === "item" && actionTarget.id === item.id}
        actionPopoverId={actionPopoverId}
        stableHandlers={rowHandlers}
      />
    );
  }

  return (
    <section
      className="relative flex h-full min-h-0 flex-col rounded-xl border border-line bg-panel/50 shadow-[inset_0_1px_0_oklch(0.95_0.01_85/0.03)]"
      aria-label="전문 레이어 내비게이터"
      data-page-key={pageKey}
      data-studio-shortcut-boundary="true"
    >
      <div className="border-b border-line/70 bg-panel/70 p-2.5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent ring-1 ring-accent/15" aria-hidden>
            <Layers3 size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-xs font-bold tracking-tight text-fg">레이어 {stats.total}</h3>
              <span id={resultStatusId} role="status" aria-live="polite" className="rounded-full bg-raised px-1.5 py-0.5 text-[0.62rem] font-semibold tabular-nums text-fg-3">
                결과 {results.length}{selectionCount > 0 ? ` · 선택 ${selectionCount}` : ""}
              </span>
            </div>
            <p className="truncate text-[0.68rem] text-fg-3 lg:text-[0.58rem]">
              표시 {stats.visible} · 숨김 {stats.hidden} · 잠금 {stats.locked}
              {outsideSelectionCount > 0 ? ` · 선택 ${outsideSelectionCount}개는 필터 밖` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMobileMultiSelect((current) => !current)}
            aria-pressed={mobileMultiSelect}
            className={cn(compactControl, mobileMultiSelect && "border-accent bg-accent-soft text-accent")}
            title="터치에서도 여러 레이어를 선택할 수 있어요"
          >
            <ListChecks size={13} />
            <span className="hidden min-[350px]:inline">다중 선택</span>
          </button>
          <button
            type="button"
            onClick={() => onAction({ type: "create-group", seedIds: [...selectedIds] })}
            disabled={createGroupUnavailableReason !== undefined}
            className={compactControl}
            aria-label={`새 레이어 그룹${createGroupUnavailableReason ? `, 사용 불가: ${createGroupUnavailableReason}` : ""}`}
            title={createGroupUnavailableReason ?? "선택 레이어로 새 그룹 만들기"}
          >
            <FolderPlus size={13} />
            <span className="hidden min-[390px]:inline">그룹</span>
          </button>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <label className="relative min-w-0 flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  setQuery("");
                } else if (event.key === "Enter") {
                  const firstItem = focusTargets.find((target) => target.kind === "item");
                  if (firstItem) {
                    event.preventDefault();
                    focusRow(firstItem.key);
                  }
                }
              }}
              maxLength={512}
              aria-label="레이어 이름·텍스트·그룹 검색"
              aria-describedby={resultStatusId}
              placeholder="이름, 대사, 종류, 그룹 검색"
              className={cn(
                "min-h-9 w-full rounded-lg border border-line bg-card py-1.5 pl-8 pr-8 text-xs text-fg placeholder:text-fg-3",
                "max-lg:min-h-11 pointer-coarse:min-h-11",
                focusRing
              )}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className={cn(
                  "absolute right-0 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded text-fg-3 hover:text-fg",
                  coarseTarget,
                  focusRing
                )}
                aria-label="레이어 검색어 지우기"
              >
                <X size={13} />
              </button>
            ) : null}
          </label>
          <button
            ref={filterTriggerRef}
            type="button"
            onClick={() => {
              setActionTarget(null);
              setFilterOpen((current) => !current);
            }}
            aria-haspopup="dialog"
            aria-expanded={filterOpen}
            aria-controls={filterPanelId}
            className={cn(
              compactControl,
              (activeFilterCount > 0 || query) && "border-accent bg-accent-soft text-accent"
            )}
          >
            <SlidersHorizontal size={13} />
            필터
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[0.55rem] text-on-accent">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        {filterActive ? (
          <div className="mt-1.5 flex max-w-full items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="shrink-0 text-[0.58rem] font-semibold text-accent">
              {results.length}/{stats.total}
            </span>
            {query ? <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[0.58rem] text-fg-2">“{query}”</span> : null}
            {filters.kind !== "all" ? <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[0.58rem]">{STUDIO_LAYER_KIND_LABELS[filters.kind]}</span> : null}
            {filters.visibility !== "all" ? (
              <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[0.58rem]">
                {filters.visibility === "visible" ? "표시만" : "숨김만"}
              </span>
            ) : null}
            {filters.lock !== "all" ? (
              <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[0.58rem]">
                {filters.lock === "locked" ? "잠김만" : "잠금 해제만"}
              </span>
            ) : null}
            {filters.role !== "all" ? (
              <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[0.58rem]">
                {filters.role === "unassigned" ? "역할 없음" : STUDIO_LAYER_ROLE_LABELS[filters.role]}
              </span>
            ) : null}
            {filters.color !== "all" ? (
              <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[0.58rem]">
                {filters.color === "none" ? "색 없음" : STUDIO_LAYER_COLOR_LABELS[filters.color]}
              </span>
            ) : null}
            {filters.flags.map((flag) => (
              <span key={flag} className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[0.58rem]">
                {STUDIO_LAYER_FLAG_LABELS[flag]}
              </span>
            ))}
            <button
              type="button"
              onClick={resetFilters}
              className={cn("ml-auto shrink-0 rounded px-1.5 py-1 text-[0.68rem] font-semibold text-fg-3 hover:bg-raised hover:text-fg lg:text-[0.58rem]", coarseTarget, focusRing)}
            >
              모두 지우기
            </button>
          </div>
        ) : null}
      </div>

      <div
        id={filterPanelId}
        ref={filterPanelRef}
        role="dialog"
        aria-label="레이어 필터"
        aria-modal="false"
        tabIndex={-1}
        hidden={!filterOpen}
        className={cn(
          "absolute inset-x-2 z-30 max-h-[min(28rem,62vh)] overflow-y-auto rounded-xl border border-line bg-panel p-3 shadow-2xl",
          filterActive ? "top-[9.5rem]" : "top-[7.75rem]"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-fg">레이어 필터</p>
            <p className="text-[0.6rem] text-fg-3">기능 필터는 모두 만족하는 레이어만 표시합니다.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFilterOpen(false);
              filterTriggerRef.current?.focus();
            }}
            className={cn("grid size-8 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-fg", coarseTarget, focusRing)}
            aria-label="레이어 필터 닫기"
          >
            <X size={14} />
          </button>
        </div>

        <fieldset className="mt-3">
          <legend className="mb-1 text-[0.62rem] font-bold text-fg-2">종류</legend>
          <div className="grid grid-cols-3 gap-1">
            {STUDIO_LAYER_KINDS.map((kind) => {
              const Icon = kind === "all" ? Layers3 : KIND_ICONS[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setFilters((current) => ({ ...current, kind }))}
                  aria-pressed={filters.kind === kind}
                  className={cn(compactControl, "justify-start", filters.kind === kind && "border-accent bg-accent-soft text-accent")}
                >
                  <Icon size={12} /> {STUDIO_LAYER_KIND_LABELS[kind]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[0.62rem] font-bold text-fg-2">
            표시 상태
            <select
              value={filters.visibility}
              onChange={(event) => setFilters((current) => ({
                ...current,
                visibility: event.target.value as StudioLayerNavigatorFilters["visibility"],
              }))}
              className={cn("mt-1 min-h-9 w-full rounded-md border border-line bg-card px-2 text-xs text-fg max-lg:min-h-11 pointer-coarse:min-h-11", focusRing)}
            >
              <option value="all">전체</option>
              <option value="visible">표시만</option>
              <option value="hidden">숨김만</option>
            </select>
          </label>
          <label className="text-[0.62rem] font-bold text-fg-2">
            잠금 상태
            <select
              value={filters.lock}
              onChange={(event) => setFilters((current) => ({
                ...current,
                lock: event.target.value as StudioLayerNavigatorFilters["lock"],
              }))}
              className={cn("mt-1 min-h-9 w-full rounded-md border border-line bg-card px-2 text-xs text-fg max-lg:min-h-11 pointer-coarse:min-h-11", focusRing)}
            >
              <option value="all">전체</option>
              <option value="locked">잠김만</option>
              <option value="unlocked">잠금 해제만</option>
            </select>
          </label>
          <label className="text-[0.62rem] font-bold text-fg-2">
            작업 역할
            <select
              value={filters.role}
              onChange={(event) => setFilters((current) => ({
                ...current,
                role: event.target.value as StudioLayerNavigatorFilters["role"],
              }))}
              className={cn("mt-1 min-h-9 w-full rounded-md border border-line bg-card px-2 text-xs text-fg max-lg:min-h-11 pointer-coarse:min-h-11", focusRing)}
            >
              <option value="all">전체 역할</option>
              <option value="unassigned">역할 없음</option>
              {STUDIO_LAYER_ROLES.map((role) => <option key={role} value={role}>{STUDIO_LAYER_ROLE_LABELS[role]}</option>)}
            </select>
          </label>
          <label className="text-[0.62rem] font-bold text-fg-2">
            색 라벨
            <select
              value={filters.color}
              onChange={(event) => setFilters((current) => ({
                ...current,
                color: event.target.value as StudioLayerNavigatorFilters["color"],
              }))}
              className={cn("mt-1 min-h-9 w-full rounded-md border border-line bg-card px-2 text-xs text-fg max-lg:min-h-11 pointer-coarse:min-h-11", focusRing)}
            >
              <option value="all">전체 색</option>
              <option value="none">색 없음</option>
              {STUDIO_LAYER_COLORS.map((color) => <option key={color} value={color}>{STUDIO_LAYER_COLOR_LABELS[color]}</option>)}
            </select>
          </label>
        </div>

        <fieldset className="mt-3">
          <legend className="mb-1 text-[0.62rem] font-bold text-fg-2">전문 상태</legend>
          <div className="grid grid-cols-2 gap-1">
            {STUDIO_LAYER_FLAGS.map((flag) => (
              <label key={flag} className={cn("flex min-h-9 items-center gap-2 rounded-md border border-line bg-card px-2 text-[0.65rem] text-fg-2 hover:bg-raised max-lg:min-h-11 pointer-coarse:min-h-11", focusRing)}>
                <input
                  type="checkbox"
                  checked={filters.flags.includes(flag)}
                  onChange={() => toggleFilterFlag(flag)}
                  className="size-4 accent-accent"
                />
                {STUDIO_LAYER_FLAG_LABELS[flag]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2">
          <span className="text-[0.6rem] text-fg-3">참조 {stats.referenced} · 마스크 {stats.masked} · AI {stats.ai}</span>
          <button type="button" onClick={resetFilters} className={compactControl}>필터 초기화</button>
        </div>
      </div>

      {selectedIds.length > 0 ? (
        <div
          aria-label="선택 레이어 일괄 작업"
          role="toolbar"
          className="flex max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-line/70 bg-accent-soft/20 px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0"
        >
          <span
            className={cn(
              "min-w-0 truncate px-1 text-[0.68rem] font-bold",
              outsideSelectionCount > 0 ? "text-warning" : "text-accent"
            )}
            title={
              outsideSelectionCount > 0
                ? `전체 선택 ${selectedIds.length}개 중 현재 결과 ${batchSelectedIds.length}개만 일괄 작업 대상입니다.`
                : `선택 ${selectedIds.length}개`
            }
          >
            선택 {batchSelectedIds.length}개
            {outsideSelectionCount > 0 ? ` · 밖 ${outsideSelectionCount}` : ""}
          </span>
          <StudioToolHintTarget
            disabled={readOnly || batchShowIds.length === 0}
            unavailableReason={
              readOnly
                ? "읽기 전용 작업공간에서는 레이어 표시 상태를 바꿀 수 없어요."
                : batchShowIds.length === 0
                  ? batchShowBlockedCount > 0
                    ? `숨긴 상위 그룹 안의 ${batchShowBlockedCount}개는 그룹을 먼저 표시해야 해요.`
                    : "현재 선택에는 다시 표시할 숨긴 레이어가 없어요."
                  : undefined
            }
            preferredSide="top"
            hint={{
              id: "layer-batch-show",
              title: "선택 레이어 표시",
              description: "현재 검색 결과 안에서 선택한 숨김 레이어를 다시 보이게 합니다.",
              preview: "layer-visibility",
            }}
          >
            <button
              type="button"
              disabled={readOnly || batchShowIds.length === 0}
              onClick={() => onAction({ type: "set-items-hidden", ids: batchShowIds, hidden: false })}
              className={cn("grid size-8 shrink-0 place-items-center rounded border border-line bg-card text-fg-3 hover:bg-raised hover:text-fg", coarseTarget, focusRing)}
              aria-label={`현재 결과의 선택 ${batchShowIds.length}개 표시${batchShowBlockedCount > 0 ? `, 숨긴 상위 그룹 ${batchShowBlockedCount}개 제외` : ""}`}
            >
              <Eye size={13} />
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget
            disabled={readOnly || batchSelectedIds.length === 0}
            unavailableReason={
              readOnly
                ? "읽기 전용 작업공간에서는 레이어를 숨길 수 없어요."
                : batchSelectedIds.length === 0
                  ? "먼저 레이어를 하나 이상 선택하세요."
                  : undefined
            }
            preferredSide="top"
            hint={{
              id: "layer-batch-hide",
              title: "선택 레이어 숨김",
              description: "선택한 레이어를 문서에서 지우지 않고 캔버스에서만 숨깁니다.",
              preview: "layer-visibility",
              tip: "나중에 눈 아이콘으로 다시 표시할 수 있어요.",
            }}
          >
            <button
              type="button"
              disabled={readOnly || batchSelectedIds.length === 0}
              onClick={() => onAction({ type: "set-items-hidden", ids: batchSelectedIds, hidden: true })}
              className={cn("grid size-8 shrink-0 place-items-center rounded border border-line bg-card text-fg-3 hover:bg-raised hover:text-fg", coarseTarget, focusRing)}
              aria-label={`현재 결과의 선택 ${batchSelectedIds.length}개 숨김`}
            >
              <EyeOff size={13} />
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget
            disabled={readOnly || batchSelectedIds.length === 0}
            unavailableReason={
              readOnly
                ? "읽기 전용 작업공간에서는 레이어를 잠글 수 없어요."
                : batchSelectedIds.length === 0
                  ? "먼저 레이어를 하나 이상 선택하세요."
                  : undefined
            }
            preferredSide="top"
            hint={{
              id: "layer-batch-lock",
              title: "선택 레이어 잠금",
              description: "선택한 레이어를 고정해 캔버스에서 실수로 이동하거나 편집하지 않도록 보호합니다.",
              preview: "layer-lock",
            }}
          >
            <button
              type="button"
              disabled={readOnly || batchSelectedIds.length === 0}
              onClick={() => onAction({ type: "set-items-locked", ids: batchSelectedIds, locked: true })}
              className={cn("grid size-8 shrink-0 place-items-center rounded border border-line bg-card text-fg-3 hover:bg-raised hover:text-fg", coarseTarget, focusRing)}
              aria-label={`현재 결과의 선택 ${batchSelectedIds.length}개 잠금`}
            >
              <Lock size={13} />
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget
            disabled={readOnly || batchUnlockIds.length === 0}
            unavailableReason={
              readOnly
                ? "읽기 전용 작업공간에서는 레이어 잠금을 해제할 수 없어요."
                : batchUnlockIds.length === 0
                  ? batchUnlockBlockedCount > 0
                    ? `잠긴 상위 그룹 안의 ${batchUnlockBlockedCount}개는 그룹 잠금을 먼저 풀어야 해요.`
                    : "현재 선택에는 잠금을 풀 수 있는 레이어가 없어요."
                  : undefined
            }
            preferredSide="top"
            hint={{
              id: "layer-batch-unlock",
              title: "선택 레이어 잠금 해제",
              description: "선택한 레이어의 보호 상태를 풀어 다시 이동·변형·편집할 수 있게 합니다.",
              preview: "layer-lock",
            }}
          >
            <button
              type="button"
              disabled={readOnly || batchUnlockIds.length === 0}
              onClick={() => onAction({ type: "set-items-locked", ids: batchUnlockIds, locked: false })}
              className={cn("grid size-8 shrink-0 place-items-center rounded border border-line bg-card text-fg-3 hover:bg-raised hover:text-fg", coarseTarget, focusRing)}
              aria-label={`현재 결과의 선택 ${batchUnlockIds.length}개 잠금 해제${batchUnlockBlockedCount > 0 ? `, 잠긴 상위 그룹 ${batchUnlockBlockedCount}개 제외` : ""}`}
            >
              <LockOpen size={13} />
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget
            disabled={readOnly || batchSelectedIds.length < 2}
            unavailableReason={
              readOnly
                ? "읽기 전용 작업공간에서는 레이어를 병합할 수 없어요."
                : batchSelectedIds.length < 2
                  ? "병합할 레이어를 두 개 이상 선택하세요."
                  : undefined
            }
            preferredSide="top"
            hint={{
              id: "layer-batch-merge-selected",
              title: "선택 레이어 병합",
              description: "선택한 두 개 이상의 레이어를 표시 순서대로 하나의 결과로 합칩니다.",
              preview: "layer-merge",
              tip: "편집 가능한 원본을 유지하려면 병합 전에 프로젝트 체크포인트를 만들어 두세요.",
            }}
          >
            <button
              type="button"
              disabled={readOnly || batchSelectedIds.length < 2}
              onClick={() => onAction({ type: "merge-selected", ids: batchSelectedIds })}
              className={cn("grid size-8 shrink-0 place-items-center rounded border border-line bg-card text-fg-3 hover:bg-raised hover:text-fg", coarseTarget, focusRing)}
              aria-label="선택 레이어 병합"
            >
              <Layers3 size={13} />
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget
            disabled={readOnly}
            unavailableReason={readOnly ? "읽기 전용 작업공간에서는 표시 레이어를 병합할 수 없어요." : undefined}
            preferredSide="top"
            hint={{
              id: "layer-batch-flatten-visible",
              title: "표시 레이어 병합",
              description: "현재 보이는 레이어 전체를 화면에 보이는 순서대로 하나의 결과로 합칩니다.",
              preview: "layer-merge",
              tip: "숨겨진 레이어는 결과에 포함되지 않아요.",
            }}
          >
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onAction({ type: "flatten-visible" })}
              className={cn("grid size-8 shrink-0 place-items-center rounded border border-line bg-card text-fg-3 hover:bg-raised hover:text-fg", coarseTarget, focusRing)}
              aria-label="표시 레이어 병합"
            >
              <Grid2X2 size={13} />
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget
            preferredSide="top"
            hint={{
              id: "layer-batch-more",
              title: "일괄 작업 더보기",
              description: "선택 레이어의 그룹·역할·색 라벨·삭제 작업을 한 메뉴에서 실행합니다.",
              preview: "layer-actions",
            }}
          >
            <button
              type="button"
              onClick={(event) => openActionMenu(event, { kind: "batch", id: "selection" })}
              aria-haspopup="dialog"
              aria-expanded={actionTarget?.kind === "batch"}
              aria-controls={actionPopoverId}
              className={cn("grid size-8 shrink-0 place-items-center rounded border border-line bg-card text-fg-3 hover:bg-raised hover:text-fg", coarseTarget, focusRing)}
              aria-label="선택 레이어 일괄 작업 더보기"
            >
              <MoreHorizontal size={15} />
            </button>
          </StudioToolHintTarget>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5 overscroll-contain [scrollbar-gutter:stable]">
        {nodes.length > 0 ? (
          <ul
            role="tree"
            aria-label="레이어 트리"
            aria-multiselectable="true"
            className="flex flex-col gap-0.5"
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "a" && event.target === event.currentTarget) {
                event.preventDefault();
                event.stopPropagation();
                onSelectionChange(visibleItemIds.slice(0, 500));
              }
            }}
          >
            {nodes.map((node) => {
              if (node.kind === "item") return renderItemRow(node.entry, node.key, 1);
              const key = node.key;
              const editing = renameTarget?.kind === "group" && renameTarget.id === node.group.id;
              const target: FocusTarget = {
                key,
                kind: "group",
                group: node.group,
                itemIds: node.entries.map((entry) => entry.item.id),
                expanded: node.expanded,
              };
              const selectedChildCount = target.itemIds.filter((id) => selectedIdSet.has(id)).length;
              const allChildrenSelected = target.itemIds.length > 0 && selectedChildCount === target.itemIds.length;
              const partiallySelected = selectedChildCount > 0 && !allChildrenSelected;
              const groupStatus = [
                node.group.hidden ? "숨김" : null,
                node.group.locked ? "잠김" : null,
                selectedChildCount > 0 ? `${selectedChildCount}개 선택` : null,
              ].filter(Boolean).join(", ");
              return (
                <li
                  key={key}
                  role="none"
                  className={cn(
                    "rounded-lg border bg-card/25 transition-[border-color,background-color] duration-150 motion-reduce:transition-none",
                    allChildrenSelected
                      ? "border-accent/55 bg-accent-soft/20"
                      : partiallySelected
                        ? "border-cool/45 bg-cool/5"
                        : "border-line/65"
                  )}
                  data-studio-layer-group-selection={
                    allChildrenSelected ? "all" : partiallySelected ? "partial" : "none"
                  }
                >
                  <div
                    ref={(element) => {
                      if (element) rowRefs.current.set(key, element);
                      else rowRefs.current.delete(key);
                    }}
                    role="treeitem"
                    aria-level={1}
                    aria-selected={allChildrenSelected}
                    aria-expanded={node.empty ? undefined : node.expanded}
                    aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Space F2 Shift+F10 Control+A Meta+A Control+G Meta+G Shift+Control+G Shift+Meta+G"
                    aria-label={`${node.group.name}, 그룹, ${node.entries.length}개 레이어${groupStatus ? `, ${groupStatus}` : ""}`}
                    tabIndex={tabStopKey === key ? 0 : -1}
                    onFocus={() => setFocusedKey(key)}
                    onKeyDown={(event) => handleTreeItemKeyDown(event, target)}
                    onClick={(event) => {
                      if (isLayerRowControl(event.target) || node.empty) return;
                      const itemIds = displayItems
                        .filter((item) => item.groupId === node.group.id)
                        .map((item) => item.id);
                      const additive =
                        event.shiftKey ||
                        event.metaKey ||
                        event.ctrlKey ||
                        mobileMultiSelect;
                      if (additive) selectGroupItems(itemIds);
                      else replaceWithGroupItems(itemIds);
                    }}
                    onDoubleClick={(event) => {
                      if (isLayerRowControl(event.target)) return;
                      beginRename("group", node.group.id, node.group.name);
                    }}
                    className={cn(
                      "flex min-h-9 items-center gap-1 rounded-lg px-1 py-0.5 [contain-intrinsic-size:44px] [content-visibility:auto] max-lg:min-h-11 pointer-coarse:min-h-11",
                      allChildrenSelected
                        ? "bg-accent-soft/25 hover:bg-accent-soft/40"
                        : partiallySelected
                          ? "bg-cool/5 hover:bg-cool/10"
                          : "hover:bg-raised/60",
                      focusRing
                    )}
                  >
                    {node.empty ? (
                      <span className="grid size-7 shrink-0 place-items-center text-fg-3" aria-hidden>
                        <ChevronRight size={14} />
                      </span>
                    ) : (
                      <button
                        type="button"
                        tabIndex={-1}
                        data-layer-row-control
                        onClick={(event) => {
                          event.stopPropagation();
                          setGroupCollapsed(node.group.id, node.expanded);
                        }}
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded text-fg-3 hover:bg-raised",
                          coarseTarget,
                          focusRing
                        )}
                        aria-label={
                          node.expanded
                            ? `${node.group.name} 그룹 접기`
                            : `${node.group.name} 그룹 펼치기`
                        }
                      >
                        {node.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    )}
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-md border",
                        allChildrenSelected
                          ? "border-accent bg-accent text-on-accent"
                          : partiallySelected
                            ? "border-cool/70 bg-cool/10 text-cool"
                            : "border-line/70 bg-card text-transparent"
                      )}
                    >
                      {allChildrenSelected ? <Check size={12} strokeWidth={2.5} /> : partiallySelected ? <Minus size={12} strokeWidth={2.5} /> : null}
                    </span>
                    <Folder size={14} className="shrink-0 text-accent" aria-hidden />
                    {editing && renameTarget
                      ? renderRenameInput(renameTarget, key)
                      : (
                          <span className={cn(
                            "min-w-0 flex-1 truncate text-[0.7rem] font-bold",
                            selectedChildCount > 0 ? "text-fg" : "text-fg-2",
                            node.group.hidden && "line-through decoration-fg-3/80"
                          )}>
                            {node.group.name}
                            <span className="ml-1 text-[0.68rem] font-normal text-fg-3 lg:text-[0.58rem]">{node.empty ? "비어 있음" : node.entries.length}</span>
                          </span>
                        )}
                    {selectedChildCount > 0 ? (
                      <span
                        aria-hidden
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 text-[0.58rem] font-bold tabular-nums",
                          allChildrenSelected ? "bg-accent text-on-accent" : "bg-cool/15 text-cool"
                        )}
                      >
                        {selectedChildCount}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      tabIndex={-1}
                      data-layer-row-control
                      onClick={(event) => {
                        event.stopPropagation();
                        onAction({
                          type: "set-group-flag",
                          groupId: node.group.id,
                          flag: "locked",
                          value: !node.group.locked,
                        });
                      }}
                      disabled={readOnly}
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded text-fg-3 hover:bg-raised disabled:opacity-35",
                        coarseTarget,
                        focusRing
                      )}
                      aria-label={
                        node.group.locked
                          ? `${node.group.name} 그룹 잠금 해제`
                          : `${node.group.name} 그룹 잠금`
                      }
                      aria-pressed={node.group.locked === true}
                    >
                      {node.group.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      data-layer-row-control
                      onClick={(event) => {
                        event.stopPropagation();
                        onAction({
                          type: "set-group-flag",
                          groupId: node.group.id,
                          flag: "hidden",
                          value: !node.group.hidden,
                        });
                      }}
                      disabled={readOnly}
                      className={cn("grid size-8 shrink-0 place-items-center rounded text-fg-3 hover:bg-raised disabled:opacity-35", coarseTarget, focusRing)}
                      aria-label={node.group.hidden ? `${node.group.name} 그룹 표시` : `${node.group.name} 그룹 숨김`}
                    >
                      {node.group.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      data-layer-row-control
                      onClick={(event) => openActionMenu(event, { kind: "group", id: node.group.id })}
                      aria-haspopup="dialog"
                      aria-expanded={actionTarget?.kind === "group" && actionTarget.id === node.group.id}
                      aria-controls={actionPopoverId}
                      className={cn("grid size-8 shrink-0 place-items-center rounded text-fg-3 hover:bg-raised", coarseTarget, focusRing)}
                      aria-label={`${node.group.name} 그룹 작업`}
                    >
                      <MoreHorizontal size={15} />
                    </button>
                  </div>
                  {node.expanded && node.entries.length > 0 ? (
                    <ul role="group" aria-label={`${node.group.name} 그룹 레이어`} className="flex flex-col gap-0.5 border-t border-line/45 p-1 pl-3">
                      {node.entries.map((entry) => renderItemRow(
                        entry,
                        `${node.key}:item:${entry.item.id}`,
                        2
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="grid min-h-40 place-items-center px-4 py-8 text-center" role="status">
            <div>
              {filterActive ? <Search size={22} className="mx-auto text-fg-3" aria-hidden /> : <Layers3 size={22} className="mx-auto text-fg-3" aria-hidden />}
              <p className="mt-2 text-xs font-semibold text-fg-2">
                {filterActive ? "조건에 맞는 레이어가 없습니다" : "아직 레이어가 없습니다"}
              </p>
              <p className="mt-1 text-[0.62rem] leading-relaxed text-fg-3">
                {filterActive ? "검색어나 필터를 지우고 다시 확인해 보세요." : "이미지, 말풍선, 텍스트 또는 선화를 추가하면 이곳에서 관리할 수 있어요."}
              </p>
              {filterActive ? (
                <button type="button" onClick={resetFilters} className={cn(compactControl, "mt-3")}>필터 지우기</button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {actionTarget && (actionTarget.kind === "batch" || activeItem || activeGroup) ? (
        <div
          id={actionPopoverId}
          ref={actionPopoverRef}
          role="dialog"
          aria-modal="false"
          aria-label={
            actionTarget.kind === "batch"
              ? "선택 레이어 일괄 작업"
              : activeItem
                ? `${activeItem.label} 레이어 작업`
                : `${activeGroup?.name ?? "그룹"} 그룹 작업`
          }
          tabIndex={-1}
          className="absolute inset-x-2 bottom-2 z-40 max-h-[min(28rem,68vh)] overflow-y-auto rounded-xl border border-line bg-panel p-3 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-2 border-b border-line pb-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-fg">
                {actionTarget.kind === "batch" ? `선택 ${batchSelectedIds.length}개` : activeItem?.label ?? activeGroup?.name}
              </p>
              <p className="text-[0.68rem] text-fg-3 lg:text-[0.6rem]">
                {actionTarget.kind === "batch"
                  ? outsideSelectionCount > 0
                    ? `현재 결과만 적용 · 필터 밖 ${outsideSelectionCount}개 제외`
                    : "그룹 · 역할 · 색 · 삭제"
                  : activeItem
                    ? "레이어 작업"
                    : `그룹 작업 · ${activeGroupItemIds.length}개`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActionTarget(null);
                actionTriggerRef.current?.focus();
              }}
              className={cn("grid size-8 place-items-center rounded text-fg-3 hover:bg-raised hover:text-fg", coarseTarget, focusRing)}
              aria-label="레이어 작업 닫기"
            >
              <X size={14} />
            </button>
          </div>

          {actionTarget.kind === "batch" ? (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {outsideSelectionCount > 0 ? (
                <p className="col-span-2 rounded-md border border-warning/35 bg-warning-soft/20 px-2 py-2 text-[0.68rem] leading-relaxed text-warning">
                  화면에 보이는 선택 {batchSelectedIds.length}개에만 적용합니다. 필터 밖 선택 {outsideSelectionCount}개는 변경하거나 삭제하지 않습니다.
                </p>
              ) : null}
              <label className="col-span-2 text-[0.68rem] font-semibold text-fg-3">
                그룹
                <select
                  value={commonSelectedGroup ?? ""}
                  disabled={readOnly || groupingDisabled || filterActive || batchSelectedIds.length === 0}
                  onChange={(event) => setSelectedGroup(event.target.value, batchSelectedIds)}
                  aria-label="선택 레이어 그룹"
                  title={
                    groupingDisabled
                      ? "현재 작업면은 레이어 그룹을 지원하지 않아요"
                      : filterActive
                        ? "검색·필터를 지운 뒤 그룹을 바꿀 수 있어요"
                        : undefined
                  }
                  className={cn("mt-1 min-h-9 w-full rounded-md border border-line bg-card px-2 text-xs text-fg max-lg:min-h-11 pointer-coarse:min-h-11", focusRing)}
                >
                  {commonSelectedGroup === "__mixed__" ? <option value="__mixed__" disabled>여러 그룹</option> : null}
                  <option value="">그룹 없음</option>
                  {availableGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
              <label className="text-[0.68rem] font-semibold text-fg-3">
                작업 역할
                <select
                  value={commonSelectedRole ?? ""}
                  disabled={readOnly || batchSelectedIds.length === 0}
                  onChange={(event) => setSelectedRole(event.target.value, batchSelectedIds)}
                  aria-label="선택 레이어 역할"
                  className={cn("mt-1 min-h-9 w-full rounded-md border border-line bg-card px-2 text-xs text-fg max-lg:min-h-11 pointer-coarse:min-h-11", focusRing)}
                >
                  {commonSelectedRole === "__mixed__" ? <option value="__mixed__" disabled>여러 역할</option> : null}
                  <option value="">역할 없음</option>
                  {STUDIO_LAYER_ROLES.map((role) => <option key={role} value={role}>{STUDIO_LAYER_ROLE_LABELS[role]}</option>)}
                </select>
              </label>
              <label className="text-[0.68rem] font-semibold text-fg-3">
                색 라벨
                <select
                  value={commonSelectedColor ?? ""}
                  disabled={readOnly || batchSelectedIds.length === 0}
                  onChange={(event) => setSelectedColor(event.target.value, batchSelectedIds)}
                  aria-label="선택 레이어 색 라벨"
                  className={cn("mt-1 min-h-9 w-full rounded-md border border-line bg-card px-2 text-xs text-fg max-lg:min-h-11 pointer-coarse:min-h-11", focusRing)}
                >
                  {commonSelectedColor === "__mixed__" ? <option value="__mixed__" disabled>여러 색</option> : null}
                  <option value="">색 없음</option>
                  {STUDIO_LAYER_COLORS.map((color) => <option key={color} value={color}>{STUDIO_LAYER_COLOR_LABELS[color]}</option>)}
                </select>
              </label>
              <button
                type="button"
                disabled={
                  createGroupUnavailableReason !== undefined ||
                  batchSelectedIds.length === 0
                }
                onClick={() => onAction({ type: "create-group", seedIds: batchSelectedIds })}
                className={compactControl}
                aria-label={`새 그룹으로 묶기${
                  createGroupUnavailableReason
                    ? `, 사용 불가: ${createGroupUnavailableReason}`
                    : batchSelectedIds.length === 0
                      ? ", 사용 불가: 먼저 레이어를 선택하세요."
                      : ""
                }`}
                title={
                  createGroupUnavailableReason ??
                  (batchSelectedIds.length === 0
                    ? "먼저 레이어를 선택하세요."
                    : "선택 레이어를 새 그룹으로 묶기")
                }
              >
                <FolderPlus size={13} /> 새 그룹으로 묶기
              </button>
              <button
                type="button"
                disabled={readOnly || batchSelectedIds.length < 2}
                onClick={() => {
                  onAction({ type: "merge-selected", ids: batchSelectedIds });
                  setActionTarget(null);
                }}
                className={compactControl}
                title="선택한 레이어를 하나로 병합합니다 (가능하면 래스터 베이크)"
                aria-label="선택 레이어 병합"
              >
                <Layers3 size={13} /> 선택 병합
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  onAction({ type: "flatten-visible" });
                  setActionTarget(null);
                }}
                className={compactControl}
                title="표시 중인 레이어를 하나로 병합합니다 (가능하면 래스터 베이크)"
                aria-label="표시 레이어 병합"
              >
                <Grid2X2 size={13} /> 표시 병합
              </button>
              <button
                type="button"
                disabled={readOnly || batchSelectedIds.length === 0}
                onClick={() => {
                  onAction({ type: "delete-items", ids: batchSelectedIds });
                  setActionTarget(null);
                  globalThis.requestAnimationFrame?.(() => searchInputRef.current?.focus());
                }}
                className={cn(compactControl, "text-bad")}
              >
                <Trash2 size={13} /> 현재 결과 삭제
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectionChange([]);
                  setActionTarget(null);
                  globalThis.requestAnimationFrame?.(() => searchInputRef.current?.focus());
                }}
                className={cn(compactControl, "col-span-2")}
              >
                선택 전체 해제
              </button>
            </div>
          ) : activeItem ? (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button type="button" disabled={readOnly} onClick={() => beginRename("item", activeItem.id, activeItem.label)} className={compactControl}>
                <TypeIcon size={13} /> 이름 변경
              </button>
              {activeItem.type === "frame" ? (
                <button
                  type="button"
                  disabled={
                    readOnly
                    || groupingDisabled
                    || selectedIds.filter((id) => id !== activeItem.id).length === 0
                  }
                  onClick={() =>
                    onAction({
                      type: "create-frame-folder",
                      frameId: activeItem.id,
                      seedIds: selectedIds,
                    })
                  }
                  className={compactControl}
                  title="선택한 다른 레이어를 이 컷의 폴더로 묶고 패널 클립을 켭니다 (공유 거터 편집은 후속)"
                >
                  <FolderPlus size={13} /> 컷 폴더로 묶기
                </button>
              ) : null}
              <button
                type="button"
                disabled={readOnly || activeItemHiddenByGroup}
                onClick={() => onAction({ type: "set-items-hidden", ids: [activeItem.id], hidden: !activeItem.hidden })}
                className={compactControl}
                title={activeItemHiddenByGroup ? "상위 그룹이 숨겨져 있어 그룹을 먼저 표시해야 해요" : undefined}
              >
                {activeItem.hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                {activeItemHiddenByGroup ? "그룹에서 숨김" : activeItem.hidden ? "표시" : "숨김"}
              </button>
              <button
                type="button"
                onClick={() => onToggleLocalHidden(activeItem.id)}
                className={compactControl}
                title="다른 협업자 화면에는 그대로 보이고, 내 화면에서만 숨겨요"
              >
                <Ghost size={13} /> {activeItemLocallyHidden ? "나만 숨기기 해제" : "나만 숨기기"}
              </button>
              {onToggleLayerSolo ? (
                <button
                  type="button"
                  onClick={() => onToggleLayerSolo(activeItem.id)}
                  className={cn(
                    compactControl,
                    soloLayerId === activeItem.id && "border-accent/40 bg-accent-soft/50 text-accent"
                  )}
                  title="이 레이어만 내 화면에 남기고 나머지는 임시로 숨겨요 (협업 문서에는 반영되지 않아요)"
                  aria-pressed={soloLayerId === activeItem.id}
                >
                  <Crosshair size={13} />
                  {soloLayerId === activeItem.id ? "솔로 해제" : "솔로"}
                </button>
              ) : null}
              <button
                type="button"
                disabled={readOnly || activeItemLockedByGroup}
                onClick={() => onAction({ type: "set-items-locked", ids: [activeItem.id], locked: !activeItem.locked })}
                className={compactControl}
                title={activeItemLockedByGroup ? "상위 그룹이 잠겨 있어 그룹 잠금을 먼저 해제해야 해요" : undefined}
              >
                {activeItem.locked ? <LockOpen size={13} /> : <Lock size={13} />}
                {activeItemLockedByGroup ? "그룹에서 잠김" : activeItem.locked ? "잠금 해제" : "잠금"}
              </button>
              {activeItem.type === "image" ? (
                <>
                  <button type="button" disabled={readOnly || activeItemEffectivelyLocked} onClick={() => onAction({ type: "set-item-flag", id: activeItem.id, flag: "alphaLocked", value: !activeItem.alphaLocked })} className={compactControl}>
                    <Grid2X2 size={13} /> {activeItem.alphaLocked ? "알파 락 해제" : "알파 락"}
                  </button>
                  <button type="button" disabled={readOnly} onClick={() => onAction({ type: "set-item-flag", id: activeItem.id, flag: "fillReference", value: !activeItem.fillReference })} className={compactControl}>
                    <ScanLine size={13} /> {activeItem.fillReference ? "참조 해제" : "채우기 참조"}
                  </button>
                  {activeItem.masked ? (
                    <button type="button" disabled={readOnly || activeItemEffectivelyLocked} onClick={() => onAction({ type: "set-item-flag", id: activeItem.id, flag: "maskEnabled", value: activeItem.maskEnabled === false })} className={compactControl}>
                      <Layers3 size={13} /> {activeItem.maskEnabled === false ? "마스크 켜기" : "마스크 끄기"}
                    </button>
                  ) : null}
                </>
              ) : null}
              <button
                type="button"
                disabled={readOnly || filterActive}
                onClick={() => onAction({ type: "move-item", id: activeItem.id, direction: "up" })}
                className={compactControl}
                title={filterActive ? "검색·필터를 지우면 전체 레이어 순서를 바꿀 수 있어요" : "앞으로 이동"}
              >
                <ArrowUp size={13} /> 앞으로
              </button>
              <button
                type="button"
                disabled={readOnly || filterActive}
                onClick={() => onAction({ type: "move-item", id: activeItem.id, direction: "down" })}
                className={compactControl}
                title={filterActive ? "검색·필터를 지우면 전체 레이어 순서를 바꿀 수 있어요" : "뒤로 이동"}
              >
                <ArrowDown size={13} /> 뒤로
              </button>

              {filterActive ? (
                <p className="col-span-2 rounded-md bg-warning-soft/20 px-2 py-1.5 text-[0.6rem] leading-relaxed text-warning">
                  필터된 목록에서는 보이지 않는 레이어와 순서가 섞이지 않도록 재정렬을 잠급니다.
                </p>
              ) : null}

              <label className="col-span-2 text-[0.62rem] font-semibold text-fg-3">
                그룹
                <select
                  value={availableGroups.some((group) => group.id === activeItem.groupId) ? activeItem.groupId : ""}
                  disabled={readOnly || groupingDisabled || filterActive}
                  onChange={(event) => setSelectedGroup(event.target.value, [activeItem.id])}
                  title={
                    groupingDisabled
                      ? "현재 작업면은 레이어 그룹을 지원하지 않아요"
                      : filterActive
                        ? "검색·필터를 지운 뒤 그룹을 바꿀 수 있어요"
                        : undefined
                  }
                  className={cn("mt-1 min-h-9 w-full rounded-md border border-line bg-card px-2 text-xs text-fg max-lg:min-h-11 pointer-coarse:min-h-11", focusRing)}
                >
                  <option value="">그룹 없음</option>
                  {availableGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
              <label className="text-[0.62rem] font-semibold text-fg-3">
                <span className="inline-flex items-center gap-1"><Tags size={11} /> 작업 역할</span>
                <select
                  value={activeItem.role ?? ""}
                  disabled={readOnly}
                  onChange={(event) => setSelectedRole(event.target.value, [activeItem.id])}
                  className={cn("mt-1 min-h-9 w-full rounded-md border border-line bg-card px-2 text-xs text-fg max-lg:min-h-11 pointer-coarse:min-h-11", focusRing)}
                >
                  <option value="">역할 없음</option>
                  {STUDIO_LAYER_ROLES.map((role) => <option key={role} value={role}>{STUDIO_LAYER_ROLE_LABELS[role]}</option>)}
                </select>
              </label>
              <label className="text-[0.62rem] font-semibold text-fg-3">
                <span className="inline-flex items-center gap-1"><Palette size={11} /> 색 라벨</span>
                <select
                  value={activeItem.color ?? ""}
                  disabled={readOnly}
                  onChange={(event) => setSelectedColor(event.target.value, [activeItem.id])}
                  className={cn("mt-1 min-h-9 w-full rounded-md border border-line bg-card px-2 text-xs text-fg max-lg:min-h-11 pointer-coarse:min-h-11", focusRing)}
                >
                  <option value="">색 없음</option>
                  {STUDIO_LAYER_COLORS.map((color) => <option key={color} value={color}>{STUDIO_LAYER_COLOR_LABELS[color]}</option>)}
                </select>
              </label>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  onAction({ type: "merge-down", id: activeItem.id });
                  setActionTarget(null);
                }}
                className={compactControl}
                title="아래 레이어와 병합합니다 (가능하면 래스터 베이크)"
                aria-label="아래로 병합"
              >
                <Layers3 size={13} /> 아래로 병합
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  onAction({ type: "flatten-visible" });
                  setActionTarget(null);
                }}
                className={compactControl}
                title="표시 중인 레이어를 하나로 병합합니다 (가능하면 래스터 베이크)"
                aria-label="표시 레이어 병합"
              >
                <Grid2X2 size={13} /> 표시 병합
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => onAction({ type: "delete-items", ids: [activeItem.id] })}
                className={cn(compactControl, "col-span-2 text-bad")}
              >
                <Trash2 size={13} /> 레이어 삭제
              </button>
            </div>
          ) : activeGroup ? (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button type="button" disabled={readOnly} onClick={() => beginRename("group", activeGroup.id, activeGroup.name)} className={compactControl}>
                <TypeIcon size={13} /> 이름 변경
              </button>
              <button
                type="button"
                onClick={() => selectGroupItems(activeGroupItemIds)}
                aria-label={
                  activeGroupAllSelected
                    ? `${activeGroup.name} 그룹 선택 해제`
                    : `${activeGroup.name} 그룹 모두 선택`
                }
                aria-pressed={activeGroupAllSelected}
                className={compactControl}
              >
                <ListChecks size={13} />
                {activeGroupAllSelected ? "그룹 선택 해제" : "모두 선택"}
              </button>
              <button type="button" disabled={readOnly} onClick={() => onAction({ type: "set-group-flag", groupId: activeGroup.id, flag: "hidden", value: !activeGroup.hidden })} className={compactControl}>
                {activeGroup.hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                {activeGroup.hidden ? "그룹 표시" : "그룹 숨김"}
              </button>
              <button type="button" disabled={readOnly} onClick={() => onAction({ type: "set-group-flag", groupId: activeGroup.id, flag: "locked", value: !activeGroup.locked })} className={compactControl}>
                {activeGroup.locked ? <LockOpen size={13} /> : <Lock size={13} />}
                {activeGroup.locked ? "잠금 해제" : "그룹 잠금"}
              </button>
              <button
                type="button"
                disabled={readOnly || groupingDisabled || filterActive || activeGroupItemIds.length === 0}
                onClick={() => onAction({ type: "move-group", groupId: activeGroup.id, direction: "up" })}
                className={compactControl}
                title={filterActive ? "검색·필터를 지우면 그룹 블록 순서를 바꿀 수 있어요" : "그룹 블록을 앞으로 이동"}
              >
                <ArrowUp size={13} /> 그룹 앞으로
              </button>
              <button
                type="button"
                disabled={readOnly || groupingDisabled || filterActive || activeGroupItemIds.length === 0}
                onClick={() => onAction({ type: "move-group", groupId: activeGroup.id, direction: "down" })}
                className={compactControl}
                title={filterActive ? "검색·필터를 지우면 그룹 블록 순서를 바꿀 수 있어요" : "그룹 블록을 뒤로 이동"}
              >
                <ArrowDown size={13} /> 그룹 뒤로
              </button>
              {filterActive ? (
                <p className="col-span-2 rounded-md bg-warning-soft/20 px-2 py-1.5 text-[0.6rem] leading-relaxed text-warning">
                  필터된 목록에서는 그룹 밖 레이어와 순서가 섞이지 않도록 그룹 이동을 잠급니다.
                </p>
              ) : null}
              <button
                type="button"
                disabled={readOnly || groupingDisabled || filterActive}
                onClick={() => onAction({ type: "ungroup", groupId: activeGroup.id })}
                className={cn(compactControl, "col-span-2")}
                title={
                  groupingDisabled
                    ? "현재 작업면은 레이어 그룹을 지원하지 않아요"
                    : filterActive
                      ? "검색·필터를 지운 뒤 그룹을 해제할 수 있어요"
                      : undefined
                }
              >
                <FolderMinus size={13} /> 그룹 해제 · 레이어 보존
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
