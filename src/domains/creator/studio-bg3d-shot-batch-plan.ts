/**
 * Engine-neutral planning contract for storyboard batch renders.
 *
 * The interactive renderer owns one shot at a time, while this module owns only bounded selection,
 * pass ordering, deterministic file identities, and a stable resume key. Keeping this logic out of
 * the React component lets a future Three/Babylon/PlayCanvas adapter consume the exact same jobs.
 */

import { STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS } from "./studio-bg3d-scene-document";

export const STUDIO_BG3D_SHOT_BATCH_PASSES = [
  "beauty",
  "lt-composite",
  "color",
  "tone",
  "texture-line",
  "main-line",
  "depth",
] as const;

export type StudioBg3dShotBatchPass = (typeof STUDIO_BG3D_SHOT_BATCH_PASSES)[number];

export const STUDIO_BG3D_SHOT_BATCH_PASS_LABELS: Readonly<
  Record<StudioBg3dShotBatchPass, string>
> = Object.freeze({
  beauty: "원본 렌더",
  "lt-composite": "LT 합성",
  color: "컬러",
  tone: "톤",
  "texture-line": "질감선",
  "main-line": "주선",
  depth: "깊이",
});

export const STUDIO_BG3D_SHOT_BATCH_MAX_PASSES = STUDIO_BG3D_SHOT_BATCH_PASSES.length;
export const STUDIO_BG3D_SHOT_BATCH_MAX_FILES =
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS * STUDIO_BG3D_SHOT_BATCH_MAX_PASSES;

export interface StudioBg3dShotBatchSourceShot {
  readonly id: string;
  readonly name: string;
}

export interface StudioBg3dShotBatchPlannedFile {
  /** Stable within one plan and safe to use as a recovery-map key. */
  readonly key: string;
  readonly shotId: string;
  readonly shotName: string;
  readonly shotIndex: number;
  readonly pass: StudioBg3dShotBatchPass;
  readonly path: string;
}

export interface StudioBg3dShotBatchPlannedShot {
  readonly shotId: string;
  readonly shotName: string;
  readonly shotIndex: number;
  readonly files: readonly StudioBg3dShotBatchPlannedFile[];
}

export interface StudioBg3dShotBatchPlan {
  readonly kind: "toonspectrum-bg3d-shot-batch-plan";
  readonly version: 1;
  /** Changes whenever ordered shots, names, or requested passes change. */
  readonly resumeKey: string;
  readonly passes: readonly StudioBg3dShotBatchPass[];
  readonly exportHeight: "per-shot" | number;
  readonly includeContactSheet: boolean;
  readonly shots: readonly StudioBg3dShotBatchPlannedShot[];
  readonly files: readonly StudioBg3dShotBatchPlannedFile[];
}

export type StudioBg3dShotBatchPlanErrorCode =
  | "invalid-shots"
  | "duplicate-shot-id"
  | "invalid-selection"
  | "invalid-source-revision"
  | "duplicate-selection"
  | "unknown-selection"
  | "empty-selection"
  | "invalid-pass"
  | "duplicate-pass"
  | "empty-passes"
  | "file-budget";

export interface StudioBg3dShotBatchPlanFailure {
  readonly ok: false;
  readonly code: StudioBg3dShotBatchPlanErrorCode;
  readonly message: string;
}

export interface StudioBg3dShotBatchPlanSuccess {
  readonly ok: true;
  readonly plan: StudioBg3dShotBatchPlan;
}

export interface CreateStudioBg3dShotBatchPlanOptions {
  /** Omit to render every shot. Input order never changes canonical storyboard order. */
  readonly selectedShotIds?: readonly string[];
  /** Omit to preserve the legacy one-file LT-composite export. */
  readonly passes?: readonly StudioBg3dShotBatchPass[];
  /** Canonical scene serialization; hashed into the resume key but never retained in the plan. */
  readonly sourceRevision?: string;
  readonly layeredPsd?: boolean;
  readonly contactSheet?: boolean;
  readonly exportHeight?: "per-shot" | number;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/u;
const NAME_MAX_CODE_POINTS = 80;

function failure(
  code: StudioBg3dShotBatchPlanErrorCode,
  message: string,
): StudioBg3dShotBatchPlanFailure {
  return { ok: false, code, message };
}

function validShot(value: unknown): value is StudioBg3dShotBatchSourceShot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const shot = value as Partial<StudioBg3dShotBatchSourceShot>;
  return typeof shot.id === "string" &&
    ID_PATTERN.test(shot.id) &&
    typeof shot.name === "string" &&
    shot.name === shot.name.trim() &&
    Array.from(shot.name).length >= 1 &&
    Array.from(shot.name).length <= NAME_MAX_CODE_POINTS;
}

function isPass(value: unknown): value is StudioBg3dShotBatchPass {
  return typeof value === "string" &&
    (STUDIO_BG3D_SHOT_BATCH_PASSES as readonly string[]).includes(value);
}

function canonicalPasses(
  requested: readonly StudioBg3dShotBatchPass[] | undefined,
): readonly StudioBg3dShotBatchPass[] | StudioBg3dShotBatchPlanFailure {
  const source = requested ?? ["lt-composite"];
  if (!Array.isArray(source)) {
    return failure("invalid-pass", "컷 배치 출력 패스 형식이 올바르지 않습니다.");
  }
  if (source.length === 0) {
    return failure("empty-passes", "컷 배치 출력 패스를 하나 이상 선택해 주세요.");
  }
  const seen = new Set<StudioBg3dShotBatchPass>();
  for (const pass of source) {
    if (!isPass(pass)) {
      return failure("invalid-pass", "지원하지 않는 컷 배치 출력 패스입니다.");
    }
    if (seen.has(pass)) {
      return failure("duplicate-pass", "컷 배치 출력 패스가 중복되었습니다.");
    }
    seen.add(pass);
  }
  return STUDIO_BG3D_SHOT_BATCH_PASSES.filter((pass) => seen.has(pass));
}

