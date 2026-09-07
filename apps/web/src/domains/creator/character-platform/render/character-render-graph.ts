import type { CharacterCompatibilityReport } from "../compatibility/character-compatibility-report";
import type { CharacterCanonicalManifestV2 } from "../assets/character-canonical-manifest";

export type CharacterRenderPassIdV2 =
  | "beauty"
  | "base-color"
  | "cel-shadow"
  | "highlight"
  | "outer-outline"
  | "inner-line"
  | "hair-base"
  | "hair-shadow"
  | "hair-line"
  | "surface-paint"
  | "surface-ink"
  | "part-id"
  | "material-id"
  | "depth"
  | "normal"
  | "ambient-occlusion";

export type CharacterRenderPassAvailability = "available" | "conditional" | "unavailable";

export interface CharacterRenderPassDefinition {
  readonly id: CharacterRenderPassIdV2;
  readonly label: string;
  readonly group: "beauty" | "line" | "hair" | "authoring" | "utility";
  readonly dependencies: readonly CharacterRenderPassIdV2[];
  readonly defaultEnabled: boolean;
}

export interface CharacterRenderPassPlan extends CharacterRenderPassDefinition {
  readonly availability: CharacterRenderPassAvailability;
  readonly reason: string | null;
  readonly renderer: "canonical" | "compatibility" | "postprocess";
}

export interface CharacterRenderGraphPlan {
  readonly mode: "canonical" | "compatibility";
  readonly passes: readonly CharacterRenderPassPlan[];
  readonly enabled: readonly CharacterRenderPassIdV2[];
  readonly warnings: readonly string[];
}

const DEFINITIONS: readonly CharacterRenderPassDefinition[] = Object.freeze([
  { id: "beauty", label: "완성 이미지", group: "beauty", dependencies: [], defaultEnabled: true },
  { id: "base-color", label: "밑색", group: "beauty", dependencies: [], defaultEnabled: true },
  { id: "cel-shadow", label: "음영", group: "beauty", dependencies: ["base-color"], defaultEnabled: true },
  { id: "highlight", label: "하이라이트", group: "beauty", dependencies: ["base-color"], defaultEnabled: true },
  { id: "outer-outline", label: "외곽선", group: "line", dependencies: [], defaultEnabled: true },
  { id: "inner-line", label: "내부선", group: "line", dependencies: [], defaultEnabled: true },
  { id: "hair-base", label: "헤어 밑색", group: "hair", dependencies: ["base-color"], defaultEnabled: true },
  { id: "hair-shadow", label: "헤어 음영", group: "hair", dependencies: ["hair-base"], defaultEnabled: true },
  { id: "hair-line", label: "헤어 선", group: "hair", dependencies: ["outer-outline"], defaultEnabled: true },
  { id: "surface-paint", label: "표면 채색", group: "authoring", dependencies: [], defaultEnabled: true },
  { id: "surface-ink", label: "3D 펜선", group: "authoring", dependencies: [], defaultEnabled: true },
  { id: "part-id", label: "파츠 ID", group: "utility", dependencies: [], defaultEnabled: false },
  { id: "material-id", label: "재질 ID", group: "utility", dependencies: [], defaultEnabled: false },
  { id: "depth", label: "깊이", group: "utility", dependencies: [], defaultEnabled: false },
  { id: "normal", label: "노멀", group: "utility", dependencies: [], defaultEnabled: false },
  { id: "ambient-occlusion", label: "앰비언트 오클루전", group: "utility", dependencies: ["depth", "normal"], defaultEnabled: false },
]);

function featureStatus(
  report: CharacterCompatibilityReport,
  id: CharacterCompatibilityReport["features"][number]["id"],
): CharacterCompatibilityReport["features"][number]["status"] | null {
  return report.features.find((feature) => feature.id === id)?.status ?? null;
}

function canonicalSupports(manifest: CharacterCanonicalManifestV2 | null, pass: CharacterRenderPassIdV2): boolean {
  if (!manifest) return false;
  if (["beauty", "base-color", "cel-shadow", "highlight", "outer-outline", "inner-line"].includes(pass)) return true;
  if (pass.startsWith("hair-")) {
    return Boolean(manifest.semantics.renderIds["hair-front"] || manifest.semantics.renderIds["hair-back"]);
  }
  if (pass === "surface-paint" || pass === "surface-ink") return true;
  if (["part-id", "material-id", "depth", "normal", "ambient-occlusion"].includes(pass)) return true;
  return false;
}

