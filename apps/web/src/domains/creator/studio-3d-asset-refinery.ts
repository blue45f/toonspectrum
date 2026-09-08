import type {
  StudioAssetRightsManifestResult,
} from "./studio-asset-rights-manifest";
import type {
  Studio3dAssetQualityPassport,
} from "./studio-3d-asset-quality";
import type {
  Studio3dAssetSupplyDecision,
} from "./studio-3d-asset-supply";

export const STUDIO_3D_ASSET_REFINERY_RECEIPT_SCHEMA =
  "toonspectrum.studio-3d-asset-refinery-receipt" as const;
export const STUDIO_3D_ASSET_REFINERY_RECEIPT_VERSION = 1 as const;

export const STUDIO_3D_ASSET_REFINERY_STAGES = [
  "received",
  "quarantined",
  "rights_checked",
  "analyzed",
  "normalized",
  "repaired",
  "optimized",
  "technical_qa",
  "render_qa",
  "art_review",
  "approved",
  "published",
  "rejected",
  "withdrawn",
] as const;
export type Studio3dAssetRefineryStage =
  (typeof STUDIO_3D_ASSET_REFINERY_STAGES)[number];

export const STUDIO_3D_ASSET_REFINERY_TRANSITIONS = {
  received: ["quarantined", "rejected"],
  quarantined: ["rights_checked", "rejected"],
  rights_checked: ["analyzed", "rejected"],
  analyzed: ["normalized", "rejected"],
  normalized: ["repaired", "optimized", "rejected"],
  repaired: ["optimized", "rejected"],
  optimized: ["technical_qa", "rejected"],
  technical_qa: ["render_qa", "rejected"],
  render_qa: ["art_review", "rejected"],
  art_review: ["approved", "rejected"],
  approved: ["published", "rejected"],
  published: ["withdrawn"],
  rejected: [],
  withdrawn: [],
} as const satisfies Readonly<
  Record<Studio3dAssetRefineryStage, readonly Studio3dAssetRefineryStage[]>
>;

export type Studio3dAssetRefineryDiagnosticSeverity = "info" | "warning" | "error";

export interface Studio3dAssetRefineryDiagnostic {
  readonly code: string;
  readonly severity: Studio3dAssetRefineryDiagnosticSeverity;
  readonly message: string;
}

export interface Studio3dAssetRefineryOutput {
  readonly kind: string;
  readonly reference: string;
  readonly sha256: string;
}

export interface Studio3dAssetRefineryEvent {
  readonly from: Studio3dAssetRefineryStage | null;
  readonly to: Studio3dAssetRefineryStage;
  readonly at: string;
  readonly actor: string;
  readonly reason: string;
  readonly diagnostics: readonly Studio3dAssetRefineryDiagnostic[];
  readonly resolvedDiagnosticCodes?: readonly string[];
  readonly outputs: readonly Studio3dAssetRefineryOutput[];
}

export interface Studio3dAssetRefineryReceipt {
  readonly schema: typeof STUDIO_3D_ASSET_REFINERY_RECEIPT_SCHEMA;
  readonly version: typeof STUDIO_3D_ASSET_REFINERY_RECEIPT_VERSION;
  readonly assetId: string;
  readonly assetVersion: string;
  readonly inputSha256: string;
  readonly pipelineVersion: string;
  readonly stage: Studio3dAssetRefineryStage;
  readonly history: readonly Studio3dAssetRefineryEvent[];
  readonly diagnostics: readonly Studio3dAssetRefineryDiagnostic[];
  readonly outputs: readonly Studio3dAssetRefineryOutput[];
}

export interface Studio3dAssetRefineryCreateInput {
  readonly assetId: string;
  readonly assetVersion: string;
  readonly inputSha256: string;
  readonly pipelineVersion: string;
  readonly receivedAt: string;
  readonly actor: string;
  readonly reason?: string;
}

export interface Studio3dAssetRefineryTransitionInput {
  readonly to: Studio3dAssetRefineryStage;
  readonly at: string;
  readonly actor: string;
  readonly reason: string;
  readonly diagnostics?: readonly Studio3dAssetRefineryDiagnostic[];
  /** Only a repaired transition may explicitly resolve currently active error codes. */
  readonly resolvedDiagnosticCodes?: readonly string[];
  readonly outputs?: readonly Studio3dAssetRefineryOutput[];
}

export const STUDIO_3D_ASSET_RELEASE_DIAGNOSTIC_CODES = [
  "ASSET_ID_MISMATCH",
  "ASSET_VERSION_MISMATCH",
  "REFINERY_NOT_APPROVED",
  "REFINERY_ERRORS_PRESENT",
  "QUALITY_NOT_APPROVED",
  "SUPPLY_NOT_APPROVED",
  "RIGHTS_PREFLIGHT_NOT_APPROVED",
  "RIGHTS_ASSET_VERSION_MISSING",
] as const;
export type Studio3dAssetReleaseDiagnosticCode =
  (typeof STUDIO_3D_ASSET_RELEASE_DIAGNOSTIC_CODES)[number];

