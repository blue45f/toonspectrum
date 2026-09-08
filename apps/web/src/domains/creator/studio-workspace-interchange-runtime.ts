import {
  decodeStudioWorkspaceInterchange,
  encodeStudioWorkspaceInterchange,
  planStudioWorkspaceInterchangeImport,
  type StudioWorkspaceInterchangeDocument,
  type StudioWorkspaceInterchangeEncodeResult,
  type StudioWorkspaceInterchangeExportOptions,
  type StudioWorkspaceInterchangeImportPlan,
  type StudioWorkspaceInterchangePlanOptions,
  type StudioWorkspaceInterchangePlanResult,
  type StudioWorkspaceInterchangePresentation,
  type StudioWorkspaceInterchangeScope,
  type StudioWorkspaceInterchangeTargetState,
  type StudioWorkspaceInterchangeWorkspace,
} from "./studio-workspace-interchange";
import {
  DEFAULT_STUDIO_COMMAND_BAR,
  STUDIO_DEFAULT_WORKSPACE_IDS,
  STUDIO_WORKSPACE_MAX_CUSTOM,
  isStudioWorkspaceDirty,
  normalizeStudioWorkspaceLayout,
  normalizeStudioWorkspaceState,
  resolveStudioWorkspace,
  updateStudioWorkspaceLiveLayout,
  type StudioWorkspaceLayout,
  type StudioWorkspaceState,
} from "./studio-workspaces";

/** Virtual selection key used by the export UI for the layout currently on screen. */
export const STUDIO_WORKSPACE_CURRENT_EXPORT_KEY = "@current" as const;

export interface StudioWorkspaceInterchangeExportCandidate {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly source: "current" | "saved";
  readonly dirty: boolean;
}

export interface StudioWorkspaceInterchangeRuntimePlanOptions {
  readonly action?: StudioWorkspaceInterchangePlanOptions["action"];
  readonly scopes?: readonly StudioWorkspaceInterchangeScope[];
  readonly applyWorkspaceId?: string;
}

const DEFAULT_WORKSPACE_ID_SET = new Set<string>(STUDIO_DEFAULT_WORKSPACE_IDS);
const PORTABLE_ID_MAX_LENGTH = 80;
const PORTABLE_NAME_MAX_CODE_POINTS = 48;

function freezePresentation(
  layout: StudioWorkspaceLayout,
): StudioWorkspaceInterchangePresentation {
  return Object.freeze({
    panels: Object.freeze({
      inspector: Object.freeze({ ...layout.inspector }),
      desktop: Object.freeze({ ...layout.desktop }),
    }),
    drawingPalettes: layout.drawingPalettes,
    quickActions: layout.quickActions,
    commandBar: layout.commandBar ?? DEFAULT_STUDIO_COMMAND_BAR,
  });
}

/** Converts a canonical Studio layout into the presentation-only interchange allowlist. */
export function studioWorkspaceLayoutToInterchangePresentation(
  layout: StudioWorkspaceLayout,
): StudioWorkspaceInterchangePresentation {
  return freezePresentation(normalizeStudioWorkspaceLayout(layout));
}

/** Lists the live snapshot and every saved custom workspace in stable UI order. */
export function listStudioWorkspaceInterchangeExportCandidates(
  state: StudioWorkspaceState,
  liveLayout: StudioWorkspaceLayout,
): readonly StudioWorkspaceInterchangeExportCandidate[] {
  const synced = updateStudioWorkspaceLiveLayout(state, liveLayout);
  const active = resolveStudioWorkspace(synced, synced.activeWorkspaceId);
  const dirty = active ? isStudioWorkspaceDirty(synced) : false;

  return Object.freeze([
    Object.freeze({
      key: STUDIO_WORKSPACE_CURRENT_EXPORT_KEY,
      name: active?.name ?? "현재 작업공간",
      description: dirty
        ? "현재 화면의 저장 전 배치까지 포함"
        : "현재 화면에 적용된 배치",
      source: "current" as const,
      dirty,
    }),
    ...synced.customWorkspaces.map((workspace) =>
      Object.freeze({
        key: workspace.id,
        name: workspace.name,
        description:
          workspace.id === synced.activeWorkspaceId
            ? "저장된 버전 · 현재 작업공간"
            : "저장된 내 작업공간",
        source: "saved" as const,
        dirty: false,
      }),
    ),
  ]);
}

