import {
  validateCharacterDocumentV3,
  type CharacterDeformationLayerV3,
  type CharacterDocumentV3,
  type CharacterMaterialOverrideV3,
  type CharacterSemanticOutputRecipeV3,
} from "../document/character-document-v3";

import {
  markCharacterGroomTopology,
  type CharacterGroomDocument,
} from "../groom/character-groom-document";
import type { CharacterLinkedLayerDocument } from "../linked-layer/character-linked-layer";
import type { CharacterPoseDocumentV3 } from "../pose-v3/character-pose-v3";
import {
  markCharacterSurfaceInkTopology,
  type CharacterSurfaceInkDocument,
} from "../surface-ink/character-surface-ink";
import {
  markCharacterGeometryStrokeTopology,
  type CharacterGeometryStrokeDocument,
} from "../surface-ink/character-geometry-stroke";
import type {
  CharacterCameraShotV2,
  CharacterRecipeSlotKindV2,
  CharacterSlotSelectionV2,
} from "../document/character-document-v2";

export type CharacterAuthoringCommandSource =
  | "user"
  | "ai-recommendation"
  | "photo-pose"
  | "webcam"
  | "worker"
  | "migration"
  | "system";

export type CharacterAuthoringOperation =
  | {
      readonly kind: "sync-compatibility-projection";
      readonly projection: CharacterDocumentV3;
      readonly sourceFingerprint: string;
    }
  | {
      readonly kind: "set-slot";
      readonly slot: CharacterRecipeSlotKindV2;
      readonly selection: CharacterSlotSelectionV2 | null;
    }
  | {
      readonly kind: "set-accessories";
      readonly selections: readonly CharacterSlotSelectionV2[];
    }
  | {
      readonly kind: "set-hand-pose";
      readonly side: "left" | "right";
      readonly selection: CharacterSlotSelectionV2 | null;
    }
  | {
      readonly kind: "set-color";
      readonly target: string;
      readonly color: string | null;
    }
  | {
      readonly kind: "upsert-deformation-layer";
      readonly layer: CharacterDeformationLayerV3;
    }
  | {
      readonly kind: "remove-deformation-layer";
      readonly layerId: string;
    }
  | {
      readonly kind: "replace-groom";
      readonly groom: CharacterGroomDocument;
    }
  | {
      readonly kind: "set-pose";
      readonly pose: CharacterPoseDocumentV3;
    }
  | {
      readonly kind: "replace-surface-ink";
      readonly surfaceInk: CharacterSurfaceInkDocument;
    }
  | {
      readonly kind: "replace-geometry-strokes";
      readonly geometryStrokes: CharacterGeometryStrokeDocument;
    }
  | {
      readonly kind: "upsert-linked-layer";
      readonly layer: CharacterLinkedLayerDocument;
    }
  | {
      readonly kind: "remove-linked-layer";
      readonly linkedLayerId: string;
    }
  | {
      readonly kind: "set-output";
      readonly output: CharacterSemanticOutputRecipeV3;
    }
  | {
      readonly kind: "set-material-overrides";
      readonly overrides: readonly CharacterMaterialOverrideV3[];
    }
  | {
      readonly kind: "upsert-camera-shot";
      readonly shot: CharacterCameraShotV2;
      readonly activate?: boolean;
    };

export interface CharacterAuthoringCommand {
  readonly commandId: string;
  readonly label: string;
  readonly source: CharacterAuthoringCommandSource;
  readonly expectedDocumentId: string;
  readonly expectedRevision: number;
  readonly operations: readonly CharacterAuthoringOperation[];
  readonly committedAt?: string;
}

export interface CharacterAuthoringReceipt {
  readonly status: "applied" | "noop" | "stale" | "invalid";
  readonly commandId: string;
  readonly label: string;
  readonly beforeRevision: number;
  readonly afterRevision: number;
  readonly changedSections: readonly string[];
  readonly committedAt: string | null;
  readonly reason: string | null;
}

export interface CharacterAuthoringDispatchResult {
  readonly document: CharacterDocumentV3;
  readonly receipt: CharacterAuthoringReceipt;
}