export interface Studio3dAssetReleaseDiagnostic {
  readonly code: Studio3dAssetReleaseDiagnosticCode;
  readonly message: string;
}

export interface Studio3dAssetReleaseGateInput {
  readonly refinery: Studio3dAssetRefineryReceipt;
  readonly quality: Studio3dAssetQualityPassport;
  readonly supply: Studio3dAssetSupplyDecision;
  readonly rights: Pick<
    StudioAssetRightsManifestResult,
    "readyForPublishPreflight" | "assets"
  >;
}

export interface Studio3dAssetReleaseDecision {
  readonly assetId: string;
  readonly assetVersion: string;
  readonly allowed: boolean;
  readonly diagnostics: readonly Studio3dAssetReleaseDiagnostic[];
}

const STAGE_SET = new Set<string>(STUDIO_3D_ASSET_REFINERY_STAGES);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some(character => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
  });
}

function requiredText(value: string, field: string, maximumLength: number): string {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > maximumLength || hasControlCharacters(normalized)) {
    throw new TypeError(`${field} 값이 올바르지 않습니다.`);
  }
  return normalized;
}

function timestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError("Refinery 이벤트 시각이 올바르지 않습니다.");
  return new Date(parsed).toISOString();
}

function diagnostic(
  value: Studio3dAssetRefineryDiagnostic
): Studio3dAssetRefineryDiagnostic {
  if (!["info", "warning", "error"].includes(value.severity)) {
    throw new TypeError("Refinery 진단 심각도가 올바르지 않습니다.");
  }
  return Object.freeze({
    code: requiredText(value.code, "diagnostic.code", 120),
    severity: value.severity,
    message: requiredText(value.message, "diagnostic.message", 500),
  });
}

function output(value: Studio3dAssetRefineryOutput): Studio3dAssetRefineryOutput {
  const sha256 = value.sha256.toLocaleLowerCase("en-US");
  if (!SHA256_PATTERN.test(sha256)) throw new TypeError("출력 파일 SHA-256이 올바르지 않습니다.");
  return Object.freeze({
    kind: requiredText(value.kind, "output.kind", 80),
    reference: requiredText(value.reference, "output.reference", 500),
    sha256,
  });
}

function freezeEvent(
  from: Studio3dAssetRefineryStage | null,
  input: Studio3dAssetRefineryTransitionInput
): Studio3dAssetRefineryEvent {
  const diagnostics = Object.freeze((input.diagnostics ?? []).map(diagnostic));
  const resolvedDiagnosticCodes = Object.freeze([...new Set(
    (input.resolvedDiagnosticCodes ?? []).map(code => requiredText(code, "resolvedDiagnosticCode", 120))
  )]);
  const outputs = Object.freeze((input.outputs ?? []).map(output));
  return Object.freeze({
    from,
    to: input.to,
    at: timestamp(input.at),
    actor: requiredText(input.actor, "actor", 80),
    reason: requiredText(input.reason, "reason", 500),
    diagnostics,
    resolvedDiagnosticCodes,
    outputs,
  });
}

export function createStudio3dAssetRefineryReceipt(
  input: Studio3dAssetRefineryCreateInput
): Studio3dAssetRefineryReceipt {
  const inputSha256 = input.inputSha256.toLocaleLowerCase("en-US");
  if (!SHA256_PATTERN.test(inputSha256)) throw new TypeError("입력 파일 SHA-256이 올바르지 않습니다.");
  const event = freezeEvent(null, {
    to: "received",
    at: input.receivedAt,
    actor: input.actor,
    reason: input.reason ?? "원본 에셋을 격리 수신했습니다.",
  });
  return Object.freeze({
    schema: STUDIO_3D_ASSET_REFINERY_RECEIPT_SCHEMA,
    version: STUDIO_3D_ASSET_REFINERY_RECEIPT_VERSION,
    assetId: requiredText(input.assetId, "assetId", 160),
    assetVersion: requiredText(input.assetVersion, "assetVersion", 160),
    inputSha256,
    pipelineVersion: requiredText(input.pipelineVersion, "pipelineVersion", 80),
    stage: "received",
    history: Object.freeze([event]),
    diagnostics: Object.freeze([]),
    outputs: Object.freeze([]),
  });
}

