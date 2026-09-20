import { isStudioBrushEngineProgramWireValue } from "../../../shared/lib/studio-brush-material-program-contract";
import { createBrushStudioV6Program, normalizeBrushStudioV6Program, type BrushStudioV6Program } from "./brush-studio-v6-engine";
import { normalizeBrushStudioV6MaterialConfig, type BrushStudioV6MaterialConfig } from "./brush-studio-v6-material-engine";
import { createBrushStudioV6MaterialReceipt } from "./brush-studio-v6-material-receipt";
import { sameBrushStudioData } from "./brush-studio-data-equality";

export const BRUSH_AUTHORING_FORMAT = "toonspectrum-brush-authoring";
export const BRUSH_AUTHORING_MAX_CHARACTERS = 262_144;

/** New drafts keep execution receipts; a null receipt explicitly denotes authoring-only data. */
export function serializeBrushStudioV6Authoring(program: BrushStudioV6Program): string {
  let materialReceipt: BrushStudioV6MaterialConfig | null = null;
  try { materialReceipt = createBrushStudioV6MaterialReceipt(program); } catch { /* Unsupported graph remains a draft. */ }
  return JSON.stringify({ ...program, authoringFormat: BRUSH_AUTHORING_FORMAT,
    authoringVersion: 1, materialReceipt });
}

export function hasBrushStudioV6AuthoringEnvelope(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object"
    && ["authoringFormat", "authoringVersion", "materialReceipt"].some((key) => key in raw);
}

/** A recognized but unsupported envelope never falls through to a guessed legacy program. */
export function parseBrushStudioV6Authoring(raw: Record<string, unknown>): BrushStudioV6Program {
  const { authoringFormat, authoringVersion, materialReceipt, ...source } = raw;
  if (authoringFormat !== BRUSH_AUTHORING_FORMAT || authoringVersion !== 1
    || !Object.hasOwn(raw, "materialReceipt")) throw new Error("지원하지 않는 브러시 편집 파일입니다.");
  const program = normalizeBrushStudioV6Program(source);
  if (!sameBrushStudioData(source, program)) throw new Error("브러시 설정을 변경 없이 복원할 수 없습니다.");
  if (materialReceipt === null) {
    let supported = false;
    try { createBrushStudioV6MaterialReceipt(program); supported = true; } catch { /* Still a non-executable draft. */ }
    if (supported) throw new Error("실행 가능한 브러시의 원본 실행 정보가 없습니다. 자동 변경하지 않았습니다.");
  }
  if (materialReceipt !== null) {
    const receipt = requireExactMaterial(materialReceipt);
    const expected = createBrushStudioV6MaterialReceipt(program);
    if (!sameBrushStudioData(receipt, expected)) {
      throw new Error("저장된 브러시와 현재 실행 정보가 다릅니다. 원본을 보존했습니다.");
    }
  }
  return program;
}

function requireExactMaterial(raw: unknown): Extract<BrushStudioV6MaterialConfig, { version: 2 }> {
  if (!isStudioBrushEngineProgramWireValue({ version: 1, material: raw })) {
    throw new Error("재료 설정에 지원하지 않거나 손상된 값이 있습니다.");
  }
  const material = normalizeBrushStudioV6MaterialConfig(raw);
  if (!material || material.version !== 2) {
    throw new Error("이전 재료는 현재 엔진으로 자동 변환하지 않습니다. 원고는 그대로 유지됩니다.");
  }
  return material;
}

export interface BrushStudioMaterialToolValues {
  readonly strokeWidth: number;
  readonly brushOpacity: number;
  readonly color: string;
}

/** Exact current material, including only explicit main-tool overrides, never a similar recipe. */
export function createBrushStudioV6ExactEditorProgram(raw: unknown, id: string, name: string,
  tool?: BrushStudioMaterialToolValues): BrushStudioV6Program {
  const material = requireExactMaterial(raw);
  if (tool && (!Number.isFinite(tool.strokeWidth) || tool.strokeWidth < 1 || tool.strokeWidth > 240
    || !Number.isFinite(tool.brushOpacity) || tool.brushOpacity < 0 || tool.brushOpacity > 1
    || !/^#[0-9a-f]{6}$/iu.test(tool.color))) {
    throw new Error("현재 크기·색·불투명도를 정확하게 전달할 수 없습니다.");
  }
  const tuning = tool ? { ...material.tuning, size: tool.strokeWidth,
    primaryColor: tool.color.toLowerCase(), opacity: tool.brushOpacity } : material.tuning;
  const program = normalizeBrushStudioV6Program({ ...createBrushStudioV6Program(),
    id, name, licenseProfile: material.runtime.licenseProfile, description: "원고의 현재 재료 설정 · 저장 시 별도 브러시로 보존",
    seed: material.seed, input: material.input, slots: material.slots, tuning });
  const expected = createBrushStudioV6MaterialReceipt(program, material.runtime.licenseProfile);
  if (!sameBrushStudioData({ ...material, tuning }, expected)) {
    throw new Error("현재 재료를 같은 엔진·설정으로 편집할 수 없습니다. 원고는 유지됩니다.");
  }
  return program;
}