export interface CharacterAuthoringAuthoritySnapshot {
  readonly document: CharacterDocumentV3;
  readonly previewDocument: CharacterDocumentV3 | null;
  readonly previewCommandId: string | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly historyLength: number;
}

export interface CharacterAuthoringJobToken {
  readonly jobId: string;
  readonly documentId: string;
  readonly baseRevision: number;
  readonly startedAt: number;
}

interface HistoryEntry {
  readonly command: CharacterAuthoringCommand;
  readonly before: CharacterDocumentV3;
  readonly after: CharacterDocumentV3;
  readonly receipt: CharacterAuthoringReceipt;
}

interface PreviewState {
  readonly command: CharacterAuthoringCommand;
  readonly base: CharacterDocumentV3;
  readonly candidate: CharacterDocumentV3;
}

const COMMAND_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u;

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function operationSections(
  before: CharacterDocumentV3,
  after: CharacterDocumentV3,
): readonly string[] {
  const sections: readonly (keyof CharacterDocumentV3)[] = [
    "model",
    "compatibility",
    "topology",
    "recipe",
    "deformation",
    "groom",
    "look",
    "expression",
    "pose",
    "surfacePaint",
    "surfaceInk",
    "geometryStrokes",
    "linkedLayers",
    "camera",
    "output",
    "runtimeRequirements",
    "sourceReceipts",
  ];
  return Object.freeze(sections.filter((section) => !sameValue(before[section], after[section])));
}

function replaceAtId<T>(
  values: readonly T[],
  idOf: (value: T) => string,
  next: T,
): readonly T[] {
  const id = idOf(next);
  const index = values.findIndex((value) => idOf(value) === id);
  return Object.freeze(index < 0
    ? [...values, next]
    : values.map((value, position) => position === index ? next : value));
}

const COMPATIBILITY_DEFORMATION_KINDS = new Set<CharacterDeformationLayerV3["kind"]>([
  "semantic-morph",
  "proportion",
  "control-cage",
]);

function mergeCompatibilityProjection(
  document: CharacterDocumentV3,
  projection: CharacterDocumentV3,
  sourceFingerprint: string,
): CharacterDocumentV3 {
  if (projection.documentId !== document.documentId) {
    throw new Error("호환 projection의 캐릭터 문서 ID가 현재 authority와 다릅니다.");
  }
  const topologyChanged = projection.topology.revision !== document.topology.revision;
  const localDeformation = document.deformation.layers.filter((layer) =>
    !COMPATIBILITY_DEFORMATION_KINDS.has(layer.kind)
  );
  const projectedDeformation = projection.deformation.layers.filter((layer) =>
    COMPATIBILITY_DEFORMATION_KINDS.has(layer.kind)
  );
  const groom = topologyChanged
    ? markCharacterGroomTopology(document.groom, projection.topology.revision)
    : document.groom;
  const surfaceInk = topologyChanged
    ? markCharacterSurfaceInkTopology(projection.surfaceInk, projection.topology.revision)
    : projection.surfaceInk;
  const geometryStrokes = topologyChanged
    ? markCharacterGeometryStrokeTopology(document.geometryStrokes, projection.topology.revision)
    : document.geometryStrokes;
  const projectionReceipt = Object.freeze({
    kind: "compatibility-projection",
    sourceFingerprint,
    sourceRevision: projection.revision,
    topologyChanged,
  });
  return {
    ...document,
    model: projection.model,
    compatibility: projection.compatibility,
    topology: projection.topology,
    recipe: projection.recipe,
    deformation: {
      layers: Object.freeze([...projectedDeformation, ...localDeformation]),
    },
    groom,
    look: {
      colors: projection.look.colors,
      materialOverrides: document.look.materialOverrides,
    },
    expression: projection.expression,
    pose: projection.pose,
    surfaceInk,
    geometryStrokes,
    camera: Object.keys(projection.camera.shots).length > 0
      ? projection.camera
      : document.camera,
    output: {
      ...document.output,
      transparent: projection.output.transparent,
    },
    sourceReceipts: Object.freeze([
      ...document.sourceReceipts.filter((receipt) => receipt.kind !== "compatibility-projection"),
      projectionReceipt,
    ]),
  };
}