function codePointSlice(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join("");
}

function normalizedNameKey(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

function uniquePortableName(name: string, occupied: Set<string>, suffix = ""): string {
  const normalizedBase = name.trim().replace(/\s+/gu, " ") || "작업공간";
  for (let sequence = 0; sequence <= STUDIO_WORKSPACE_MAX_CUSTOM + 1; sequence += 1) {
    const marker = sequence === 0 ? suffix : `${suffix || ""} ${sequence + 1}`;
    const maximumBase = PORTABLE_NAME_MAX_CODE_POINTS - Array.from(marker).length;
    const candidate = `${codePointSlice(normalizedBase, maximumBase).trim()}${marker}`.trim();
    const key = normalizedNameKey(candidate);
    if (candidate && !occupied.has(key)) {
      occupied.add(key);
      return candidate;
    }
  }
  throw new RangeError("Unable to create a unique portable workspace name.");
}

function uniquePortableId(baseId: string, occupied: Set<string>): string {
  const normalizedBase = codePointSlice(
    baseId.replace(/[^A-Za-z0-9._~-]/gu, "-").replace(/^-+/u, "") || "workspace",
    PORTABLE_ID_MAX_LENGTH,
  );
  for (let sequence = 0; sequence <= STUDIO_WORKSPACE_MAX_CUSTOM + 1; sequence += 1) {
    const suffix = sequence === 0 ? "" : `-${sequence + 1}`;
    const candidate = `${codePointSlice(
      normalizedBase,
      PORTABLE_ID_MAX_LENGTH - suffix.length,
    )}${suffix}`;
    if (!occupied.has(candidate) && !DEFAULT_WORKSPACE_ID_SET.has(candidate)) {
      occupied.add(candidate);
      return candidate;
    }
  }
  throw new RangeError("Unable to create a unique portable workspace id.");
}

function selectedExportWorkspaces(
  state: StudioWorkspaceState,
  liveLayout: StudioWorkspaceLayout,
  selectedKeys: readonly string[],
): readonly StudioWorkspaceInterchangeWorkspace[] {
  const synced = updateStudioWorkspaceLiveLayout(state, liveLayout);
  const selected = new Set(selectedKeys);
  const candidates = listStudioWorkspaceInterchangeExportCandidates(synced, synced.liveLayout);
  const selectedCandidates = candidates.filter((candidate) => selected.has(candidate.key));
  if (
    selectedCandidates.length === 0 ||
    selectedCandidates.length > STUDIO_WORKSPACE_MAX_CUSTOM
  ) {
    return Object.freeze([]);
  }

  const occupiedIds = new Set<string>();
  const occupiedNames = new Set<string>();
  const workspaces: StudioWorkspaceInterchangeWorkspace[] = [];

  for (const candidate of selectedCandidates) {
    if (candidate.key === STUDIO_WORKSPACE_CURRENT_EXPORT_KEY) {
      const active = resolveStudioWorkspace(synced, synced.activeWorkspaceId);
      workspaces.push(
        Object.freeze({
          id: uniquePortableId(`current-${synced.activeWorkspaceId}`, occupiedIds),
          name: uniquePortableName(
            active?.name ?? "현재 작업공간",
            occupiedNames,
            " · 현재",
          ),
          presentation: freezePresentation(synced.liveLayout),
        }),
      );
      continue;
    }

    const workspace = synced.customWorkspaces.find(({ id }) => id === candidate.key);
    if (!workspace) continue;
    workspaces.push(
      Object.freeze({
        id: uniquePortableId(workspace.id, occupiedIds),
        name: uniquePortableName(workspace.name, occupiedNames),
        presentation: freezePresentation(workspace.layout),
      }),
    );
  }

  return Object.freeze(workspaces);
}

/** Encodes a user-selected subset without ever including project or account data. */
export function encodeStudioWorkspaceInterchangeSelection(
  state: StudioWorkspaceState,
  liveLayout: StudioWorkspaceLayout,
  selectedKeys: readonly string[],
  options?: StudioWorkspaceInterchangeExportOptions,
): StudioWorkspaceInterchangeEncodeResult {
  return encodeStudioWorkspaceInterchange(
    selectedExportWorkspaces(state, liveLayout, selectedKeys),
    options,
  );
}

/** Builds the current custom-workspace catalog expected by the pure import planner. */
export function createStudioWorkspaceInterchangeTargetState(
  state: StudioWorkspaceState,
  liveLayout: StudioWorkspaceLayout,
): StudioWorkspaceInterchangeTargetState {
  const synced = updateStudioWorkspaceLiveLayout(state, liveLayout);
  const occupiedNames = new Set<string>();
  return Object.freeze({
    activeWorkspaceId: synced.activeWorkspaceId,
    livePresentation: freezePresentation(synced.liveLayout),
    workspaces: Object.freeze(
      synced.customWorkspaces.map((workspace) =>
        Object.freeze({
          id: workspace.id,
          // The durable catalog historically allows duplicate display names while the portable
          // planner deliberately does not. Give only the planner a stable unique alias; unchanged
          // and replaced entries recover their original display name during commit below.
          name: uniquePortableName(workspace.name, occupiedNames),
          presentation: freezePresentation(workspace.layout),
        }),
      ),
    ),
  });
}

function remapReservedImportIds(
  document: StudioWorkspaceInterchangeDocument,
): Readonly<{
  document: StudioWorkspaceInterchangeDocument;
  sourceIdMap: ReadonlyMap<string, string>;
}> {
  const occupied = new Set(
    document.workspaces
      .filter(({ id }) => !DEFAULT_WORKSPACE_ID_SET.has(id))
      .map(({ id }) => id),
  );
  const sourceIdMap = new Map<string, string>();
  const workspaces = document.workspaces.map((workspace) => {
    // Quick Access sets have a separate owner-scoped repository and cannot be truthfully attached
    // to one saved workspace yet. Strip that optional future field from the reviewed plan instead
    // of pretending it was committed; radial quick actions and the command bar remain supported.
    const presentation = Object.freeze({
      panels: workspace.presentation.panels,
      ...(workspace.presentation.drawingPalettes
        ? { drawingPalettes: workspace.presentation.drawingPalettes }
        : {}),
      ...(workspace.presentation.quickActions !== undefined
        ? { quickActions: workspace.presentation.quickActions }
        : {}),
      ...(workspace.presentation.commandBar !== undefined
        ? { commandBar: workspace.presentation.commandBar }
        : {}),
    });
    if (!DEFAULT_WORKSPACE_ID_SET.has(workspace.id)) {
      return Object.freeze({ ...workspace, presentation });
    }
    const remappedId = uniquePortableId(`imported-${workspace.id}`, occupied);
    sourceIdMap.set(workspace.id, remappedId);
    return Object.freeze({ ...workspace, id: remappedId, presentation });
  });
  return Object.freeze({
    document: Object.freeze({ ...document, workspaces: Object.freeze(workspaces) }),
    sourceIdMap,
  });
}

/**
 * Decodes, normalizes reserved IDs, and produces a deterministic, non-mutating import plan.
 * Conflict IDs remain stable between preview and commit so the review screen is truthful.
 */
export function planStudioWorkspaceInterchangeForState(
  state: StudioWorkspaceState,
  liveLayout: StudioWorkspaceLayout,
  rawImport: unknown,
  options: StudioWorkspaceInterchangeRuntimePlanOptions = {},
): StudioWorkspaceInterchangePlanResult {
  const decoded = decodeStudioWorkspaceInterchange(rawImport);
  if (!decoded.ok) return decoded;
  const remapped = remapReservedImportIds(decoded.document);
  let sequence = 0;
  const applyWorkspaceId = options.applyWorkspaceId
    ? remapped.sourceIdMap.get(options.applyWorkspaceId) ?? options.applyWorkspaceId
    : undefined;

  return planStudioWorkspaceInterchangeImport(
    createStudioWorkspaceInterchangeTargetState(state, liveLayout),
    remapped.document,
    {
      action: options.action,
      scopes: options.scopes,
      createConflictId: () => {
        sequence += 1;
        return `imported-workspace-${sequence}`;
      },
      ...(applyWorkspaceId ? { applyWorkspaceId } : {}),
    },
  );
}

function layoutFromPresentation(
  presentation: StudioWorkspaceInterchangePresentation,
  baseLayout: StudioWorkspaceLayout,
  preserveDeviceOverrides: boolean,
): StudioWorkspaceLayout {
  return normalizeStudioWorkspaceLayout(
    {
      ...baseLayout,
      inspector: presentation.panels.inspector,
      desktop: presentation.panels.desktop,
      drawingPalettes: presentation.drawingPalettes ?? baseLayout.drawingPalettes,
      quickActions: presentation.quickActions ?? baseLayout.quickActions,
      commandBar:
        presentation.commandBar ?? baseLayout.commandBar ?? DEFAULT_STUDIO_COMMAND_BAR,
      deviceOverrides: preserveDeviceOverrides ? baseLayout.deviceOverrides : {},
    },
    baseLayout,
  );
}

/** Applies an already-reviewed plan while preserving local-only device overrides on replacements. */
export function applyStudioWorkspaceInterchangePlanToState(
  state: StudioWorkspaceState,
  liveLayout: StudioWorkspaceLayout,
  plan: StudioWorkspaceInterchangeImportPlan,
): StudioWorkspaceState {
  const synced = updateStudioWorkspaceLiveLayout(state, liveLayout);
  const existingById = new Map(
    synced.customWorkspaces.map((workspace) => [workspace.id, workspace] as const),
  );
  const changedTargetIds = new Set(
    plan.operations.map((operation) => operation.targetWorkspaceId),
  );
  const replacedTargetIds = new Set(
    plan.operations
      .filter((operation) => operation.kind === "replace")
      .map((operation) => operation.targetWorkspaceId),
  );

  const customWorkspaces = plan.nextState.workspaces.map((portableWorkspace) => {
    const existing = existingById.get(portableWorkspace.id);
    if (existing && !changedTargetIds.has(portableWorkspace.id)) return existing;
    const baseLayout = existing?.layout ?? synced.liveLayout;
    return Object.freeze({
      id: portableWorkspace.id,
      name:
        existing && replacedTargetIds.has(portableWorkspace.id)
          ? existing.name
          : portableWorkspace.name,
      layout: layoutFromPresentation(
        portableWorkspace.presentation,
        baseLayout,
        existing !== undefined,
      ),
    });
  });

  const appliedWorkspace =
    plan.action === "add-and-apply"
      ? customWorkspaces.find(
          (workspace) => workspace.id === plan.nextState.activeWorkspaceId,
        )
      : undefined;
  const normalized = normalizeStudioWorkspaceState({
    ...synced,
    activeWorkspaceId: plan.nextState.activeWorkspaceId,
    liveLayout: appliedWorkspace?.layout ?? synced.liveLayout,
    customWorkspaces,
  });

  const normalizedIds = new Set(
    normalized.customWorkspaces.map((workspace) => workspace.id),
  );
  if (
    normalized.customWorkspaces.length !== customWorkspaces.length ||
    customWorkspaces.some((workspace) => !normalizedIds.has(workspace.id)) ||
    normalized.activeWorkspaceId !== plan.nextState.activeWorkspaceId
  ) {
    throw new RangeError("Imported workspace state exceeds the durable workspace boundary.");
  }
  return normalized;
}
