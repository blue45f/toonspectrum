import type { CharacterCapabilityProfile } from "../../character-shaper/character-shaper-contract";
import type { CharacterCompatibilityGrade, CharacterCompatibilitySnapshotV2 } from "../document/character-document-v2";

export type CharacterCompatibilityFeatureId =
  | "identity"
  | "iris"
  | "expression"
  | "pose"
  | "wardrobe"
  | "accessories"
  | "authored-hair"
  | "surface-paint"
  | "semantic-psd";

export type CharacterCompatibilityFeatureStatus = "supported" | "partial" | "unsupported";

export interface CharacterCompatibilityFeature {
  readonly id: CharacterCompatibilityFeatureId;
  readonly label: string;
  readonly status: CharacterCompatibilityFeatureStatus;
  readonly reason: string;
}

export interface CharacterCompatibilityReport {
  readonly grade: CharacterCompatibilityGrade;
  readonly label: string;
  readonly summary: string;
  readonly features: readonly CharacterCompatibilityFeature[];
  readonly supportedCount: number;
  readonly partialCount: number;
  readonly unsupportedCount: number;
  readonly semanticMorphCount: number;
  readonly sourceRevision: string;
}

export interface CreateCharacterCompatibilityReportOptions {
  readonly canonical?: boolean;
  readonly sourceRevision?: string;
}

const FEATURE_LABELS: Readonly<Record<CharacterCompatibilityFeatureId, string>> = Object.freeze({
  identity: "얼굴·체형 조절",
  iris: "눈동자 색·크기",
  expression: "표정",
  pose: "포즈·손",
  wardrobe: "의상 피팅",
  accessories: "액세서리",
  "authored-hair": "모델 원본 헤어",
  "surface-paint": "표면 채색",
  "semantic-psd": "분리 PSD",
});

export function characterCompatibilityGradeLabel(grade: CharacterCompatibilityGrade): string {
  if (grade === "canonical") return "공식 품질";
  if (grade === "viewer") return "보기 전용";
  return `호환 ${grade}`;
}

function feature(
  id: CharacterCompatibilityFeatureId,
  status: CharacterCompatibilityFeatureStatus,
  reason: string,
): CharacterCompatibilityFeature {
  return Object.freeze({ id, label: FEATURE_LABELS[id], status, reason });
}

function presentArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function semanticMorphCount(profile: Partial<CharacterCapabilityProfile>): number {
  const morphs = profile.semanticMorphs;
  if (!morphs || typeof morphs !== "object") return 0;
  return Object.values(morphs).filter((provider) => provider != null).length;
}

function identityFeature(ready: boolean, count: number): CharacterCompatibilityFeature {
  if (!ready) return feature("identity", "unsupported", "캐릭터가 아직 준비되지 않았습니다.");
  if (count >= 7) return feature("identity", "supported", `의미 조절 ${count}개를 사용할 수 있습니다.`);
  if (count > 0) return feature("identity", "partial", `의미 조절 ${count}개만 사용할 수 있습니다.`);
  return feature("identity", "unsupported", "이 모델에서 안전한 얼굴 조절을 찾지 못했습니다.");
}

function gradeFor(input: {
  readonly canonical: boolean;
  readonly ready: boolean;
  readonly humanoid: boolean;
  readonly morphCount: number;
  readonly wardrobe: boolean;
  readonly props: boolean;
  readonly iris: boolean;
  readonly paint: boolean;
}): CharacterCompatibilityGrade {
  if (!input.ready) return "viewer";
  if (input.canonical) return "canonical";
  if (
    input.humanoid
    && input.morphCount >= 7
    && input.wardrobe
    && input.props
    && input.iris
    && input.paint
  ) return "A";
  if (input.humanoid && input.morphCount >= 4) return "B";
  if (input.humanoid || input.morphCount > 0) return "C";
  return "viewer";
}