/** Small deterministic non-cryptographic hash used only for local recovery identity. */
function resumeHash(value: string): string {
  let hash = 0x811c_9dc5;
  const bytes = new TextEncoder().encode(value);
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function createStudioBg3dShotBatchPlan(
  shots: readonly StudioBg3dShotBatchSourceShot[],
  options: CreateStudioBg3dShotBatchPlanOptions = {},
): StudioBg3dShotBatchPlanSuccess | StudioBg3dShotBatchPlanFailure {
  if (
    !Array.isArray(shots) ||
    shots.length < 1 ||
    shots.length > STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS ||
    shots.some((shot) => !validShot(shot))
  ) {
    return failure("invalid-shots", "컷 배치 원본이 장면 문서 한도 또는 형식을 벗어났습니다.");
  }
  if (
    options.sourceRevision !== undefined &&
    (typeof options.sourceRevision !== "string" ||
      options.sourceRevision.length < 1 ||
      new TextEncoder().encode(options.sourceRevision).byteLength > 320 * 1024)
  ) {
    return failure("invalid-source-revision", "컷 배치 장면 revision이 올바르지 않습니다.");
  }
  if (options.layeredPsd !== undefined && typeof options.layeredPsd !== "boolean") {
    return failure("invalid-pass", "컷 배치 PSD 옵션이 올바르지 않습니다.");
  }
  if (options.contactSheet !== undefined && typeof options.contactSheet !== "boolean") {
    return failure("invalid-pass", "컷 배치 콘택트 시트 옵션이 올바르지 않습니다.");
  }
  const exportHeight = options.exportHeight ?? "per-shot";
  if (
    exportHeight !== "per-shot" &&
    (!Number.isSafeInteger(exportHeight) || exportHeight < 256 || exportHeight > 4_096)
  ) {
    return failure("invalid-pass", "컷 배치 고정 출력 높이가 올바르지 않습니다.");
  }
  const shotById = new Map<string, StudioBg3dShotBatchSourceShot>();
  for (const shot of shots) {
    if (shotById.has(shot.id)) {
      return failure("duplicate-shot-id", "컷 배치 원본에 중복 ID가 있습니다.");
    }
    shotById.set(shot.id, shot);
  }

  const requestedIds = options.selectedShotIds ?? shots.map(({ id }) => id);
  if (!Array.isArray(requestedIds) || requestedIds.some((id) => typeof id !== "string")) {
    return failure("invalid-selection", "컷 배치 선택 형식이 올바르지 않습니다.");
  }
  if (requestedIds.length === 0) {
    return failure("empty-selection", "렌더할 컷을 하나 이상 선택해 주세요.");
  }
  const selectedIds = new Set<string>();
  for (const id of requestedIds) {
    if (selectedIds.has(id)) {
      return failure("duplicate-selection", "선택한 컷 ID가 중복되었습니다.");
    }
    if (!shotById.has(id)) {
      return failure("unknown-selection", "장면에 없는 컷이 선택되었습니다.");
    }
    selectedIds.add(id);
  }

  const passes = canonicalPasses(options.passes);
  if ("ok" in passes) return passes;
  const selectedShots = shots.filter(({ id }) => selectedIds.has(id));
  const fileCount = selectedShots.length * passes.length;
  if (fileCount < 1 || fileCount > STUDIO_BG3D_SHOT_BATCH_MAX_FILES) {
    return failure("file-budget", "컷 배치 출력 파일 수가 브라우저 안전 한도를 벗어났습니다.");
  }

  const plannedShots: StudioBg3dShotBatchPlannedShot[] = selectedShots.map((shot, index) => {
    const shotIndex = index + 1;
    const ordinal = String(shotIndex).padStart(3, "0");
    const files = passes.map((pass): StudioBg3dShotBatchPlannedFile => ({
      key: `${shot.id}:${pass}`,
      shotId: shot.id,
      shotName: shot.name,
      shotIndex,
      pass,
      path: `shots/${ordinal}/${pass}.png`,
    }));
    return {
      shotId: shot.id,
      shotName: shot.name,
      shotIndex,
      files,
    };
  });
  const files = plannedShots.flatMap(({ files: shotFiles }) => shotFiles);
  const identity = JSON.stringify({
    shots: plannedShots.map(({ shotId, shotName }) => [shotId, shotName]),
    passes,
    sourceRevision: options.sourceRevision ?? null,
    layeredPsd: options.layeredPsd ?? false,
    contactSheet: options.contactSheet ?? false,
    exportHeight,
  });

  return {
    ok: true,
    plan: {
      kind: "toonspectrum-bg3d-shot-batch-plan",
      version: 1,
      resumeKey: `bg3d-batch-${resumeHash(identity)}`,
      passes,
      exportHeight,
      includeContactSheet: options.contactSheet ?? false,
      shots: plannedShots,
      files,
    },
  };
}

/** Returns only unfinished files when a bounded recovery checkpoint is resumed. */
export function pendingStudioBg3dShotBatchFiles(
  plan: StudioBg3dShotBatchPlan,
  completedKeys: ReadonlySet<string>,
): readonly StudioBg3dShotBatchPlannedFile[] {
  if (!(completedKeys instanceof Set)) return plan.files;
  return plan.files.filter(({ key }) => !completedKeys.has(key));
}