function applyOperation(
  document: CharacterDocumentV3,
  operation: CharacterAuthoringOperation,
): CharacterDocumentV3 {
  switch (operation.kind) {
    case "sync-compatibility-projection":
      return mergeCompatibilityProjection(document, operation.projection, operation.sourceFingerprint);
    case "set-slot": {
      const slots = { ...document.recipe.slots };
      if (operation.selection === null) delete slots[operation.slot];
      else slots[operation.slot] = operation.selection;
      return { ...document, recipe: { ...document.recipe, slots } };
    }
    case "set-accessories":
      return {
        ...document,
        recipe: { ...document.recipe, accessories: Object.freeze([...operation.selections]) },
      };
    case "set-hand-pose": {
      const handPose = { ...document.recipe.handPose };
      if (operation.selection === null) delete handPose[operation.side];
      else handPose[operation.side] = operation.selection;
      return { ...document, recipe: { ...document.recipe, handPose } };
    }
    case "set-color":
      return {
        ...document,
        look: {
          ...document.look,
          colors: { ...document.look.colors, [operation.target]: operation.color },
        },
      };
    case "upsert-deformation-layer":
      return {
        ...document,
        deformation: {
          layers: replaceAtId(
            document.deformation.layers,
            (layer) => layer.layerId,
            operation.layer,
          ),
        },
      };
    case "remove-deformation-layer":
      return {
        ...document,
        deformation: {
          layers: Object.freeze(document.deformation.layers.filter((layer) =>
            layer.layerId !== operation.layerId
          )),
        },
      };
    case "replace-groom":
      return { ...document, groom: operation.groom };
    case "set-pose":
      return { ...document, pose: operation.pose };
    case "replace-surface-ink":
      return { ...document, surfaceInk: operation.surfaceInk };
    case "replace-geometry-strokes":
      return { ...document, geometryStrokes: operation.geometryStrokes };
    case "upsert-linked-layer":
      return {
        ...document,
        linkedLayers: replaceAtId(
          document.linkedLayers,
          (layer) => layer.linkedLayerId,
          operation.layer,
        ),
      };
    case "remove-linked-layer":
      return {
        ...document,
        linkedLayers: Object.freeze(document.linkedLayers.filter((layer) =>
          layer.linkedLayerId !== operation.linkedLayerId
        )),
      };
    case "set-output":
      return { ...document, output: operation.output };
    case "set-material-overrides":
      return {
        ...document,
        look: {
          ...document.look,
          materialOverrides: Object.freeze([...operation.overrides]),
        },
      };
    case "upsert-camera-shot": {
      const shots = { ...document.camera.shots, [operation.shot.id]: operation.shot };
      return {
        ...document,
        camera: {
          shots,
          activeShotId: operation.activate === true
            ? operation.shot.id
            : document.camera.activeShotId,
        },
      };
    }
  }
}

function receipt(input: {
  readonly command: CharacterAuthoringCommand;
  readonly status: CharacterAuthoringReceipt["status"];
  readonly beforeRevision: number;
  readonly afterRevision: number;
  readonly changedSections?: readonly string[];
  readonly committedAt?: string | null;
  readonly reason?: string | null;
}): CharacterAuthoringReceipt {
  return Object.freeze({
    status: input.status,
    commandId: input.command.commandId,
    label: input.command.label,
    beforeRevision: input.beforeRevision,
    afterRevision: input.afterRevision,
    changedSections: Object.freeze([...(input.changedSections ?? [])]),
    committedAt: input.committedAt ?? null,
    reason: input.reason ?? null,
  });
}

function validateCommand(command: CharacterAuthoringCommand): string | null {
  if (!COMMAND_ID.test(command.commandId)) return "명령 ID 형식이 올바르지 않습니다.";
  if (command.label.trim().length === 0 || command.label.length > 160) return "명령 이름은 1~160자여야 합니다.";
  if (!COMMAND_ID.test(command.expectedDocumentId)) return "대상 문서 ID 형식이 올바르지 않습니다.";
  if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) return "기준 revision이 올바르지 않습니다.";
  if (!Array.isArray(command.operations) || command.operations.length < 1 || command.operations.length > 512) {
    return "명령에는 1~512개의 작업이 필요합니다.";
  }
  return null;
}

