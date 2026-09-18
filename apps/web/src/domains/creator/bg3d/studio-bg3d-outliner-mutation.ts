import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";
import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import type { StudioBg3dOutlinerItem } from "./studio-bg3d-scene-outliner-controller";

export interface StudioBg3dOutlinerSceneSnapshot {
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  readonly document: StudioBg3dSceneDocument;
}

export interface StudioBg3dOutlinerRemovalSuccess {
  readonly ok: true;
  readonly snapshot: {
    readonly primitives: BgPrimitive[];
    readonly customModels: BgCustomModelInstance[];
    readonly document: StudioBg3dSceneDocument;
  };
}

export interface StudioBg3dOutlinerRemovalFailure {
  readonly ok: false;
  readonly reason: string;
}
export type StudioBg3dOutlinerRemovalPlan =
  | StudioBg3dOutlinerRemovalSuccess
  | StudioBg3dOutlinerRemovalFailure;

export interface StudioBg3dOutlinerMutationDependencies {
  readonly duplicatePrimitive: (source: BgPrimitive) => BgPrimitive;
  readonly duplicateModel: (source: BgCustomModelInstance) => BgCustomModelInstance;
  readonly planRemoval: (input: {
    readonly snapshot: StudioBg3dOutlinerSceneSnapshot;
    readonly entityIds: ReadonlySet<string>;
  }) => StudioBg3dOutlinerRemovalPlan;
}

export type StudioBg3dOutlinerMutationAction =
  | {
      readonly type: "rename";
      readonly item: StudioBg3dOutlinerItem;
      readonly name: string;
    }
  | { readonly type: "toggle-visibility"; readonly item: StudioBg3dOutlinerItem }
  | { readonly type: "toggle-lock"; readonly item: StudioBg3dOutlinerItem }
  | { readonly type: "duplicate"; readonly item: StudioBg3dOutlinerItem }
  | { readonly type: "remove"; readonly item: StudioBg3dOutlinerItem };
export type StudioBg3dOutlinerSelectionEffect =
  | { readonly type: "preserve" }
  | { readonly type: "replace"; readonly ids: ReadonlySet<string> }
  | { readonly type: "remove"; readonly ids: ReadonlySet<string> };

export interface StudioBg3dOutlinerMutationCommand {
  readonly id: string;
  readonly label: string;
  readonly source: "menu";
}

export interface StudioBg3dOutlinerMutationSuccess {
  readonly ok: true;
  readonly snapshot: {
    readonly primitives: BgPrimitive[];
    readonly customModels: BgCustomModelInstance[];
    readonly document: StudioBg3dSceneDocument;
  };
  readonly command: StudioBg3dOutlinerMutationCommand;
  readonly selection: StudioBg3dOutlinerSelectionEffect;
}

export interface StudioBg3dOutlinerMutationFailure {
  readonly ok: false;
  readonly reason: "entity-not-found" | "unchanged" | "remove-failed";
}
export type StudioBg3dOutlinerMutationPlan =
  | StudioBg3dOutlinerMutationSuccess
  | StudioBg3dOutlinerMutationFailure;

function command(
  id: string,
  label: string,
): StudioBg3dOutlinerMutationCommand {
  return Object.freeze({ id, label, source: "menu" });
}

function successfulMutation(
  snapshot: StudioBg3dOutlinerMutationSuccess["snapshot"],
  mutationCommand: StudioBg3dOutlinerMutationCommand,
  selection: StudioBg3dOutlinerSelectionEffect,
): StudioBg3dOutlinerMutationSuccess {
  return Object.freeze({
    ok: true,
    snapshot,
    command: mutationCommand,
    selection,
  });
}

function failure(
  reason: StudioBg3dOutlinerMutationFailure["reason"],
): StudioBg3dOutlinerMutationFailure {
  return Object.freeze({ ok: false, reason });
}
function isVisible(entity: BgPrimitive | BgCustomModelInstance): boolean {
  return entity.visible !== false;
}

function isLocked(entity: BgPrimitive | BgCustomModelInstance): boolean {
  return entity.locked === true;
}

function primitiveFor(
  snapshot: StudioBg3dOutlinerSceneSnapshot,
  item: StudioBg3dOutlinerItem,
): BgPrimitive | null {
  if (item.kind !== "primitive") return null;
  return snapshot.primitives.find((entry) => entry.id === item.id) ?? null;
}

function modelFor(
  snapshot: StudioBg3dOutlinerSceneSnapshot,
  item: StudioBg3dOutlinerItem,
): BgCustomModelInstance | null {
  if (item.kind !== "model") return null;
  return snapshot.customModels.find((entry) => entry.id === item.id) ?? null;
}

function preserveSelection(): StudioBg3dOutlinerSelectionEffect {
  return Object.freeze({ type: "preserve" });
}
function planRename(
  snapshot: StudioBg3dOutlinerSceneSnapshot,
  action: Extract<StudioBg3dOutlinerMutationAction, { readonly type: "rename" }>,
): StudioBg3dOutlinerMutationPlan {
  const trimmed = action.name.trim();
  const nextName = trimmed.length > 0 ? trimmed : undefined;
  if (action.item.kind === "primitive") {
    const source = primitiveFor(snapshot, action.item);
    if (!source) return failure("entity-not-found");
    const currentName = source.name?.trim() || undefined;
    if (currentName === nextName || (!currentName && trimmed === action.item.label.trim())) {
      return failure("unchanged");
    }
    const primitives = snapshot.primitives.map((entry) =>
      entry.id === source.id ? { ...entry, name: nextName } : entry,
    );
    return successfulMutation(
      { primitives, customModels: [...snapshot.customModels], document: snapshot.document },
      command("bg3d.outliner.rename", `Rename ${action.item.label}`),
      preserveSelection(),
    );
  }

  const source = modelFor(snapshot, action.item);
  if (!source) return failure("entity-not-found");
  const currentName = source.name?.trim() || undefined;
  if (currentName === nextName || (!currentName && trimmed === action.item.label.trim())) {
    return failure("unchanged");
  }
  const customModels = snapshot.customModels.map((entry) =>
    entry.id === source.id ? { ...entry, name: nextName } : entry,
  );
  return successfulMutation(
    { primitives: [...snapshot.primitives], customModels, document: snapshot.document },
    command("bg3d.outliner.rename", `Rename ${action.item.label}`),
    preserveSelection(),
  );
}

