/**
 * Thin Studio UI surface for Hybrid DCC workspace (product exposure).
 * Pure workspace kernels drive state; this panel is the React shell only.
 */

import { CircleHelp, Redo2, Undo2 } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import {
  createStudioHybridDccComponentSelection,
  mutateStudioHybridDccComponentSelection,
  resolveStudioHybridDccSelectedOrDefaultFaceIds,
  resolveStudioHybridDccSelectedOrDefaultUndirectedEdgeIds,
  type StudioHybridDccComponentMode,
  type StudioHybridDccComponentSelection,
  type StudioHybridDccMeshSelectionSource,
  type StudioHybridDccSelectionMode,
  type StudioHybridDccSelectionOperation,
  type StudioHybridDccSelectionResult,
} from "./studio-hybrid-dcc-component-selection";
import {
  workspaceAddActiveModifier,
  workspaceApplyActiveModifierStack,
  workspaceMoveActiveModifier,
  workspacePatchActiveModifier,
  workspaceRefreshModifierPreviews,
  workspaceRemoveActiveModifier,
  workspaceToggleActiveModifier,
} from "./studio-hybrid-dcc-modifier-workspace";
import { workspaceLoadEditableRoomPreset } from "./studio-hybrid-dcc-room-workspace";
import {
  createStudioHybridDccWorkspace,
  workspaceAddUnitCube,
  workspaceCommitObjectTransform,
  workspaceDeleteActive,
  workspaceDiagnostics,
  workspaceDuplicateActive,
  workspaceImportBytes,
  workspaceReconcileSelectionAfterHistory,
  workspaceRedo,
  workspaceSelectAsset,
  workspaceSetAssetVisibility,
  workspaceSculptActive,
  workspaceUndo,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import {
  StudioHybridDccModifierInspector,
  type StudioHybridDccModifierStackView,
  type StudioHybridDccModifierView,
} from "./StudioHybridDccModifierInspector";
import { StudioHybridDccEnvironmentNotice } from "./StudioHybridDccEnvironmentNotice";
import { StudioHybridDccIntro, type StudioHybridDccStartKind } from "./StudioHybridDccIntro";
import { StudioHybridDccViewport } from "./StudioHybridDccViewport";
import {
  StudioHybridDccExpertTools,
  StudioHybridDccModeTabs,
  StudioHybridDccToolTiles,
} from "./StudioHybridDccWorkbenchChrome";
import {
  buildStudioHybridDccExpertToolGroups,
  buildStudioHybridDccQuickTools,
  STUDIO_HYBRID_DCC_SCULPT_BRUSH_LABELS,
  type StudioHybridDccRunResult,
  type StudioHybridDccToolContext,
} from "./studio-hybrid-dcc-tool-catalog";
import { detectStudioHybridDccWebglCapability } from "./studio-hybrid-dcc-webgl-probe";
import { useStudioHybridDccModeLabel } from "./studio-hybrid-dcc-workbench-modes";

import type { StudioHybridDccBg3dHandoffResult } from "./studio-hybrid-dcc-bg3d-handoff";
import type { StudioHybridDccPersistenceReceiptEvidence } from "./studio-hybrid-dcc-persistence";
import type { StudioSculptBrushKind } from "./studio-hybrid-sculpt-kernel";
import type { StudioDccWorkbenchMode } from "../studio-workspace-route";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

type BilingualFn = (ko: string, en: string) => string;

/** 장면 목록에 보이는 쉬운 이름. 원본 식별자는 작은 글씨로 따로 보여 준다. */
function friendlyHybridDccAssetName(bt: BilingualFn, assetId: string, index: number): string {
  if (/^(?:asset-)?cube(?:-|$)/iu.test(assetId)) return bt("큐브", "Cube");
  const roomPart = /-part-(\d+)$/u.exec(assetId);
  if (roomPart) return formatI18nTemplate(bt("방 구성품 {n}", "Room part {n}"), { n: Number(roomPart[1]) });
  return formatI18nTemplate(bt("오브젝트 {n}", "Object {n}"), { n: index + 1 });
}

type BilingualPair = readonly [ko: string, en: string];

const STUDIO_HYBRID_DCC_MODE_GUIDE: Record<
  StudioDccWorkbenchMode,
  { readonly title: BilingualPair; readonly description: BilingualPair }
> = {
  model: {
    title: ["오브젝트 만들기와 형태 편집", "Make objects and edit their shape"],
    description: [
      "기본 도형을 만들고 면을 밀거나 모서리를 다듬어 소품 형태를 완성합니다.",
      "Start from a basic shape, then push faces and refine edges to finish a prop.",
    ],
  },
  build: {
    title: ["방과 배경 세트 만들기", "Build rooms and background sets"],
    description: [
      "공간 프리셋과 건물 데이터로 웹툰 컷에 쓸 배경을 빠르게 구성합니다.",
      "Use room presets and building data to set up panel backgrounds quickly.",
    ],
  },
  cad: {
    title: ["치수가 정확한 솔리드 제작", "Solids with exact dimensions"],
    description: [
      "구멍·라운드·속 비우기·파이프 같은 정밀 형상을 CAD 커널로 계산합니다.",
      "A CAD kernel computes precise holes, fillets, shells and pipes.",
    ],
  },
  sculpt: {
    title: ["조형 실험실 · voxel-lite", "Sculpt lab · voxel-lite"],
    description: [
      "전문 조형 엔진이 연결되기 전까지 제한된 표면 변형과 메시 정리만 실험적으로 제공합니다.",
      "Until a full sculpting engine is connected, this offers limited, experimental surface edits and cleanup.",
    ],
  },
  material: {
    title: ["표면 방향과 UV 준비", "Prepare surfaces and UVs"],
    description: [
      "텍스처가 바르게 붙도록 UV와 겉면 방향을 정리하고 내보내기 결과를 점검합니다.",
      "Tidy UVs and face directions so textures land correctly, then check the export.",
    ],
  },
  shot: {
    title: ["카메라 컷과 웹툰용 선화 전달", "Camera shots and panel line art"],
    description: [
      "여러 컷을 만들고, 작가가 고친 선을 지킨 채 3D 배경 편집기로 넘겨 원고에 넣습니다.",
      "Frame several shots, keep artists' line fixes, and hand them to the 3D background editor for your page.",
    ],
  },
};

function isStudioHybridDccRunResult(
  value: StudioHybridDccWorkspace | StudioHybridDccRunResult,
): value is StudioHybridDccRunResult {
  return Object.hasOwn(value, "workspace");
}

function hybridDccSelectionSource(
  workspace: StudioHybridDccWorkspace,
  assetId = workspace.activeAssetId,
): StudioHybridDccMeshSelectionSource | null {
  if (!assetId) return null;
  const record = workspace.session.state.geometry.records[assetId];
  if (!record) return null;
  return {
    assetId,
    mesh: record.mesh,
    meshRevision: record.revision,
    sourceHash: record.meshHash,
  };
}

function selectionResultValue<T>(result: StudioHybridDccSelectionResult<T>): T {
  if (result.ok) return result.value;
  throw new Error(result.diagnostics.map(({ message }) => message).join(" · "));
}

function alignHybridDccSelectionToWorkspace(
  selection: StudioHybridDccComponentSelection,
  workspace: StudioHybridDccWorkspace,
): StudioHybridDccComponentSelection {
  const source = hybridDccSelectionSource(workspace);
  if (!source) return createStudioHybridDccComponentSelection();
  if (selection.mode === "object") {
    return selectionResultValue(mutateStudioHybridDccComponentSelection(selection, {
      mode: "object",
      operation: "replace",
      ids: [source.assetId],
      activeId: source.assetId,
    }));
  }
  if (selection.provenance?.assetId === source.assetId
    && selection.provenance.meshRevision === source.meshRevision
    && selection.provenance.sourceHash === source.sourceHash) {
    return selection;
  }
  return selectionResultValue(mutateStudioHybridDccComponentSelection(
    createStudioHybridDccComponentSelection(),
    {
      mode: selection.mode,
      operation: "replace",
      ids: [],
      source,
    },
  ));
}

export interface StudioHybridDccPanelProps {
  /** Opens the shipping Shot/NPR editor with verified derivatives of the DCC authority. */
  readonly onOpenInBackground3D?: (result: StudioHybridDccBg3dHandoffResult) => void;
  readonly initialWorkspace?: StudioHybridDccWorkspace;
  readonly workspaceDocumentId?: string;
  readonly onWorkspaceChange?: (workspace: StudioHybridDccWorkspace) => void;
  readonly persistenceReceipt?: StudioHybridDccPersistenceReceiptEvidence;
  readonly persistenceStatus?: StudioHybridDccPersistenceStatus;
  readonly workbenchMode?: StudioDccWorkbenchMode;
  readonly onWorkbenchModeChange?: (mode: StudioDccWorkbenchMode) => void;
}

export type StudioHybridDccPersistenceStatus =
  | "checking"
  | "ready"
  | "saving"
  | "saved"
  | "session-only"
  | "error";

const STUDIO_HYBRID_DCC_PERSISTENCE_COPY: Record<
  StudioHybridDccPersistenceStatus,
  { readonly label: BilingualPair; readonly detail: BilingualPair; readonly tone: "good" | "warn" | "neutral" }
> = {
  checking: {
    label: ["저장 공간 확인 중", "Checking storage"],
    detail: ["이전 작업이 있는지 확인하고 있습니다.", "Looking for earlier work on this device."],
    tone: "neutral",
  },
  ready: {
    label: ["자동 저장 준비됨", "Autosave ready"],
    detail: ["편집하면 이 기기에 자동 저장됩니다.", "Edits autosave on this device."],
    tone: "neutral",
  },
  saving: {
    label: ["저장 중", "Saving"],
    detail: ["방금 편집을 이 기기에 저장하고 있습니다.", "Saving your latest edit on this device."],
    tone: "neutral",
  },
  saved: {
    label: ["자동 저장됨", "Autosaved"],
    detail: ["이 기기의 브라우저에 저장했습니다. 클라우드 백업은 아닙니다.", "Saved in this browser on this device. Not a cloud backup."],
    tone: "good",
  },
  "session-only": {
    label: ["이 창에서만 유지", "This window only"],
    detail: [
      "로그인 확인 전이거나 브라우저가 저장 공간을 지원하지 않아 지금은 자동 저장되지 않습니다. 창을 닫기 전에 필요하면 .toon3d로 내보내 두세요.",
      "Autosave isn't available right now (sign-in is still being checked or the browser lacks storage support). Export a .toon3d package before closing if you need it.",
    ],
    tone: "warn",
  },
  error: {
    label: ["자동 저장 꺼짐", "Autosave off"],
    detail: [
      "저장 공간을 준비하지 못해 자동 저장이 멈췄습니다. 편집은 계속할 수 있지만 창을 닫기 전에 .toon3d로 내보내 두세요.",
      "Storage couldn't be prepared, so autosave stopped. You can keep editing, but export a .toon3d package before closing.",
    ],
    tone: "warn",
  },
};

const PERSISTENCE_TONE_CLASS = {
  good: "border-good/35 bg-good/10 text-good",
  warn: "border-warn/45 bg-warn/10 text-warn",
  neutral: "border-line bg-panel text-fg-2",
} as const;

const TOPBAR_BUTTON_CLASS =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

export function StudioHybridDccPanel({
  initialWorkspace,
  onOpenInBackground3D,
  onWorkspaceChange,
  onWorkbenchModeChange,
  persistenceReceipt,
  persistenceStatus,
  workbenchMode: controlledWorkbenchMode,
  workspaceDocumentId,
}: StudioHybridDccPanelProps) {
  const bt = useBilingual("StudioHybridDccPanel");
  const modeLabel = useStudioHybridDccModeLabel();
  const introId = useId();
  const [ws, setWs] = useState<StudioHybridDccWorkspace>(() =>
    initialWorkspace ?? createStudioHybridDccWorkspace(workspaceDocumentId ?? "ui-workspace"),
  );
  // null = 자동(장면이 비었을 때만 안내). 사용자가 열거나 닫으면 이번 실행 동안 그 선택을 따른다.
  const [introPreference, setIntroPreference] = useState<boolean | null>(null);
  const [componentSelection, setComponentSelection] =
    useState<StudioHybridDccComponentSelection>(() => alignHybridDccSelectionToWorkspace(
      createStudioHybridDccComponentSelection(),
      ws,
    ));
  const [log, setLog] = useState<string>(() => bt(
    "준비됨 · 큐브를 추가하거나 모델을 가져와 3D 제작을 시작하세요.",
    "Ready · Add a cube or import a model to start.",
  ));
  const [busy, setBusy] = useState(false);
  // null = 아직 확인 전. 확인이 끝나면 뷰포트와 상단 안내가 같은 결과를 쓴다.
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const recheckWebgl = () => setWebglSupported(detectStudioHybridDccWebglCapability());
  const [localWorkbenchMode, setLocalWorkbenchMode] =
    useState<StudioDccWorkbenchMode>("model");
  const workbenchMode = controlledWorkbenchMode ?? localWorkbenchMode;
  const changeWorkbenchMode = (mode: StudioDccWorkbenchMode) => {
    if (controlledWorkbenchMode === undefined) setLocalWorkbenchMode(mode);
    onWorkbenchModeChange?.(mode);
  };
  const [modifierError, setModifierError] = useState<string | null>(null);
  const [sculptBrushKind, setSculptBrushKind] = useState<StudioSculptBrushKind>("inflate");
  const [sculptDig, setSculptDig] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const runGenerationRef = useRef(0);
  const handoffAbortRef = useRef<AbortController | null>(null);
  const previewRestoreLeaseRef = useRef<{
    readonly workspace: StudioHybridDccWorkspace;
    promise: Promise<StudioHybridDccWorkspace> | null;
  } | null>(null);
  if (!previewRestoreLeaseRef.current) {
    previewRestoreLeaseRef.current = { workspace: ws, promise: null };
  }
  const lastEmittedWorkspaceRef = useRef(ws);
  const emitWorkspaceChange = useEffectEvent((workspace: StudioHybridDccWorkspace) => {
    onWorkspaceChange?.(workspace);
  });

  useEffect(() => {
    setWebglSupported(detectStudioHybridDccWebglCapability());
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runGenerationRef.current += 1;
      handoffAbortRef.current?.abort();
      handoffAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (lastEmittedWorkspaceRef.current === ws) return;
    lastEmittedWorkspaceRef.current = ws;
    emitWorkspaceChange(ws);
  }, [ws]);

  useEffect(() => {
    const lease = previewRestoreLeaseRef.current!;
    lease.promise ??= workspaceRefreshModifierPreviews(lease.workspace);
    let cancelled = false;
    void lease.promise
      .then((next) => {
        if (cancelled || next === lease.workspace) return;
        setWs((current) => current === lease.workspace ? next : current);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setModifierError(message);
        setLog(`비파괴 변형 미리보기 복구 실패 · ${message}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (
    label: string,
    fn: () =>
      | StudioHybridDccWorkspace
      | StudioHybridDccRunResult
      | Promise<StudioHybridDccWorkspace | StudioHybridDccRunResult>,
  ) => {
    const generation = ++runGenerationRef.current;
    setBusy(true);
    try {
      const result = await fn();
      const raw = isStudioHybridDccRunResult(result) ? result.workspace : result;
      const requestedSelection = isStudioHybridDccRunResult(result)
        ? result.selection
        : undefined;
      const next = await workspaceRefreshModifierPreviews(raw);
      if (!mountedRef.current || generation !== runGenerationRef.current) return;
      setWs(next);
      setComponentSelection((current) => alignHybridDccSelectionToWorkspace(
        requestedSelection ?? current,
        next,
      ));
      setLog(
        `${label} 완료 · 오브젝트 ${Object.keys(next.session.state.geometry.records).length}개 · 컷 ${next.bridge.shots.length}개 · UV ${next.lastUvMap?.mode ?? "없음"} · 오류 ${workspaceDiagnostics(next).errorCount}개`,
      );
    } catch (error) {
      if (!mountedRef.current || generation !== runGenerationRef.current) return;
      setLog(`${label} 실패 · ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (mountedRef.current && generation === runGenerationRef.current) setBusy(false);
    }
  };

  const runModifier = (
    label: string,
    fn: () => StudioHybridDccWorkspace | Promise<StudioHybridDccWorkspace>,
  ) => {
    setModifierError(null);
    void run(label, async () => {
      try {
        return await fn();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setModifierError(message);
        throw error;
      }
    });
  };

  const diag = workspaceDiagnostics(ws);
  const authorityRecords = Object.values(ws.session.state.geometry.records)
    .toSorted((left, right) =>
      left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0);
  const activeRecord = ws.activeAssetId
    ? ws.session.state.geometry.records[ws.activeAssetId] ?? null
    : null;
  const activeRights = ws.activeAssetId
    ? ws.session.state.rightsBom.find(({ assetId }) => assetId === ws.activeAssetId) ?? null
    : null;
  const activeTransform = ws.activeAssetId
    ? ws.session.state.objectTransforms[ws.activeAssetId] ?? null
    : null;
  const modifierStackView: StudioHybridDccModifierStackView = {
    modifiers: activeRecord
      ? activeRecord.modifierStack.modifiers.map((modifier): StudioHybridDccModifierView => {
          switch (modifier.kind) {
            case "mirror":
              return {
                id: modifier.id,
                kind: modifier.kind,
                enabled: modifier.enabled,
                axis: modifier.axis,
                merge: modifier.merge,
                mergeThreshold: modifier.mergeThreshold,
                bisect: modifier.bisect,
                clip: modifier.clip,
              };
            case "array":
              return {
                id: modifier.id,
                kind: modifier.kind,
                enabled: modifier.enabled,
                count: modifier.count,
                offset: modifier.offset,
                mode: modifier.mode,
                radialAngleRad: modifier.radialAngleRad,
                realizeInstances: modifier.realizeInstances,
              };
            case "boolean":
              return {
                id: modifier.id,
                kind: modifier.kind,
                enabled: modifier.enabled,
                operation: modifier.operation,
                operandId: modifier.operandAssetId ?? null,
                operandOptions: authorityRecords
                  .filter(({ assetId }) => assetId !== activeRecord.assetId)
                  .map(({ assetId }, index) => ({
                    id: assetId,
                    label: `${friendlyHybridDccAssetName(bt, assetId, index)} · ${assetId}`,
                  })),
              };
            case "solidify":
              return {
                id: modifier.id,
                kind: modifier.kind,
                enabled: modifier.enabled,
                thickness: modifier.thickness,
                evenThickness: modifier.evenThickness,
                rim: modifier.rim,
              };
            case "bevel":
              return {
                id: modifier.id,
                kind: modifier.kind,
                enabled: modifier.enabled,
                amount: modifier.amount,
                segments: modifier.segments,
                angleLimitRad: modifier.angleLimitRad,
                weightInfluence: modifier.weightInfluence,
              };
            case "subdivision":
              return {
                id: modifier.id,
                kind: modifier.kind,
                enabled: modifier.enabled,
                levels: modifier.levels,
                smooth: modifier.smooth,
              };
            case "weld":
              return {
                id: modifier.id,
                kind: modifier.kind,
                enabled: modifier.enabled,
                quantum: modifier.quantum,
              };
            case "decimate":
              return {
                id: modifier.id,
                kind: modifier.kind,
                enabled: modifier.enabled,
                ratio: modifier.ratio,
              };
            case "simple-deform":
              return {
                id: modifier.id,
                kind: modifier.kind,
                enabled: modifier.enabled,
                mode: modifier.mode,
                axis: modifier.axis,
                angleRad: modifier.angleRad,
                factor: modifier.factor,
              };
          }
        })
      : [],
  };

  const resolveSelectedFaces = (): readonly number[] => {
    const source = hybridDccSelectionSource(ws);
    if (!source) throw new Error("먼저 오브젝트를 선택하세요.");
    if (componentSelection.mode !== "object" && componentSelection.mode !== "face") {
      throw new Error("면 편집 도구입니다. 3번 키 또는 ‘면’을 누른 뒤 면을 선택하세요.");
    }
    if (componentSelection.mode === "face" && componentSelection.elementIds.length === 0) {
      throw new Error("선택한 면이 없습니다. 3D 화면에서 편집할 면을 먼저 선택하세요.");
    }
    return selectionResultValue(
      resolveStudioHybridDccSelectedOrDefaultFaceIds(componentSelection, source),
    ).ids;
  };
  const resolveSelectedEdge = (): number => {
    const source = hybridDccSelectionSource(ws);
    if (!source) throw new Error("먼저 오브젝트를 선택하세요.");
    if (componentSelection.mode !== "object" && componentSelection.mode !== "edge") {
      throw new Error("모서리 편집 도구입니다. 2번 키 또는 ‘선’을 누른 뒤 모서리를 선택하세요.");
    }
    if (componentSelection.mode === "edge" && componentSelection.elementIds.length === 0) {
      throw new Error("선택한 모서리가 없습니다. 3D 화면에서 편집할 모서리를 먼저 선택하세요.");
    }
    return selectionResultValue(
      resolveStudioHybridDccSelectedOrDefaultUndirectedEdgeIds(componentSelection, source),
    ).activeId;
  };
  const resolveSelectedEdges = (): readonly number[] => {
    const source = hybridDccSelectionSource(ws);
    if (!source) throw new Error("먼저 오브젝트를 선택하세요.");
    if (componentSelection.mode !== "object" && componentSelection.mode !== "edge") {
      throw new Error("모서리 편집 도구입니다. 2번 키 또는 ‘선’을 누른 뒤 모서리를 선택하세요.");
    }
    if (componentSelection.mode === "edge" && componentSelection.elementIds.length === 0) {
      throw new Error("선택한 모서리가 없습니다. 3D 화면에서 편집할 모서리를 먼저 선택하세요.");
    }
    return selectionResultValue(
      resolveStudioHybridDccSelectedOrDefaultUndirectedEdgeIds(componentSelection, source),
    ).ids;
  };

  const selectWorkspaceAsset = (assetId: string | null) => {
    try {
      const next = workspaceSelectAsset(ws, assetId);
      setWs(next);
      setComponentSelection((current) => alignHybridDccSelectionToWorkspace(current, next));
    } catch (error) {
      setLog(`오브젝트 선택 실패 · ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const changeComponentSelectionMode = (mode: StudioHybridDccSelectionMode) => {
    try {
      if (mode === "object") {
        const ids = ws.activeAssetId ? [ws.activeAssetId] : [];
        setComponentSelection((current) => selectionResultValue(
          mutateStudioHybridDccComponentSelection(current, {
            mode: "object",
            operation: "replace",
            ids,
            activeId: ws.activeAssetId,
          }),
        ));
        return;
      }
      const source = hybridDccSelectionSource(ws);
      if (!source) throw new Error("점·선·면 편집을 시작할 오브젝트를 먼저 선택하세요.");
      setComponentSelection((current) => selectionResultValue(
        mutateStudioHybridDccComponentSelection(current, {
          mode,
          operation: "replace",
          ids: [],
          source,
        }),
      ));
    } catch (error) {
      setLog(`편집 선택 모드 변경 실패 · ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const selectMeshComponent = (
    assetId: string,
    mode: StudioHybridDccComponentMode,
    elementId: number,
    operation: StudioHybridDccSelectionOperation,
  ) => {
    try {
      const nextWorkspace = workspaceSelectAsset(ws, assetId);
      const source = hybridDccSelectionSource(nextWorkspace, assetId);
      if (!source) throw new Error("선택한 메시 원본을 찾지 못했습니다.");
      setWs(nextWorkspace);
      setComponentSelection((current) => {
        const base = current.mode === mode && current.provenance?.assetId === assetId
          ? current
          : createStudioHybridDccComponentSelection();
        return selectionResultValue(mutateStudioHybridDccComponentSelection(base, {
          mode,
          operation,
          ids: [elementId],
          activeId: operation === "replace" || operation === "add" ? elementId : undefined,
          source,
        }));
      });
    } catch (error) {
      setLog(`메시 요소 선택 실패 · ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const clearMeshComponentSelection = () => {
    const source = hybridDccSelectionSource(ws);
    if (!source || componentSelection.mode === "object") return;
    try {
      setComponentSelection((current) => selectionResultValue(
        mutateStudioHybridDccComponentSelection(current, {
          mode: current.mode as StudioHybridDccComponentMode,
          operation: "replace",
          ids: [],
          source,
        }),
      ));
    } catch (error) {
      setLog(`선택 해제 실패 · ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const openInBackground3d = async () => {
    if (!onOpenInBackground3D || busy) return;
    const generation = ++runGenerationRef.current;
    const controller = new AbortController();
    handoffAbortRef.current?.abort();
    handoffAbortRef.current = controller;
    setBusy(true);
    try {
      const { handoffStudioHybridDccWorkspaceToBg3d } = await import( "./studio-hybrid-dcc-bg3d-handoff"
      );
      const result = await handoffStudioHybridDccWorkspaceToBg3d(ws, {
        signal: controller.signal,
      });
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        generation !== runGenerationRef.current
      ) return;
      setLog(
        `3D 배경 편집기로 전달 완료 · 모델 ${result.assets.length}개 · 컷 ${result.shots.length}개 · 보존 보고 ${result.losses.length}개`,
      );
      onOpenInBackground3D(result);
    } catch (error) {
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        generation !== runGenerationRef.current
      ) return;
      setLog(
        `3D 배경 편집기 전달 실패 · ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (handoffAbortRef.current === controller) handoffAbortRef.current = null;
      if (mountedRef.current && generation === runGenerationRef.current) setBusy(false);
    }
  };

  const toolContext: StudioHybridDccToolContext = {
    bt,
    ws,
    componentSelection,
    resolveSelectedFaces,
    resolveSelectedEdge,
    resolveSelectedEdges,
    run,
    runModifier,
    setLog,
    pickImportFile: () => fileRef.current?.click(),
    canOpenInBackground3d: Boolean(onOpenInBackground3D),
    openInBackground3d,
    sculpt: { kind: sculptBrushKind, dig: sculptDig },
  };
  const quickTools = buildStudioHybridDccQuickTools(workbenchMode, toolContext);

  const commitTransformComponent = (
    channel: "position" | "rotationEulerRad" | "scale",
    axis: 0 | 1 | 2,
    displayValue: string,
  ) => {
    if (!ws.activeAssetId || !activeTransform) return;
    const parsed = Number(displayValue);
    if (!Number.isFinite(parsed)) {
      setLog("숫자 변환 실패: 유효한 숫자를 입력해 주세요.");
      return;
    }
    const value = channel === "rotationEulerRad" ? parsed * Math.PI / 180 : parsed;
    if (Math.abs(value - activeTransform[channel][axis]) <= 1e-12) return;
    const nextChannel = [...activeTransform[channel]] as [number, number, number];
    nextChannel[axis] = value;
    const next = { ...activeTransform, [channel]: nextChannel };
    const assetId = ws.activeAssetId;
    void run("숫자 변환", () => workspaceCommitObjectTransform(ws, assetId, next));
  };

  const hasActiveAsset = Boolean(ws.activeAssetId);
  const introVisible = introPreference ?? authorityRecords.length === 0;
  const startFromIntro = (kind: StudioHybridDccStartKind) => {
    if (kind === "import") {
      fileRef.current?.click();
      return;
    }
    if (kind === "room") {
      void run("편집 가능한 교실 세트", () => workspaceLoadEditableRoomPreset(ws, "classroom"));
      return;
    }
    void run("큐브 추가", () => workspaceAddUnitCube(ws));
  };
  const persistenceCopy = persistenceStatus ? STUDIO_HYBRID_DCC_PERSISTENCE_COPY[persistenceStatus] : null;
  const modeGuide = STUDIO_HYBRID_DCC_MODE_GUIDE[workbenchMode];

  const expertToolGroups = buildStudioHybridDccExpertToolGroups(toolContext);

  return (
    <section
      className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-canvas/35 p-3 text-sm [&>*]:shrink-0 sm:p-4"
      data-studio-hybrid-dcc-panel="true"
      data-workbench-mode={workbenchMode}
      aria-label={bt("정밀 3D 모델링 작업 공간", "Precision 3D modeling workspace")}
    >
      <div className="flex flex-wrap items-center gap-2" data-studio-hybrid-dcc-topbar="true">
        <StudioHybridDccModeTabs mode={workbenchMode} onChange={changeWorkbenchMode} />
        <div className="flex flex-wrap items-center gap-1.5 max-sm:w-full">
          {persistenceStatus && persistenceCopy ? (
            <span
              className={cn(
                "inline-flex min-h-8 items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                PERSISTENCE_TONE_CLASS[persistenceCopy.tone],
              )}
              role="status"
              title={bt(persistenceCopy.detail[0], persistenceCopy.detail[1])}
              data-studio-hybrid-dcc-persistence={persistenceStatus}
              data-studio-hybrid-dcc-persistence-sequence={persistenceReceipt?.sequence}
              data-studio-hybrid-dcc-persistence-source-hash={persistenceReceipt?.sourceHash}
              data-studio-hybrid-dcc-persistence-document-state-hash={
                persistenceReceipt?.documentStateHash ?? undefined
              }
            >
              {bt(persistenceCopy.label[0], persistenceCopy.label[1])}
            </span>
          ) : null}
          <button
            type="button"
            className={TOPBAR_BUTTON_CLASS}
            disabled={busy || ws.session.undoStack.length === 0}
            aria-label={bt("마지막 3D 편집 되돌리기", "Undo the last 3D edit")}
            title={bt("되돌리기", "Undo")}
            onClick={() => {
              void run("되돌리기", () => {
                const workspace = workspaceUndo(ws);
                return {
                  workspace,
                  selection: workspaceReconcileSelectionAfterHistory(
                    workspace,
                    componentSelection,
                  ),
                };
              });
            }}
          >
            <Undo2 size={15} aria-hidden="true" />
            <span className="max-lg:sr-only">{bt("되돌리기", "Undo")}</span>
          </button>
          <button
            type="button"
            className={TOPBAR_BUTTON_CLASS}
            disabled={busy || ws.session.redoStack.length === 0}
            aria-label={bt("되돌린 3D 편집 다시 실행", "Redo the undone 3D edit")}
            title={bt("다시 실행", "Redo")}
            onClick={() => {
              void run("다시 실행", () => {
                const workspace = workspaceRedo(ws);
                return {
                  workspace,
                  selection: workspaceReconcileSelectionAfterHistory(
                    workspace,
                    componentSelection,
                  ),
                };
              });
            }}
          >
            <Redo2 size={15} aria-hidden="true" />
            <span className="max-lg:sr-only">{bt("다시 실행", "Redo")}</span>
          </button>
          <button
            type="button"
            className={cn(TOPBAR_BUTTON_CLASS, introVisible && "border-accent/60 text-accent")}
            aria-expanded={introVisible}
            aria-controls={introVisible ? introId : undefined}
            data-studio-hybrid-dcc-guide-toggle="true"
            onClick={() => setIntroPreference(!introVisible)}
          >
            <CircleHelp size={15} aria-hidden="true" />
            {bt("사용법", "How to use")}
          </button>
        </div>
      </div>

      {webglSupported === false ? <StudioHybridDccEnvironmentNotice onRecheck={recheckWebgl} /> : null}

      {introVisible ? (
        <StudioHybridDccIntro
          id={introId}
          busy={busy}
          onStart={startFromIntro}
          onDismiss={() => setIntroPreference(false)}
        />
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept=".stl,.ply,.dae,.dxf,.off,.3mf,.bvh,.ifc,.obj,.glb,.gltf,.vrm,.fbx,.3dm,.step,.stp"
        className="sr-only"
        tabIndex={-1}
        aria-label={bt("가져올 3D 파일 선택", "Choose a 3D file to import")}
        data-studio-hybrid-dcc-import="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void run(`모델 가져오기 · ${file.name}`, async () => {
            const buf = new Uint8Array(await file.arrayBuffer());
            return workspaceImportBytes(ws, file.name, buf);
          });
        }}
      />

      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)] xl:grid-cols-[minmax(10.5rem,12.5rem)_minmax(0,1fr)_minmax(19rem,22rem)]">
        <div className="order-1 min-w-0 lg:col-start-1 xl:col-start-2 xl:row-start-1">
          <StudioHybridDccViewport
            workspace={ws}
            webglAvailable={webglSupported ?? undefined}
            componentSelection={componentSelection}
            editingDisabled={busy}
            onCommitAssetTransform={(assetId, transform) => {
              void run("오브젝트 변형", () => workspaceCommitObjectTransform(ws, assetId, transform));
            }}
            onComponentSelectionError={(message) => {
              setLog(`메시 요소 선택 실패 · ${message}`);
            }}
            onComponentSelectionModeChange={changeComponentSelectionMode}
            onClearComponentSelection={clearMeshComponentSelection}
            onDuplicateSelected={() => {
              if (!busy) void run("오브젝트 복제", () => workspaceDuplicateActive(ws));
            }}
            onDeleteSelected={() => {
              if (!busy) void run("오브젝트 삭제", () => workspaceDeleteActive(ws));
            }}
            onSelectAsset={selectWorkspaceAsset}
            onSelectComponent={selectMeshComponent}
            onSculptStroke={workbenchMode === "sculpt" && !busy
              ? (assetId, localPoint) => {
                  void run("브러시 조형", () => workspaceSculptActive(ws, {
                    kind: sculptBrushKind,
                    center: localPoint,
                    radius: 0.45,
                    strength: sculptDig ? -0.2 : 0.2,
                    ...(sculptBrushKind === "grab" || sculptBrushKind === "snakeHook"
                      ? { direction: { x: 0, y: 0.15, z: 0 } }
                      : {}),
                  }));
                }
              : undefined}
          />
        </div>

        <div className="order-2 min-w-0 space-y-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 xl:col-start-3">
          <section
            className="rounded-2xl border border-line bg-panel p-3"
            aria-labelledby="studio-dcc-quick-tools-title"
            data-studio-hybrid-dcc-quick-tools="true"
          >
            <h3 id="studio-dcc-quick-tools-title" className="text-sm font-semibold text-fg [word-break:keep-all]">
              {bt(modeGuide.title[0], modeGuide.title[1])}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
              {bt(modeGuide.description[0], modeGuide.description[1])}
            </p>
            {workbenchMode === "sculpt" ? (
              <div
                role="radiogroup"
                aria-label={bt("조형 브러시 종류", "Sculpt brush type")}
                className="mt-3 flex flex-wrap gap-1.5 rounded-xl border border-line/70 bg-canvas/35 p-2"
              >
                {(Object.keys(STUDIO_HYBRID_DCC_SCULPT_BRUSH_LABELS) as readonly StudioSculptBrushKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={sculptBrushKind === kind}
                    onClick={() => setSculptBrushKind(kind)}
                    className={cn(
                      "min-h-11 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:pointer-fine:min-h-9",
                      sculptBrushKind === kind
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                    )}
                  >
                    {bt(STUDIO_HYBRID_DCC_SCULPT_BRUSH_LABELS[kind][0], STUDIO_HYBRID_DCC_SCULPT_BRUSH_LABELS[kind][1])}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={sculptDig}
                  onClick={() => setSculptDig((current) => !current)}
                  className={cn(
                    "min-h-11 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:pointer-fine:min-h-9",
                    sculptDig
                      ? "border-warn bg-warn/10 text-warn"
                      : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  {sculptDig ? bt("깎기 켜짐", "Carve on") : bt("깎기 꺼짐", "Carve off")}
                </button>
              </div>
            ) : null}
            <StudioHybridDccToolTiles
              mode={workbenchMode}
              tools={quickTools}
              busy={busy}
              hasActiveAsset={hasActiveAsset}
            />
          </section>

          <aside
            className="min-w-0 rounded-2xl border border-line bg-panel p-3"
            aria-label={bt("선택 정보", "Selection details")}
            data-studio-hybrid-dcc-inspector="true"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
              <h3 className="text-xs font-semibold text-fg-2">{bt("선택 정보", "Selection")}</h3>
              <span className="rounded-md bg-raised px-1.5 py-0.5 text-[0.6875rem] text-fg-3">
                {modeLabel(workbenchMode)}
              </span>
            </div>
            {activeRecord ? (
              <div className="space-y-3 pt-3">
                <div>
                  <p className="truncate text-sm font-semibold text-fg">{activeRecord.assetId}</p>
                  <p className="mt-0.5 font-mono text-[0.6875rem] text-fg-3">
                    {activeRecord.meshHash.slice(0, 18)}…
                  </p>
                </div>
                <div
                  className="rounded-lg border border-accent/25 bg-accent-soft px-2.5 py-2 text-xs leading-relaxed text-fg-2"
                  data-studio-hybrid-dcc-component-selection-summary="true"
                >
                  <p className="font-semibold text-accent">
                    {componentSelection.mode === "object"
                      ? bt("오브젝트 편집", "Editing the object")
                      : formatI18nTemplate(
                        componentSelection.mode === "vertex"
                          ? bt("꼭짓점 {count}개 선택", "{count} vertices selected")
                          : componentSelection.mode === "edge"
                            ? bt("모서리 {count}개 선택", "{count} edges selected")
                            : bt("면 {count}개 선택", "{count} faces selected"),
                        { count: componentSelection.elementIds.length },
                      )}
                  </p>
                  <p className="mt-0.5 text-[0.6875rem] text-fg-3">
                    {componentSelection.mode === "object"
                      ? bt(
                        "위치·회전·크기를 바꾸거나 1·2·3 키로 점·선·면 편집을 시작하세요.",
                        "Move, rotate or scale it, or press 1, 2 or 3 to edit points, edges or faces.",
                      )
                      : bt(
                        "3D 화면에서 클릭해 선택합니다. Shift 추가 · Ctrl 전환 · Alt 빼기",
                        "Click in the 3D view to select. Shift adds · Ctrl toggles · Alt removes",
                      )}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-1.5 text-xs">
                  {([
                    [bt("꼭짓점", "Vertices"), activeRecord.mesh.vertices.length],
                    [bt("면", "Faces"), activeRecord.mesh.faces.length],
                    [bt("방향 모서리", "Half-edges"), activeRecord.mesh.halfEdges.length],
                    [bt("편집 버전", "Revision"), activeRecord.revision],
                  ] as const).map(([term, value]) => (
                    <div key={term} className="rounded-lg bg-raised p-2">
                      <dt className="text-[0.6875rem] text-fg-3">{term}</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-fg">{value}</dd>
                    </div>
                  ))}
                </dl>
                {activeTransform && componentSelection.mode === "object" ? (
                  <fieldset
                    key={`${activeRecord.assetId}:${ws.session.state.stateHash}`}
                    className="rounded-xl border border-line p-2.5"
                    disabled={busy}
                  >
                    <legend className="px-1 text-[0.6875rem] font-semibold text-fg-3">
                      {bt("위치 · 회전 · 크기", "Position · rotation · scale")}
                    </legend>
                    <p className="mb-2 text-[0.6875rem] leading-relaxed text-fg-3">
                      {bt(
                        "기즈모로 움직이거나 숫자를 입력하세요. Enter나 다른 칸으로 옮기면 되돌리기 한 번으로 저장됩니다.",
                        "Drag the gizmo or type a number. Enter or moving focus saves it as one undo step.",
                      )}
                    </p>
                    {([
                      { key: "position", label: "위치", unit: "m", step: 0.1 },
                      { key: "rotationEulerRad", label: "회전", unit: "°", step: 1 },
                      { key: "scale", label: "크기", unit: "×", step: 0.1 },
                    ] as const).map((row) => (
                      <div key={row.key} className="mb-2 last:mb-0">
                        <div className="mb-1 flex items-center justify-between text-[0.6875rem] text-fg-3">
                          <span>{row.label}</span><span>{row.unit}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {(["X", "Y", "Z"] as const).map((axisLabel, axis) => {
                            const stored = activeTransform[row.key][axis]!;
                            const shown = row.key === "rotationEulerRad"
                              ? stored * 180 / Math.PI
                              : stored;
                            return (
                              <label key={axisLabel} className="relative">
                                <span className={cn(
                                  "absolute left-2 top-1/2 -translate-y-1/2 text-[0.625rem] font-bold",
                                  axisLabel === "X" ? "text-bad" : axisLabel === "Y" ? "text-good" : "text-accent",
                                )}>
                                  {axisLabel}
                                </span>
                                <input
                                  aria-label={`${row.label} ${axisLabel}`}
                                  type="number"
                                  step={row.step}
                                  defaultValue={Number(shown.toFixed(4))}
                                  className="min-h-11 w-full rounded-md border border-line bg-canvas pl-6 pr-1 text-right font-mono text-xs tabular-nums text-fg focus:border-accent focus:outline-none"
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") event.currentTarget.blur();
                                  }}
                                  onBlur={(event) => commitTransformComponent(
                                    row.key,
                                    axis as 0 | 1 | 2,
                                    event.currentTarget.value,
                                  )}
                                />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </fieldset>
                ) : null}
                <div className="rounded-lg border border-line p-2 text-xs leading-relaxed text-fg-2">
                  <p>{bt("권리", "Rights")}: {activeRights ? `${activeRights.license} · ${activeRights.creator}` : bt("미확인", "Unverified")}</p>
                  <p>UV: {ws.lastUvMap?.mode ?? bt("미생성", "None yet")}</p>
                  <p>
                    {bt("화면용 메시", "Display mesh")}: {activeRecord.renderCache
                      ? bt("비파괴 결과 표시 중", "Showing the non-destructive result")
                      : bt("원본 직접 표시", "Showing the original")}
                  </p>
                </div>
              </div>
            ) : (
              <p className="py-6 text-center text-xs leading-relaxed text-fg-3 [word-break:keep-all]">
                {bt(
                  "3D 화면이나 장면 목록에서 오브젝트를 고르면 크기·위치와 메시 정보를 보여 줍니다.",
                  "Pick an object in the 3D view or the scene list to see its size, position and mesh details.",
                )}
              </p>
            )}
          </aside>
        </div>

        <aside
          className="order-3 min-w-0 rounded-2xl border border-line bg-panel p-2 lg:col-start-1 lg:row-start-2 xl:col-start-1 xl:row-start-1"
          aria-label={bt("장면 오브젝트 목록", "Scene object list")}
          data-studio-hybrid-dcc-outliner="true"
        >
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <h3 className="text-xs font-semibold text-fg-2">{bt("장면 오브젝트", "Scene objects")}</h3>
            <span className="text-[0.6875rem] tabular-nums text-fg-3">{authorityRecords.length}</span>
          </div>
          <div className="space-y-1 xl:max-h-[31rem] xl:overflow-y-auto">
            {authorityRecords.length > 0 ? authorityRecords.map((record, recordIndex) => {
              const selected = record.assetId === ws.activeAssetId;
              const sharedObject = ws.bridge.set.objects.find(({ id }) => id === record.assetId);
              const visible = sharedObject?.visible !== false;
              return (
                <div
                  key={record.assetId}
                  className={selected
                    ? "flex min-h-11 w-full items-stretch rounded-lg border border-accent/45 bg-accent-soft text-accent"
                    : "flex min-h-11 w-full items-stretch rounded-lg border border-transparent text-fg-2 hover:border-line hover:bg-raised hover:text-fg"}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    disabled={busy}
                    className="min-h-11 min-w-0 flex-1 px-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => selectWorkspaceAsset(record.assetId)}
                  >
                    <span className="block truncate text-xs font-medium">
                      {friendlyHybridDccAssetName(bt, record.assetId, recordIndex)}
                    </span>
                    <span className="block truncate text-[0.6875rem] opacity-75">
                      {record.assetId} · {bt("버전", "rev")} {record.revision}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`${record.assetId} ${visible ? bt("숨기기", "hide") : bt("보이기", "show")}`}
                    title={visible
                      ? bt("뷰포트에서 잠시 숨기기", "Hide in the viewport for now")
                      : bt("뷰포트에 다시 보이기", "Show in the viewport again")}
                    className="min-h-11 min-w-14 shrink-0 border-l border-current/15 px-2 text-[0.6875rem] font-semibold opacity-80 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35"
                    onClick={() => {
                      try {
                        setWs(workspaceSetAssetVisibility(ws, record.assetId, !visible));
                        setLog(`${record.assetId} ${visible ? "숨김" : "표시"} · 원본은 그대로 보존됩니다.`);
                      } catch (error) {
                        setLog(`표시 상태 변경 실패 · ${error instanceof Error ? error.message : String(error)}`);
                      }
                    }}
                  >
                    {visible ? bt("표시 중", "Shown") : bt("숨김", "Hidden")}
                  </button>
                </div>
              );
            }) : (
              <p className="rounded-lg border border-dashed border-line px-3 py-5 text-center text-xs leading-relaxed text-fg-3 [word-break:keep-all]">
                {bt(
                  "큐브나 세트를 만들면 편집할 수 있는 오브젝트가 여기에 나옵니다.",
                  "Objects you create appear here, ready to edit.",
                )}
              </p>
            )}
          </div>
        </aside>
      </div>

      {activeRecord ? (
        <StudioHybridDccModifierInspector
          stack={modifierStackView}
          busy={busy}
          error={modifierError}
          onAdd={(kind) => runModifier(
            `${kind} 변형 추가`,
            () => workspaceAddActiveModifier(ws, kind),
          )}
          onToggle={(modifierId) => runModifier(
            "변형 켜기·끄기",
            () => workspaceToggleActiveModifier(ws, modifierId),
          )}
          onMove={(modifierId, direction) => runModifier(
            "변형 순서 변경",
            () => workspaceMoveActiveModifier(ws, modifierId, direction),
          )}
          onRemove={(modifierId) => runModifier(
            "변형 삭제",
            () => workspaceRemoveActiveModifier(ws, modifierId),
          )}
          onPatch={(modifierId, patch) => runModifier(
            "변형 값 변경",
            () => workspacePatchActiveModifier(ws, modifierId, patch),
          )}
          onApply={() => runModifier(
            "변형을 원본 메시로 확정",
            () => workspaceApplyActiveModifierStack(ws),
          )}
        />
      ) : null}

      <StudioHybridDccExpertTools groups={expertToolGroups} busy={busy} hasActiveAsset={hasActiveAsset} />

      <footer className="sticky bottom-0 z-10 min-w-0 rounded-xl border border-line bg-panel/95 px-3 py-2 shadow-lg backdrop-blur [overflow-wrap:anywhere]">
        <p className="min-w-0 break-words text-xs text-fg [overflow-wrap:anywhere]" data-studio-hybrid-dcc-log="true" aria-live="polite">
          {busy ? bt("작업 처리 중… ", "Working… ") : ""}{log}
        </p>
        <p
          className="mt-1 min-w-0 break-words text-[0.6875rem] text-fg-3 [overflow-wrap:anywhere]"
          data-studio-hybrid-dcc-stats="true"
          data-studio-hybrid-dcc-state-hash={ws.session.state.stateHash}
          data-assets={Object.keys(ws.session.state.geometry.records).length}
          data-active={ws.activeAssetId ?? "none"}
          data-shots={ws.bridge.shots.length}
          data-ink={ws.bridge.artistCorrections.deltas.length}
          data-uv={ws.lastUvMap?.mode ?? ""}
          data-collab={ws.collab.peers.length}
          data-cloth-step={ws.clothStep}
          data-bom={ws.bom.lines.length}
          data-occt-tris={ws.lastOcct?.triangleCount ?? 0}
          data-occt-path={ws.lastOcct?.loadPath ?? ""}
          data-occt-op={ws.lastOcct?.operation ?? ""}
          data-dynatopo-faces={ws.lastDynatopo?.facesAfter ?? 0}
          data-retopo-faces={ws.lastRetopo?.facesAfter ?? 0}
        >
          {bt("상태 점검", "Health")} · {bt("오류", "errors")} {diag.errorCount} · {bt("경고", "warnings")} {diag.warningCount} · {bt("선택", "selected")} {ws.activeAssetId ?? bt("없음", "none")} · {bt("오브젝트", "objects")} {authorityRecords.length} · {bt("컷", "shots")} {ws.bridge.shots.length}
        </p>
      </footer>
    </section>
  );
}