function applyWithoutCommit(
  document: CharacterDocumentV3,
  command: CharacterAuthoringCommand,
): CharacterAuthoringDispatchResult {
  const validationError = validateCommand(command);
  if (validationError) {
    return {
      document,
      receipt: receipt({
        command,
        status: "invalid",
        beforeRevision: document.revision,
        afterRevision: document.revision,
        reason: validationError,
      }),
    };
  }
  if (command.expectedDocumentId !== document.documentId
    || command.expectedRevision !== document.revision) {
    return {
      document,
      receipt: receipt({
        command,
        status: "stale",
        beforeRevision: document.revision,
        afterRevision: document.revision,
        reason: "문서가 명령 생성 이후 변경되었습니다.",
      }),
    };
  }
  try {
    let candidate = document;
    for (const operation of command.operations) candidate = applyOperation(candidate, operation);
    candidate = validateCharacterDocumentV3({
      ...candidate,
      revision: document.revision,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    });
    const changedSections = operationSections(document, candidate);
    if (changedSections.length === 0) {
      return {
        document,
        receipt: receipt({
          command,
          status: "noop",
          beforeRevision: document.revision,
          afterRevision: document.revision,
          reason: "변경할 값이 없습니다.",
        }),
      };
    }
    return {
      document: candidate,
      receipt: receipt({
        command,
        status: "applied",
        beforeRevision: document.revision,
        afterRevision: document.revision,
        changedSections,
      }),
    };
  } catch (error) {
    return {
      document,
      receipt: receipt({
        command,
        status: "invalid",
        beforeRevision: document.revision,
        afterRevision: document.revision,
        reason: error instanceof Error ? error.message : "캐릭터 명령을 적용하지 못했습니다.",
      }),
    };
  }
}

export function dispatchCharacterAuthoringCommand(
  document: CharacterDocumentV3,
  command: CharacterAuthoringCommand,
): CharacterAuthoringDispatchResult {
  const staged = applyWithoutCommit(document, command);
  if (staged.receipt.status !== "applied") return staged;
  const committedAt = command.committedAt ?? new Date().toISOString();
  const committed = validateCharacterDocumentV3({
    ...staged.document,
    revision: document.revision + 1,
    createdAt: document.createdAt,
    updatedAt: committedAt,
  });
  return {
    document: committed,
    receipt: receipt({
      command,
      status: "applied",
      beforeRevision: document.revision,
      afterRevision: committed.revision,
      changedSections: staged.receipt.changedSections,
      committedAt,
    }),
  };
}

export class CharacterAuthoringAuthority {
  #document: CharacterDocumentV3;
  #undo: HistoryEntry[] = [];
  #redo: HistoryEntry[] = [];
  #preview: PreviewState | null = null;
  #listeners = new Set<() => void>();
  readonly #maxEntries: number;
  #snapshot: CharacterAuthoringAuthoritySnapshot;

  constructor(document: CharacterDocumentV3, options: { readonly maxEntries?: number } = {}) {
    this.#document = validateCharacterDocumentV3(document);
    this.#maxEntries = Math.min(500, Math.max(1, Math.floor(options.maxEntries ?? 120)));
    this.#snapshot = this.#createSnapshot();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  #createSnapshot(): CharacterAuthoringAuthoritySnapshot {
    return Object.freeze({
      document: this.#document,
      previewDocument: this.#preview?.candidate ?? null,
      previewCommandId: this.#preview?.command.commandId ?? null,
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
      historyLength: this.#undo.length,
    });
  }

  #emit(): void {
    this.#snapshot = this.#createSnapshot();
    for (const listener of this.#listeners) listener();
  }

  getSnapshot = (): CharacterAuthoringAuthoritySnapshot => this.#snapshot;

