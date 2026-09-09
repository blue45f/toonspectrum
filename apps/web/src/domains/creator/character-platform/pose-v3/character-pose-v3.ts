import type {
  CharacterPoseCandidateV2,
  CharacterPoseRegion,
  CharacterQuaternion,
  CharacterVector3,
} from "../pose/character-pose-v2";

export const CHARACTER_POSE_DOCUMENT_VERSION = 3 as const;

export interface CharacterPoseEffectorV3 {
  readonly id: string;
  readonly bone: string;
  readonly target: CharacterVector3;
  readonly rotation?: CharacterQuaternion;
  readonly poleTarget?: CharacterVector3;
  readonly weight: number;
  readonly pinned: boolean;
}

export interface CharacterPoseContactV3 {
  readonly id: string;
  readonly kind: "ground" | "prop" | "self" | "character" | "environment";
  readonly bone: string;
  readonly targetId?: string;
  readonly target: CharacterVector3;
  readonly normal?: CharacterVector3;
  readonly weight: number;
  readonly tolerance: number;
  readonly mode: "hard-pin" | "soft-point" | "surface-slide" | "distance" | "support";
}

export interface CharacterPoseFixedControllerV3 {
  readonly id: string;
  readonly bone: string;
  readonly lockPosition: boolean;
  readonly lockRotation: boolean;
}

export interface CharacterPoseStylizationV3 {
  readonly exaggeration: number;
  readonly silhouetteWeight: number;
  readonly preserveFootPlant: boolean;
  readonly dramaticImbalance: boolean;
}

export interface CharacterPoseSolveReceiptV3 {
  readonly solverRevision: string;
  readonly inputHash: string;
  readonly iterations: number;
  readonly converged: boolean;
  readonly maximumError: number;
  readonly centerOfMassMargin: number | null;
  readonly warnings: readonly string[];
}

export interface CharacterPoseDocumentV3 {
  readonly schemaVersion: typeof CHARACTER_POSE_DOCUMENT_VERSION;
  readonly poseId: string;
  readonly generationId: number;
  readonly source: "photo" | "webcam" | "video" | "preset" | "manual" | "ai";
  readonly root: {
    readonly position: CharacterVector3;
    readonly rotation: CharacterQuaternion;
  };
  readonly bones: Readonly<Record<string, CharacterQuaternion>>;
  readonly confidence: {
    readonly overall: number;
    readonly regions: Readonly<Partial<Record<CharacterPoseRegion, number>>>;
    readonly joints: Readonly<Record<string, number>>;
  };
  readonly effectors: readonly CharacterPoseEffectorV3[];
  readonly contacts: readonly CharacterPoseContactV3[];
  readonly fixedControllers: readonly CharacterPoseFixedControllerV3[];
  readonly regionWeights: Readonly<Partial<Record<CharacterPoseRegion, number>>>;
  readonly stylization: CharacterPoseStylizationV3;
  readonly sourceWarnings: readonly string[];
  readonly solveReceipt: CharacterPoseSolveReceiptV3 | null;
  /** Original V2 candidate can be retained during migration for byte-level audit. */
  readonly legacySource?: CharacterPoseCandidateV2;
}

export class CharacterPoseV3Error extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CharacterPoseV3Error";
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u;
const HASH = /^[a-f0-9]{8,128}$/iu;
const REGIONS: readonly CharacterPoseRegion[] = [
  "head", "torso", "left-arm", "right-arm", "left-leg", "right-leg", "left-hand", "right-hand",
];

function finiteTuple(value: readonly number[], length: number): boolean {
  return value.length === length && value.every(Number.isFinite);
}

