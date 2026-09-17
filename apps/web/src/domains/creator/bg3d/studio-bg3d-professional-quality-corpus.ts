import type {
  StudioBg3dEngineBenchmarkApprovedCorpusItem,
  StudioBg3dEngineBenchmarkSceneClass,
} from "./studio-bg3d-engine-benchmark-contract";

export const STUDIO_BG3D_PROFESSIONAL_QUALITY_CORPUS_VERSION = 1 as const;

export type StudioBg3dProfessionalQualityPass =
  | "beauty"
  | "depth"
  | "normal"
  | "object-id"
  | "material-id"
  | "shadow"
  | "emission"
  | "velocity"
  | "line";

export type StudioBg3dProfessionalScenarioRole =
  | "lifecycle"
  | "environment"
  | "character"
  | "material"
  | "scale";

export interface StudioBg3dProfessionalPerformanceBudget {
  readonly desktopFrameP95Ms: number;
  readonly mobileFrameP95Ms: number;
  readonly inputLatencyP95Ms: number;
}

export interface StudioBg3dProfessionalQualityScenario {
  readonly id: string;
  readonly label: string;
  readonly role: StudioBg3dProfessionalScenarioRole;
  readonly sceneClass: StudioBg3dEngineBenchmarkSceneClass;
  readonly templateId: string | null;
  readonly captureWidth: number;
  readonly captureHeight: number;
  readonly benchmarkCritical: boolean;
  readonly requiredCapabilities: readonly string[];
  readonly requiredPasses: readonly StudioBg3dProfessionalQualityPass[];
  readonly budget: StudioBg3dProfessionalPerformanceBudget;
}

const STANDARD_BUDGET: StudioBg3dProfessionalPerformanceBudget = Object.freeze({
  desktopFrameP95Ms: 16.7,
  mobileFrameP95Ms: 33.3,
  inputLatencyP95Ms: 100,
});

const CORE_PASSES = Object.freeze([
  "beauty",
  "depth",
  "normal",
  "object-id",
  "material-id",
  "shadow",
  "line",
] as const satisfies readonly StudioBg3dProfessionalQualityPass[]);

function scenario(
  value: Omit<StudioBg3dProfessionalQualityScenario, "budget"> & {
    readonly budget?: StudioBg3dProfessionalPerformanceBudget;
  },
): StudioBg3dProfessionalQualityScenario {
  return Object.freeze({
    ...value,
    requiredCapabilities: Object.freeze([...value.requiredCapabilities]),
    requiredPasses: Object.freeze([...value.requiredPasses]),
    budget: Object.freeze({ ...(value.budget ?? STANDARD_BUDGET) }),
  });
}

export const STUDIO_BG3D_PROFESSIONAL_QUALITY_CORPUS = Object.freeze([
  scenario({
    id: "empty-scene-lifecycle",
    label: "빈 장면 수명주기",
    role: "lifecycle",
    sceneClass: "small",
    templateId: null,
    captureWidth: 1080,
    captureHeight: 1920,
    benchmarkCritical: false,
    requiredCapabilities: ["open-close", "dispose", "context-restore"],
    requiredPasses: ["beauty", "depth", "object-id"],
  }),
  scenario({
    id: "small-classroom",
    label: "소형 실내 교실",
    role: "environment",
    sceneClass: "small",
    templateId: "classroom",
    captureWidth: 1080,
    captureHeight: 1920,
    benchmarkCritical: true,
    requiredCapabilities: ["hierarchy", "transform", "capture", "round-trip"],
    requiredPasses: CORE_PASSES,
  }),
  scenario({
    id: "medium-street",
    label: "중형 거리 장면",
    role: "environment",
    sceneClass: "medium",
    templateId: "street_avenue",
    captureWidth: 1080,
    captureHeight: 1920,
    benchmarkCritical: true,
    requiredCapabilities: ["instancing", "hierarchy", "camera", "capture"],
    requiredPasses: CORE_PASSES,
  }),
  scenario({
    id: "large-fantasy-hall",
    label: "대형 판타지 홀",
    role: "scale",
    sceneClass: "large",
    templateId: "fantasy_dungeon_hall",
    captureWidth: 1920,
    captureHeight: 1080,
    benchmarkCritical: true,
    requiredCapabilities: ["large-scene", "lod", "shadow-frustum", "capture"],
    requiredPasses: CORE_PASSES,
  }),
  scenario({
    id: "single-character-stage",
    label: "단일 캐릭터 연출",
    role: "character",
    sceneClass: "medium",
    templateId: "rooftop",
    captureWidth: 1080,
    captureHeight: 1920,
    benchmarkCritical: false,
    requiredCapabilities: ["vrm", "pose", "grounding", "expression", "prop-contact"],
    requiredPasses: [...CORE_PASSES, "velocity"],
  }),
  scenario({
    id: "multi-character-stage",
    label: "다중 캐릭터 공유 장면",
    role: "character",
    sceneClass: "large",
    templateId: "station_plaza",
    captureWidth: 1080,
    captureHeight: 1920,
    benchmarkCritical: false,
    requiredCapabilities: ["multi-vrm", "shared-stage", "capture-authority", "shot"],
    requiredPasses: [...CORE_PASSES, "velocity"],
  }),
  scenario({
    id: "transparent-emissive-night",
    label: "투명·발광 야간 장면",
    role: "material",
    sceneClass: "medium",
    templateId: "convenience_store",
    captureWidth: 1080,
    captureHeight: 1920,
    benchmarkCritical: false,
    requiredCapabilities: ["transparent-material", "emission", "straight-alpha", "bloom"],
    requiredPasses: [...CORE_PASSES, "emission"],
  }),
  scenario({
    id: "repeated-props-stress",
    label: "반복 소품·인스턴싱 스트레스",
    role: "scale",
    sceneClass: "large",
    templateId: "park_plaza",
    captureWidth: 1920,
    captureHeight: 1080,
    benchmarkCritical: false,
    requiredCapabilities: ["instancing", "selection", "undo-redo", "memory-stability"],
    requiredPasses: CORE_PASSES,
  }),
] as const);

export function createStudioBg3dProfessionalBenchmarkManifest(): readonly StudioBg3dEngineBenchmarkApprovedCorpusItem[] {
  return Object.freeze(
    STUDIO_BG3D_PROFESSIONAL_QUALITY_CORPUS
      .filter((entry) => entry.benchmarkCritical)
      .map((entry) => Object.freeze({
        corpusItemId: entry.id,
        sceneClass: entry.sceneClass,
        captureWidth: entry.captureWidth,
        captureHeight: entry.captureHeight,
      })),
  );
}