export function transitionStudio3dAssetRefinery(
  receipt: Studio3dAssetRefineryReceipt,
  input: Studio3dAssetRefineryTransitionInput
): Studio3dAssetRefineryReceipt {
  if (!STAGE_SET.has(input.to)) throw new TypeError("알 수 없는 Refinery 단계입니다.");
  const allowedTransitions: readonly Studio3dAssetRefineryStage[] =
    STUDIO_3D_ASSET_REFINERY_TRANSITIONS[receipt.stage];
  if (!allowedTransitions.includes(input.to)) {
    throw new Error(`${receipt.stage} 단계에서 ${input.to} 단계로 전환할 수 없습니다.`);
  }
  const event = freezeEvent(receipt.stage, input);
  if (Date.parse(event.at) < Date.parse(receipt.history.at(-1)?.at ?? "")) {
    throw new RangeError("Refinery 이벤트 시각은 이전 이벤트보다 빠를 수 없습니다.");
  }
  const currentDiagnostics = new Map(receipt.diagnostics.map(entry => [entry.code, entry]));
  const resolved = event.resolvedDiagnosticCodes ?? [];
  if (resolved.length > 0 && input.to !== "repaired") {
    throw new Error("Refinery errors can only be resolved in the repaired stage.");
  }
  for (const code of resolved) {
    if (currentDiagnostics.get(code)?.severity !== "error") {
      throw new Error(`No active refinery error exists for resolution: ${code}`);
    }
    currentDiagnostics.delete(code);
  }
  // Explicit repairs and re-diagnosis update current outcomes; history retains every finding.
  // Apply new findings last so a recurring error stays active even in its repair event.
  for (const entry of event.diagnostics) currentDiagnostics.set(entry.code, entry);
  return Object.freeze({
    ...receipt,
    stage: input.to,
    history: Object.freeze([...receipt.history, event]),
    diagnostics: Object.freeze([...currentDiagnostics.values()]),
    outputs: Object.freeze([...receipt.outputs, ...event.outputs]),
  });
}

export function evaluateStudio3dAssetRelease(
  input: Studio3dAssetReleaseGateInput
): Studio3dAssetReleaseDecision {
  const diagnostics = new Map<
    Studio3dAssetReleaseDiagnosticCode,
    Studio3dAssetReleaseDiagnostic
  >();
  const add = (code: Studio3dAssetReleaseDiagnosticCode, message: string): void => {
    if (!diagnostics.has(code)) diagnostics.set(code, Object.freeze({ code, message }));
  };

  if (input.refinery.assetId !== input.quality.assetId
    || input.refinery.assetId !== input.supply.assetId) {
    add("ASSET_ID_MISMATCH", "Refinery, 품질 Passport, 공급 증빙의 에셋 ID가 다릅니다.");
  }
  if (input.refinery.assetVersion !== input.quality.assetVersion
    || input.refinery.assetVersion !== input.supply.assetVersion) {
    add("ASSET_VERSION_MISMATCH", "Refinery, 품질 Passport, 공급 증빙의 버전이 다릅니다.");
  }
  if (input.refinery.stage !== "approved") {
    add("REFINERY_NOT_APPROVED", "Refinery가 기술·렌더·아트 검수를 모두 승인하지 않았습니다.");
  }
  if (input.refinery.diagnostics.some(entry => entry.severity === "error")) {
    add("REFINERY_ERRORS_PRESENT", "Refinery 영수증에 해결되지 않은 오류가 남아 있습니다.");
  }
  if (!input.quality.readyForPublication) {
    add("QUALITY_NOT_APPROVED", "품질 점수, 하드 실패 또는 런타임 예산 기준을 통과하지 못했습니다.");
  }
  if (!input.supply.allowedForPublicCatalog) {
    add("SUPPLY_NOT_APPROVED", "공급원별 권리·격리·재배포 정책을 통과하지 못했습니다.");
  }
  if (!input.rights.readyForPublishPreflight) {
    add("RIGHTS_PREFLIGHT_NOT_APPROVED", "작품 권리 명세의 게시 사전 점검을 통과하지 못했습니다.");
  }
  const matchingRightsAsset = input.rights.assets.some(asset =>
    asset.assetId === input.refinery.assetId
    && asset.assetVersion === input.refinery.assetVersion
  );
  if (!matchingRightsAsset) {
    add(
      "RIGHTS_ASSET_VERSION_MISSING",
      "동일한 에셋 ID와 불변 버전을 가진 권리 명세 항목이 없습니다."
    );
  }

  const result = Object.freeze([...diagnostics.values()]);
  return Object.freeze({
    assetId: input.refinery.assetId,
    assetVersion: input.refinery.assetVersion,
    allowed: result.length === 0,
    diagnostics: result,
  });
}

export function publishStudio3dAsset(
  input: Studio3dAssetReleaseGateInput,
  publication: Omit<Studio3dAssetRefineryTransitionInput, "to">
): Studio3dAssetRefineryReceipt {
  const decision = evaluateStudio3dAssetRelease(input);
  if (!decision.allowed) {
    throw new Error(`3D 에셋 공개가 차단되었습니다: ${decision.diagnostics.map(({ code }) => code).join(", ")}`);
  }
  return transitionStudio3dAssetRefinery(input.refinery, {
    ...publication,
    to: "published",
  });
}