function bounded01(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function assertId(value: string, field: string): void {
  if (!ID.test(value)) throw new CharacterPoseV3Error("CHARACTER_POSE_ID_INVALID", `${field} 형식이 올바르지 않습니다.`);
}

export function validateCharacterPoseDocumentV3(
  input: CharacterPoseDocumentV3,
): CharacterPoseDocumentV3 {
  if (input.schemaVersion !== CHARACTER_POSE_DOCUMENT_VERSION) {
    throw new CharacterPoseV3Error("CHARACTER_POSE_VERSION_UNSUPPORTED", "지원하지 않는 Pose 문서 버전입니다.");
  }
  assertId(input.poseId, "poseId");
  if (!Number.isSafeInteger(input.generationId) || input.generationId < 0) {
    throw new CharacterPoseV3Error("CHARACTER_POSE_GENERATION_INVALID", "Pose generationId가 올바르지 않습니다.");
  }
  if (!finiteTuple(input.root.position, 3) || !finiteTuple(input.root.rotation, 4)) {
    throw new CharacterPoseV3Error("CHARACTER_POSE_ROOT_INVALID", "Pose Root Transform이 올바르지 않습니다.");
  }
  if (!bounded01(input.confidence.overall)) {
    throw new CharacterPoseV3Error("CHARACTER_POSE_CONFIDENCE_INVALID", "전체 신뢰도는 0~1이어야 합니다.");
  }
  for (const [region, value] of Object.entries(input.confidence.regions)) {
    if (!REGIONS.includes(region as CharacterPoseRegion) || !bounded01(Number(value))) {
      throw new CharacterPoseV3Error("CHARACTER_POSE_CONFIDENCE_INVALID", "영역 신뢰도가 올바르지 않습니다.");
    }
  }
  for (const [bone, value] of Object.entries(input.bones)) {
    assertId(bone, "bone");
    if (!finiteTuple(value, 4)) {
      throw new CharacterPoseV3Error("CHARACTER_POSE_BONE_INVALID", `${bone} Quaternion이 올바르지 않습니다.`);
    }
  }
  for (const [bone, value] of Object.entries(input.confidence.joints)) {
    assertId(bone, "confidence.joint");
    if (!bounded01(value)) {
      throw new CharacterPoseV3Error("CHARACTER_POSE_CONFIDENCE_INVALID", `${bone} 신뢰도가 올바르지 않습니다.`);
    }
  }
  for (const [region, value] of Object.entries(input.regionWeights)) {
    if (!REGIONS.includes(region as CharacterPoseRegion) || !bounded01(Number(value))) {
      throw new CharacterPoseV3Error("CHARACTER_POSE_REGION_WEIGHT_INVALID", "영역 가중치는 0~1이어야 합니다.");
    }
  }
  const ids = new Set<string>();
  const acceptUnique = (id: string) => {
    assertId(id, "constraint.id");
    if (ids.has(id)) throw new CharacterPoseV3Error("CHARACTER_POSE_DUPLICATE_ID", `중복 제약 ID가 있습니다: ${id}`);
    ids.add(id);
  };
  for (const effector of input.effectors) {
    acceptUnique(effector.id);
    assertId(effector.bone, "effector.bone");
    if (!finiteTuple(effector.target, 3) || !bounded01(effector.weight)) {
      throw new CharacterPoseV3Error("CHARACTER_POSE_EFFECTOR_INVALID", `${effector.id} Effector가 올바르지 않습니다.`);
    }
    if (effector.rotation && !finiteTuple(effector.rotation, 4)) {
      throw new CharacterPoseV3Error("CHARACTER_POSE_EFFECTOR_INVALID", `${effector.id} 회전이 올바르지 않습니다.`);
    }
  }
  for (const contact of input.contacts) {
    acceptUnique(contact.id);
    assertId(contact.bone, "contact.bone");
    if (!finiteTuple(contact.target, 3) || !bounded01(contact.weight)
      || !Number.isFinite(contact.tolerance) || contact.tolerance < 0) {
      throw new CharacterPoseV3Error("CHARACTER_POSE_CONTACT_INVALID", `${contact.id} 접점이 올바르지 않습니다.`);
    }
  }
  for (const controller of input.fixedControllers) {
    acceptUnique(controller.id);
    assertId(controller.bone, "controller.bone");
  }
  if (![input.stylization.exaggeration, input.stylization.silhouetteWeight].every(bounded01)) {
    throw new CharacterPoseV3Error("CHARACTER_POSE_STYLIZATION_INVALID", "Pose 스타일 가중치는 0~1이어야 합니다.");
  }
  if (input.solveReceipt) {
    assertId(input.solveReceipt.solverRevision, "solveReceipt.solverRevision");
    if (!HASH.test(input.solveReceipt.inputHash)
      || !Number.isSafeInteger(input.solveReceipt.iterations)
      || input.solveReceipt.iterations < 0
      || !Number.isFinite(input.solveReceipt.maximumError)
      || input.solveReceipt.maximumError < 0) {
      throw new CharacterPoseV3Error("CHARACTER_POSE_RECEIPT_INVALID", "Pose Solve Receipt가 올바르지 않습니다.");
    }
  }
  return Object.freeze({
    ...input,
    root: Object.freeze({ ...input.root }),
    bones: Object.freeze({ ...input.bones }),
    confidence: Object.freeze({
      overall: input.confidence.overall,
      regions: Object.freeze({ ...input.confidence.regions }),
      joints: Object.freeze({ ...input.confidence.joints }),
    }),
    effectors: Object.freeze(input.effectors.map((item) => Object.freeze({ ...item }))),
    contacts: Object.freeze(input.contacts.map((item) => Object.freeze({ ...item }))),
    fixedControllers: Object.freeze(input.fixedControllers.map((item) => Object.freeze({ ...item }))),
    regionWeights: Object.freeze({ ...input.regionWeights }),
    stylization: Object.freeze({ ...input.stylization }),
    sourceWarnings: Object.freeze([...input.sourceWarnings]),
    solveReceipt: input.solveReceipt ? Object.freeze({
      ...input.solveReceipt,
      inputHash: input.solveReceipt.inputHash.toLowerCase(),
      warnings: Object.freeze([...input.solveReceipt.warnings]),
    }) : null,
  });
}