function planToggle(
  snapshot: StudioBg3dOutlinerSceneSnapshot,
  action: Extract<StudioBg3dOutlinerMutationAction, {
    readonly type: "toggle-visibility" | "toggle-lock";
  }>,
): StudioBg3dOutlinerMutationPlan {
  const key = action.type === "toggle-visibility" ? "visible" : "locked";
  if (action.item.kind === "primitive") {
    const source = primitiveFor(snapshot, action.item);
    if (!source) return failure("entity-not-found");
    const nextValue = key === "visible" ? !isVisible(source) : !isLocked(source);
    const primitives = snapshot.primitives.map((entry) =>
      entry.id === source.id ? { ...entry, [key]: nextValue } : entry,
    );
    return successfulMutation(
      { primitives, customModels: [...snapshot.customModels], document: snapshot.document },
      command(`bg3d.outliner.${action.type}`, `${action.type} ${action.item.label}`),
      preserveSelection(),
    );
  }

  const source = modelFor(snapshot, action.item);
  if (!source) return failure("entity-not-found");
  const nextValue = key === "visible" ? !isVisible(source) : !isLocked(source);
  const customModels = snapshot.customModels.map((entry) =>
    entry.id === source.id ? { ...entry, [key]: nextValue } : entry,
  );
  return successfulMutation(
    { primitives: [...snapshot.primitives], customModels, document: snapshot.document },
    command(`bg3d.outliner.${action.type}`, `${action.type} ${action.item.label}`),
    preserveSelection(),
  );
}

function planDuplicate(
  snapshot: StudioBg3dOutlinerSceneSnapshot,
  item: StudioBg3dOutlinerItem,
  dependencies: StudioBg3dOutlinerMutationDependencies,
): StudioBg3dOutlinerMutationPlan {
  if (item.kind === "primitive") {
    const source = primitiveFor(snapshot, item);
    if (!source) return failure("entity-not-found");
    const clone = dependencies.duplicatePrimitive(source);
    return successfulMutation(
      {
        primitives: [...snapshot.primitives, clone],
        customModels: [...snapshot.customModels],
        document: snapshot.document,
      },
      command("bg3d.outliner.duplicate", `Duplicate ${item.label}`),
      Object.freeze({ type: "replace", ids: new Set([clone.id]) }),
    );
  }

  const source = modelFor(snapshot, item);
  if (!source) return failure("entity-not-found");
  const clone = dependencies.duplicateModel(source);
  return successfulMutation(
    {
      primitives: [...snapshot.primitives],
      customModels: [...snapshot.customModels, clone],
      document: snapshot.document,
    },
    command("bg3d.outliner.duplicate", `Duplicate ${item.label}`),
    Object.freeze({ type: "replace", ids: new Set([clone.id]) }),
  );
}

function planRemove(
  snapshot: StudioBg3dOutlinerSceneSnapshot,
  item: StudioBg3dOutlinerItem,
  dependencies: StudioBg3dOutlinerMutationDependencies,
): StudioBg3dOutlinerMutationPlan {
  const exists = item.kind === "primitive"
    ? primitiveFor(snapshot, item) !== null
    : modelFor(snapshot, item) !== null;
  if (!exists) return failure("entity-not-found");
  const removal = dependencies.planRemoval({
    snapshot,
    entityIds: new Set([item.id]),
  });
  if (!removal.ok) return failure("remove-failed");
  return successfulMutation(
    removal.snapshot,
    command("bg3d.outliner.remove", `Remove ${item.label}`),
    Object.freeze({ type: "remove", ids: new Set([item.id]) }),
  );
}

export function planStudioBg3dOutlinerMutation(input: {
  readonly snapshot: StudioBg3dOutlinerSceneSnapshot;
  readonly action: StudioBg3dOutlinerMutationAction;
  readonly dependencies: StudioBg3dOutlinerMutationDependencies;
}): StudioBg3dOutlinerMutationPlan {
  switch (input.action.type) {
    case "rename":
      return planRename(input.snapshot, input.action);
    case "toggle-visibility":
    case "toggle-lock":
      return planToggle(input.snapshot, input.action);
    case "duplicate":
      return planDuplicate(input.snapshot, input.action.item, input.dependencies);
    case "remove":
      return planRemove(input.snapshot, input.action.item, input.dependencies);
  }
}

export function applyStudioBg3dOutlinerSelectionEffect(
  current: ReadonlySet<string>,
  effect: StudioBg3dOutlinerSelectionEffect,
): Set<string> {
  if (effect.type === "preserve") return new Set(current);
  if (effect.type === "replace") return new Set(effect.ids);
  const next = new Set(current);
  for (const id of effect.ids) next.delete(id);
  return next;
}