function planCompatibilityPass(
  definition: CharacterRenderPassDefinition,
  report: CharacterCompatibilityReport,
  hasSurfacePaint: boolean,
  hasSurfaceInk: boolean,
): CharacterRenderPassPlan {
  if (definition.id === "beauty") {
    return { ...definition, availability: "available", reason: null, renderer: "compatibility" };
  }
  if (["base-color", "cel-shadow", "highlight", "outer-outline", "inner-line"].includes(definition.id)) {
    const status = featureStatus(report, "semantic-psd");
    return status === "unsupported"
      ? { ...definition, availability: "conditional", reason: "이미지 차분과 선 검출로 근사합니다.", renderer: "postprocess" }
      : { ...definition, availability: "conditional", reason: "모델 재질 구조에 따라 결과가 달라질 수 있습니다.", renderer: "postprocess" };
  }
  if (definition.id.startsWith("hair-")) {
    return featureStatus(report, "authored-hair") === "supported"
      ? { ...definition, availability: "conditional", reason: "헤어 메시·재질 이름을 기준으로 분리합니다.", renderer: "compatibility" }
      : { ...definition, availability: "unavailable", reason: "분리 가능한 원본 헤어를 찾지 못했습니다.", renderer: "compatibility" };
  }
  if (definition.id === "surface-paint") {
    return hasSurfacePaint
      ? { ...definition, availability: "available", reason: null, renderer: "compatibility" }
      : { ...definition, availability: "unavailable", reason: "표면 채색 레이어가 없습니다.", renderer: "compatibility" };
  }
  if (definition.id === "surface-ink") {
    return hasSurfaceInk
      ? { ...definition, availability: "available", reason: null, renderer: "compatibility" }
      : { ...definition, availability: "unavailable", reason: "3D 펜선 레이어가 없습니다.", renderer: "compatibility" };
  }
  if (definition.id === "part-id" || definition.id === "material-id") {
    return featureStatus(report, "semantic-psd") === "unsupported"
      ? { ...definition, availability: "unavailable", reason: "시맨틱 파츠 구조가 없습니다.", renderer: "compatibility" }
      : { ...definition, availability: "conditional", reason: "모델 이름과 재질 구조로 추정합니다.", renderer: "compatibility" };
  }
  if (definition.id === "depth" || definition.id === "normal") {
    return { ...definition, availability: "available", reason: null, renderer: "compatibility" };
  }
  return { ...definition, availability: "conditional", reason: "깊이와 노멀 패스에서 후처리합니다.", renderer: "postprocess" };
}

export function createCharacterRenderGraphPlan(input: {
  readonly compatibility: CharacterCompatibilityReport;
  readonly canonicalManifest?: CharacterCanonicalManifestV2 | null;
  readonly hasSurfacePaint?: boolean;
  readonly hasSurfaceInk?: boolean;
  readonly requested?: readonly CharacterRenderPassIdV2[];
}): CharacterRenderGraphPlan {
  const canonical = input.compatibility.grade === "canonical" && Boolean(input.canonicalManifest);
  const passes = Object.freeze(DEFINITIONS.map((definition): CharacterRenderPassPlan => {
    if (!canonical) {
      return Object.freeze(planCompatibilityPass(
        definition,
        input.compatibility,
        input.hasSurfacePaint === true,
        input.hasSurfaceInk === true,
      ));
    }
    if (definition.id === "surface-paint" && !input.hasSurfacePaint) {
      return Object.freeze({ ...definition, availability: "unavailable", reason: "표면 채색 레이어가 없습니다.", renderer: "canonical" });
    }
    if (definition.id === "surface-ink" && !input.hasSurfaceInk) {
      return Object.freeze({ ...definition, availability: "unavailable", reason: "3D 펜선 레이어가 없습니다.", renderer: "canonical" });
    }
    return Object.freeze(canonicalSupports(input.canonicalManifest ?? null, definition.id)
      ? { ...definition, availability: "available", reason: null, renderer: "canonical" as const }
      : { ...definition, availability: "unavailable", reason: "공식 캐릭터 매니페스트가 이 패스를 제공하지 않습니다.", renderer: "canonical" as const });
  }));
  const requested = new Set(input.requested ?? DEFINITIONS.filter((item) => item.defaultEnabled).map((item) => item.id));
  const enabled = new Set<CharacterRenderPassIdV2>();
  const visit = (id: CharacterRenderPassIdV2): void => {
    const pass = passes.find((item) => item.id === id);
    if (!pass || pass.availability === "unavailable" || enabled.has(id)) return;
    for (const dependency of pass.dependencies) visit(dependency);
    enabled.add(id);
  };
  for (const id of requested) visit(id);
  const warnings = passes
    .filter((pass) => requested.has(pass.id) && pass.availability !== "available")
    .map((pass) => `${pass.label}: ${pass.reason ?? "지원 여부를 확인할 수 없습니다."}`);
  return Object.freeze({
    mode: canonical ? "canonical" : "compatibility",
    passes,
    enabled: Object.freeze([...enabled]),
    warnings: Object.freeze(warnings),
  });
}

export function characterRenderPassDefinition(id: CharacterRenderPassIdV2): CharacterRenderPassDefinition {
  const value = DEFINITIONS.find((definition) => definition.id === id);
  if (!value) throw new Error(`알 수 없는 캐릭터 렌더 패스: ${id}`);
  return value;
}
