export const CHARACTER_CAPABILITY_EVIDENCE_VERSION = 1 as const;

export const CHARACTER_CAPABILITY_EVIDENCE_LEVELS = [
  "declared",
  "probed",
  "fixture-validated",
  "artist-approved",
  "production",
] as const;

export type CharacterCapabilityEvidenceLevel =
  (typeof CHARACTER_CAPABILITY_EVIDENCE_LEVELS)[number];

export interface CharacterCapabilityEvidenceV1 {
  readonly schemaVersion: typeof CHARACTER_CAPABILITY_EVIDENCE_VERSION;
  readonly capabilityId: string;
  readonly level: CharacterCapabilityEvidenceLevel;
  readonly assetContentHash: string;
  readonly rendererRevision?: string;
  readonly observedAt: string;
  readonly expiresAt?: string;
  readonly artifactRefs: readonly string[];
  readonly approverId?: string;
  readonly notes?: readonly string[];
}

export interface CharacterCapabilityPresentation {
  readonly label: "선언됨" | "실험" | "검증 중" | "작가 승인" | "지원";
  readonly production: boolean;
  readonly tone: "neutral" | "info" | "warning" | "good";
  readonly evidenceCount: number;
}

export class CharacterCapabilityEvidenceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CharacterCapabilityEvidenceError";
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u;
const HASH = /^[a-f0-9]{64}$/iu;

function parseInstant(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CharacterCapabilityEvidenceError(
      "CHARACTER_CAPABILITY_TIME_INVALID",
      `${field} 시각이 ISO-8601 형식이 아닙니다.`,
    );
  }
  return parsed;
}

export function normalizeCharacterCapabilityEvidence(
  input: CharacterCapabilityEvidenceV1,
): CharacterCapabilityEvidenceV1 {
  if (input.schemaVersion !== CHARACTER_CAPABILITY_EVIDENCE_VERSION) {
    throw new CharacterCapabilityEvidenceError(
      "CHARACTER_CAPABILITY_VERSION_UNSUPPORTED",
      "지원하지 않는 capability evidence 버전입니다.",
    );
  }
  if (!ID.test(input.capabilityId)) {
    throw new CharacterCapabilityEvidenceError(
      "CHARACTER_CAPABILITY_ID_INVALID",
      "Capability ID 형식이 올바르지 않습니다.",
    );
  }
  if (!CHARACTER_CAPABILITY_EVIDENCE_LEVELS.includes(input.level)) {
    throw new CharacterCapabilityEvidenceError(
      "CHARACTER_CAPABILITY_LEVEL_INVALID",
      "지원하지 않는 capability evidence 단계입니다.",
    );
  }
  if (!HASH.test(input.assetContentHash)) {
    throw new CharacterCapabilityEvidenceError(
      "CHARACTER_CAPABILITY_HASH_INVALID",
      "자산 콘텐츠 해시는 SHA-256 형식이어야 합니다.",
    );
  }
  const observedAt = parseInstant(input.observedAt, "observedAt");
  const expiresAt = input.expiresAt ? parseInstant(input.expiresAt, "expiresAt") : null;
  if (expiresAt !== null && expiresAt <= observedAt) {
    throw new CharacterCapabilityEvidenceError(
      "CHARACTER_CAPABILITY_EXPIRY_INVALID",
      "Evidence 만료 시각은 관측 시각보다 늦어야 합니다.",
    );
  }
  if (input.level === "production" && input.artifactRefs.length === 0) {
    throw new CharacterCapabilityEvidenceError(
      "CHARACTER_CAPABILITY_PROOF_REQUIRED",
      "Production 지원 표시는 검증 Artifact를 필요로 합니다.",
    );
  }
  if (["artist-approved", "production"].includes(input.level) && !input.approverId) {
    throw new CharacterCapabilityEvidenceError(
      "CHARACTER_CAPABILITY_APPROVER_REQUIRED",
      "작가 승인 이상의 Evidence에는 승인자 ID가 필요합니다.",
    );
  }
  const artifacts = input.artifactRefs.map((ref) => {
    if (ref.trim().length === 0 || ref.length > 1024) {
      throw new CharacterCapabilityEvidenceError(
        "CHARACTER_CAPABILITY_ARTIFACT_INVALID",
        "Capability Artifact 참조가 올바르지 않습니다.",
      );
    }
    return ref.trim();
  });
  return Object.freeze({
    ...input,
    assetContentHash: input.assetContentHash.toLowerCase(),
    artifactRefs: Object.freeze([...new Set(artifacts)].sort()),
    notes: input.notes ? Object.freeze(input.notes.map((note) => note.trim()).filter(Boolean)) : undefined,
  });
}

export function presentCharacterCapabilityEvidence(
  input: CharacterCapabilityEvidenceV1,
  now = Date.now(),
): CharacterCapabilityPresentation {
  const evidence = normalizeCharacterCapabilityEvidence(input);
  const expired = evidence.expiresAt ? Date.parse(evidence.expiresAt) <= now : false;
  if (expired) {
    return Object.freeze({ label: "검증 중", production: false, tone: "warning", evidenceCount: evidence.artifactRefs.length });
  }
  switch (evidence.level) {
    case "declared":
      return Object.freeze({ label: "선언됨", production: false, tone: "neutral", evidenceCount: evidence.artifactRefs.length });
    case "probed":
      return Object.freeze({ label: "실험", production: false, tone: "info", evidenceCount: evidence.artifactRefs.length });
    case "fixture-validated":
      return Object.freeze({ label: "검증 중", production: false, tone: "info", evidenceCount: evidence.artifactRefs.length });
    case "artist-approved":
      return Object.freeze({ label: "작가 승인", production: false, tone: "good", evidenceCount: evidence.artifactRefs.length });
    case "production":
      return Object.freeze({ label: "지원", production: true, tone: "good", evidenceCount: evidence.artifactRefs.length });
  }
}

export function canPromoteCharacterCapabilityEvidence(
  from: CharacterCapabilityEvidenceLevel,
  to: CharacterCapabilityEvidenceLevel,
): boolean {
  const fromIndex = CHARACTER_CAPABILITY_EVIDENCE_LEVELS.indexOf(from);
  const toIndex = CHARACTER_CAPABILITY_EVIDENCE_LEVELS.indexOf(to);
  return toIndex === fromIndex || toIndex === fromIndex + 1;
}