export function createCharacterCompatibilityReport(
  profileInput: Partial<CharacterCapabilityProfile>,
  options: CreateCharacterCompatibilityReportOptions = {},
): CharacterCompatibilityReport {
  const ready = profileInput.status === "ready";
  const humanoid = profileInput.humanoid === true;
  const morphCount = semanticMorphCount(profileInput);
  const expressions = presentArray(profileInput.expressions);
  const costumeSlots = presentArray(profileInput.costumeSlots);
  const wardrobe = profileInput.wardrobeMetricsReady === true;
  const props = profileInput.propsReady === true;
  const iris = profileInput.irisTintable === true;
  const paint = profileInput.surfacePaintReady === true;
  const originalHairCount = typeof profileInput.originalHairMeshCount === "number"
    ? Math.max(0, Math.floor(profileInput.originalHairMeshCount))
    : 0;
  const canonical = options.canonical === true;

  const features = Object.freeze([
    identityFeature(ready, morphCount),
    iris
      ? feature("iris", "supported", "홍채를 다른 눈 재질과 분리해 조절할 수 있습니다.")
      : feature("iris", ready ? "partial" : "unsupported", "홍채 재질을 확실하게 분리하지 못했습니다."),
    expressions.length >= 5
      ? feature("expression", "supported", `표정 채널 ${expressions.length}개를 사용할 수 있습니다.`)
      : expressions.length > 0
        ? feature("expression", "partial", `표정 채널 ${expressions.length}개만 찾았습니다.`)
        : feature("expression", "unsupported", "표정 채널을 찾지 못했습니다."),
    humanoid
      ? feature("pose", "supported", "휴머노이드 리그로 포즈와 손을 적용할 수 있습니다.")
      : feature("pose", "unsupported", "휴머노이드 리그가 없어 포즈를 적용할 수 없습니다."),
    wardrobe
      ? feature("wardrobe", "supported", "몸 치수에 맞춰 의상을 배치할 수 있습니다.")
      : feature("wardrobe", ready ? "partial" : "unsupported", "의상 피팅에 필요한 몸 치수가 준비되지 않았습니다."),
    props
      ? feature("accessories", "supported", "액세서리 부착 지점을 사용할 수 있습니다.")
      : feature("accessories", ready ? "partial" : "unsupported", "액세서리 부착 기능을 확인하지 못했습니다."),
    originalHairCount > 0
      ? feature("authored-hair", "supported", `모델 원본 헤어 메시 ${originalHairCount}개를 찾았습니다.`)
      : feature("authored-hair", ready ? "partial" : "unsupported", "모델 원본 헤어를 찾지 못해 절차형 헤어만 사용할 수 있습니다."),
    paint
      ? feature("surface-paint", "supported", "읽을 수 있는 기본색 텍스처에 채색할 수 있습니다.")
      : feature("surface-paint", "unsupported", "칠할 수 있는 기본색 텍스처를 준비하지 못했습니다."),
    canonical
      ? feature("semantic-psd", "supported", "공식 시맨틱 파츠로 분리 PSD를 만들 수 있습니다.")
      : ready && (morphCount > 0 || costumeSlots.length > 0 || originalHairCount > 0)
        ? feature("semantic-psd", "partial", "이름·재질 구조에 따라 일부 PSD 레이어가 생략될 수 있습니다.")
        : feature("semantic-psd", "unsupported", "분리 PSD에 필요한 파츠 구조를 찾지 못했습니다."),
  ]);

  const grade = gradeFor({ canonical, ready, humanoid, morphCount, wardrobe, props, iris, paint });
  const supportedCount = features.filter((item) => item.status === "supported").length;
  const partialCount = features.filter((item) => item.status === "partial").length;
  const unsupportedCount = features.length - supportedCount - partialCount;
  const label = characterCompatibilityGradeLabel(grade);
  const summary = grade === "canonical"
    ? "ToonStudio 공식 캐릭터 규격을 충족합니다."
    : grade === "viewer"
      ? "기본 보기와 제한된 출력만 권장합니다."
      : `${label} · 완전 지원 ${supportedCount} · 일부 지원 ${partialCount} · 미지원 ${unsupportedCount}`;

  return Object.freeze({
    grade,
    label,
    summary,
    features,
    supportedCount,
    partialCount,
    unsupportedCount,
    semanticMorphCount: morphCount,
    sourceRevision: options.sourceRevision ?? "character-capability-profile-v1",
  });
}

export function characterCompatibilitySnapshot(
  report: CharacterCompatibilityReport,
): CharacterCompatibilitySnapshotV2 {
  return Object.freeze({
    grade: report.grade,
    supported: Object.freeze(report.features.filter((item) => item.status === "supported").map((item) => item.id)),
    partial: Object.freeze(report.features.filter((item) => item.status === "partial").map((item) => item.id)),
    unsupported: Object.freeze(report.features.filter((item) => item.status === "unsupported").map((item) => item.id)),
    sourceRevision: report.sourceRevision,
  });
}