  replaceDocument(
    document: CharacterDocumentV3,
    options: { readonly clearHistory?: boolean } = {},
  ): void {
    const validated = validateCharacterDocumentV3(document);
    if (validated.documentId !== this.#document.documentId) {
      throw new Error("다른 캐릭터 문서로 authority를 교체할 수 없습니다.");
    }
    this.#document = validated;
    this.#preview = null;
    if (options.clearHistory !== false) {
      this.#undo = [];
      this.#redo = [];
    }
    this.#emit();
  }

  dispatch(command: CharacterAuthoringCommand): CharacterAuthoringReceipt {
    if (this.#preview) {
      return receipt({
        command,
        status: "invalid",
        beforeRevision: this.#document.revision,
        afterRevision: this.#document.revision,
        reason: "미리보기를 확정하거나 취소한 뒤 다른 명령을 적용할 수 있습니다.",
      });
    }
    const result = dispatchCharacterAuthoringCommand(this.#document, command);
    if (result.receipt.status !== "applied") return result.receipt;
    const entry: HistoryEntry = Object.freeze({
      command,
      before: this.#document,
      after: result.document,
      receipt: result.receipt,
    });
    this.#document = result.document;
    this.#undo.push(entry);
    if (this.#undo.length > this.#maxEntries) this.#undo.splice(0, this.#undo.length - this.#maxEntries);
    this.#redo = [];
    this.#emit();
    return result.receipt;
  }

  beginPreview(command: CharacterAuthoringCommand): CharacterAuthoringReceipt {
    if (this.#preview) {
      return receipt({
        command,
        status: "invalid",
        beforeRevision: this.#document.revision,
        afterRevision: this.#document.revision,
        reason: "이미 다른 미리보기가 열려 있습니다.",
      });
    }
    const staged = applyWithoutCommit(this.#document, command);
    if (staged.receipt.status !== "applied") return staged.receipt;
    this.#preview = Object.freeze({ command, base: this.#document, candidate: staged.document });
    this.#emit();
    return staged.receipt;
  }

  cancelPreview(): boolean {
    if (!this.#preview) return false;
    this.#preview = null;
    this.#emit();
    return true;
  }

  commitPreview(committedAt = new Date().toISOString()): CharacterAuthoringReceipt | null {
    const preview = this.#preview;
    if (!preview) return null;
    this.#preview = null;
    if (preview.base !== this.#document) {
      const stale = receipt({
        command: preview.command,
        status: "stale",
        beforeRevision: this.#document.revision,
        afterRevision: this.#document.revision,
        reason: "미리보기 중 원본 문서가 변경되었습니다.",
      });
      this.#emit();
      return stale;
    }
    return this.dispatch({ ...preview.command, committedAt });
  }

  #restoreHistoricalSnapshot(snapshot: CharacterDocumentV3): void {
    this.#document = validateCharacterDocumentV3({
      ...snapshot,
      revision: this.#document.revision + 1,
      createdAt: this.#document.createdAt,
      updatedAt: new Date().toISOString(),
    });
  }

  undo(): boolean {
    if (this.#preview) this.cancelPreview();
    const entry = this.#undo.pop();
    if (!entry) return false;
    this.#redo.push(entry);
    this.#restoreHistoricalSnapshot(entry.before);
    this.#emit();
    return true;
  }

  redo(): boolean {
    if (this.#preview) this.cancelPreview();
    const entry = this.#redo.pop();
    if (!entry) return false;
    this.#undo.push(entry);
    this.#restoreHistoricalSnapshot(entry.after);
    this.#emit();
    return true;
  }

  beginJob(jobId: string, startedAt = Date.now()): CharacterAuthoringJobToken {
    if (!COMMAND_ID.test(jobId)) throw new TypeError("jobId 형식이 올바르지 않습니다.");
    return Object.freeze({
      jobId,
      documentId: this.#document.documentId,
      baseRevision: this.#document.revision,
      startedAt,
    });
  }

  commitJob(
    token: CharacterAuthoringJobToken,
    input: Omit<CharacterAuthoringCommand, "expectedDocumentId" | "expectedRevision" | "source">,
  ): CharacterAuthoringReceipt {
    return this.dispatch({
      ...input,
      source: "worker",
      expectedDocumentId: token.documentId,
      expectedRevision: token.baseRevision,
    });
  }
}
