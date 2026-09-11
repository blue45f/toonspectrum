import type { StudioAnalyticsEvent } from "./studio-analytics";
import type {
  StudioAutomationContext,
  StudioAutomationRecipe,
} from "./studio-automation-recipe";
import type { StudioPresentationSlide } from "./studio-presentation-layout";
import type { StudioStoryBeat } from "./studio-storyboard-planner";
import type {
  StudioTemplateDefinition,
  StudioTemplateValue,
} from "./studio-template-system";
import type {
  StudioCharacterVoiceProfile,
  StudioDialogueVoiceLine,
  StudioMotionCue,
  StudioVoiceSegment,
} from "./studio-voice-motion";
import type {
  StudioWebtoon3dRenderRequest,
  StudioWebtoon3dScene,
} from "./studio-webtoon-3d-render";
import type {
  StudioWebtoonBalloonMetric,
  StudioWebtoonCutMetric,
  StudioWebtoonReaderViewport,
} from "./studio-webtoon-quality";

export const STUDIO_PROJECT_FEATURE_SUITE_UPDATED_EVENT =
  "toonspectrum:studio-project-feature-suite-updated";

export interface StudioProjectFeatureSuiteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StudioProjectFeatureSuiteEventTarget {
  dispatchEvent(event: Event): boolean;
}

export interface StudioProjectFeatureSuiteState {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly updatedAt: string;
  readonly storyBeats: readonly StudioStoryBeat[];
  readonly quality: {
    readonly cuts: readonly StudioWebtoonCutMetric[];
    readonly balloons: readonly StudioWebtoonBalloonMetric[];
    readonly viewport: StudioWebtoonReaderViewport;
  };
  readonly render3d: {
    readonly scene: StudioWebtoon3dScene;
    readonly request: StudioWebtoon3dRenderRequest;
  };
  readonly voiceMotion: {
    readonly profiles: readonly StudioCharacterVoiceProfile[];
    readonly lines: readonly StudioDialogueVoiceLine[];
    readonly segments: readonly StudioVoiceSegment[];
    readonly cues: readonly StudioMotionCue[];
  };
  readonly design: {
    readonly template: StudioTemplateDefinition;
    readonly values: Readonly<Record<string, StudioTemplateValue>>;
    readonly slides: readonly StudioPresentationSlide[];
  };
  readonly analyticsEvents: readonly StudioAnalyticsEvent[];
  readonly automation: {
    readonly recipe: StudioAutomationRecipe;
    readonly context: StudioAutomationContext;
  };
}

export type StudioProjectFeatureSuiteUpdater = (
  current: StudioProjectFeatureSuiteState,
) => StudioProjectFeatureSuiteState;

function normalizedProjectId(projectId: string): string {
  const value = projectId.trim();
  if (!value || value === "." || value === ".." || value.includes("\\")) {
    throw new Error("A valid project id is required.");
  }
  return value;
}

function validTimestamp(value: string): string {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error("A valid feature-suite timestamp is required.");
  }
  return value;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function arrayOr<T>(value: unknown, fallback: readonly T[]): readonly T[] {
  return Array.isArray(value) ? value as readonly T[] : fallback;
}

export function studioProjectFeatureSuiteStorageKey(projectId: string): string {
  return `toonspectrum:studio-project-feature-suite:v1:${encodeURIComponent(normalizedProjectId(projectId))}`;
}

export function createDefaultStudioProjectFeatureSuite(
  projectId: string,
  updatedAt = new Date().toISOString(),
): StudioProjectFeatureSuiteState {
  const id = normalizedProjectId(projectId);
  const at = validTimestamp(updatedAt);
  const characterId = "character:lead";
  const lineId = "dialogue:intro";

  return {
    schemaVersion: 1,
    projectId: id,
    updatedAt: at,
    storyBeats: [
      {
        id: "beat:opening",
        sceneId: "scene:opening",
        order: 0,
        kind: "setup",
        summary: "주인공과 공간을 한눈에 보여 주는 도입 장면",
        dialogue: "",
        characterIds: [characterId],
        locationId: "location:opening",
      },
      {
        id: "beat:dialogue",
        sceneId: "scene:opening",
        order: 1,
        kind: "dialogue",
        summary: "주인공이 현재 문제를 독자에게 전달한다",
        dialogue: "이제 정말 시작해야 해.",
        characterIds: [characterId],
        locationId: "location:opening",
      },
      {
        id: "beat:reveal",
        sceneId: "scene:reveal",
        order: 2,
        kind: "reveal",
        summary: "다음 장면을 궁금하게 만드는 반전 정보를 공개한다",
        dialogue: "그런데 문이 먼저 열렸다.",
        characterIds: [characterId],
        locationId: "location:opening",
      },
    ],
    quality: {
      cuts: [
        {
          id: "cut:1",
          sceneId: "scene:opening",
          bounds: { x: 0, y: 0, width: 1080, height: 720 },
          faceRects: [{ x: 390, y: 180, width: 260, height: 260 }],
          dialogueCharacterCount: 18,
          balloonCount: 1,
          importance: 0.8,
        },
        {
          id: "cut:2",
          sceneId: "scene:opening",
          bounds: { x: 0, y: 840, width: 1080, height: 760 },
          faceRects: [{ x: 660, y: 980, width: 220, height: 220 }],
          dialogueCharacterCount: 36,
          balloonCount: 2,
          importance: 0.9,
        },
        {
          id: "cut:3",
          sceneId: "scene:reveal",
          bounds: { x: 0, y: 1760, width: 1080, height: 820 },
          faceRects: [{ x: 330, y: 1940, width: 320, height: 300 }],
          dialogueCharacterCount: 14,
          balloonCount: 1,
          importance: 1,
        },
      ],
      balloons: [
        {
          id: "balloon:1",
          cutId: "cut:1",
          kind: "dialogue",
          speakerId: characterId,
          bounds: { x: 70, y: 70, width: 360, height: 150 },
          text: "이제 정말 시작해야 해.",
          fontSize: 22,
          minimumFontSize: 18,
          readingOrder: 1,
          anchor: { x: 520, y: 310 },
        },
        {
          id: "balloon:2",
          cutId: "cut:2",
          kind: "thought",
          speakerId: characterId,
          bounds: { x: 90, y: 940, width: 410, height: 180 },
          text: "생각보다 조용한데…",
          fontSize: 19,
          minimumFontSize: 18,
          readingOrder: 1,
          anchor: { x: 700, y: 1100 },
        },
        {
          id: "balloon:3",
          cutId: "cut:3",
          kind: "shout",
          speakerId: characterId,
          bounds: { x: 590, y: 1840, width: 390, height: 170 },
          text: "누구야?",
          fontSize: 24,
          minimumFontSize: 18,
          readingOrder: 1,
          anchor: { x: 520, y: 2130 },
        },
      ],
      viewport: {
        width: 390,
        height: 844,
        safeInsetTop: 47,
        safeInsetBottom: 34,
      },
    },
    render3d: {
      scene: {
        id: "scene3d:opening-room",
        cameraId: "camera:main",
        lightRigId: "light:day",
        widthPx: 2160,
        heightPx: 1620,
        transparentBackground: true,
        assets: [
          {
            id: "asset3d:room",
            title: "Opening room",
            triangles: 185_000,
            materials: 12,
            hasNormals: true,
            hasUv: true,
            rightsStatus: "allowed",
          },
        ],
      },
      request: {
        passes: ["color", "line", "shadow", "depth", "object-mask"],
        output: "document-layers",
        lineStyleId: "line-style:webtoon-clean",
        preserveEditableScene: true,
      },
    },
    voiceMotion: {
      profiles: [
        {
          characterId,
          providerId: "provider:auto",
          voiceId: "voice:lead",
          locale: "ko-KR",
          speed: 1,
          pitch: 0,
          pronunciation: {},
          rights: {
            commercialUseAllowed: true,
            attributionRequired: false,
            attributionText: null,
            expiresAt: null,
          },
        },
      ],
      lines: [
        {
          id: lineId,
          characterId,
          locale: "ko-KR",
          text: "이제 정말 시작해야 해.",
          revision: 1,
        },
      ],
      segments: [],
      cues: [
        { id: "cue:opening", lineId: null, durationMs: 1_800, transitionMs: 0 },
        { id: "cue:dialogue", lineId, durationMs: 2_600, transitionMs: 250 },
        { id: "cue:reveal", lineId: null, durationMs: 2_100, transitionMs: 300 },
      ],
    },
    design: {
      template: {
        id: "template:episode-promo",
        version: 1,
        title: "Episode promotion",
        documentKind: "design",
        slots: [
          {
            id: "title",
            label: "작품 제목",
            kind: "text",
            required: true,
            maxLength: 32,
            minimum: null,
            maximum: null,
            acceptedAssetTypes: [],
            defaultValue: { kind: "text", value: "새 에피소드 공개" },
          },
          {
            id: "hero",
            label: "대표 이미지",
            kind: "image",
            required: true,
            maxLength: null,
            minimum: null,
            maximum: null,
            acceptedAssetTypes: ["image"],
            defaultValue: { kind: "image", assetId: "asset:image:hero", rightsStatus: "allowed" },
          },
          {
            id: "accent",
            label: "강조 색상",
            kind: "color",
            required: true,
            maxLength: null,
            minimum: null,
            maximum: null,
            acceptedAssetTypes: [],
            defaultValue: { kind: "color", value: "#f97316" },
          },
        ],
      },
      values: {
        title: { kind: "text", value: "새 에피소드 공개" },
        hero: { kind: "image", assetId: "asset:image:hero", rightsStatus: "allowed" },
        accent: { kind: "color", value: "#f97316" },
      },
      slides: [
        {
          id: "slide:cover",
          title: "작품 피칭",
          speakerNotes: "작품의 한 문장 가치와 주요 이미지를 소개합니다.",
          blocks: [
            {
              id: "block:title",
              kind: "title",
              bounds: { x: 0.08, y: 0.08, width: 0.84, height: 0.16 },
              text: "작품 피칭",
              fontSizePt: 34,
              assetRightsStatus: null,
            },
            {
              id: "block:image",
              kind: "image",
              bounds: { x: 0.08, y: 0.3, width: 0.5, height: 0.58 },
              text: "",
              fontSizePt: null,
              assetRightsStatus: "allowed",
            },
            {
              id: "block:body",
              kind: "body",
              bounds: { x: 0.62, y: 0.34, width: 0.3, height: 0.42 },
              text: "독자가 다음 컷을 넘기게 만드는 핵심 갈등과 차별점을 설명합니다.",
              fontSizePt: 18,
              assetRightsStatus: null,
            },
          ],
        },
      ],
    },
    analyticsEvents: [
      {
        id: "analytics:open:1",
        type: "episode-open",
        projectId: id,
        episodeId: "episode:1",
        locale: "ko-KR",
        anonymousSessionId: "anon:reader-1",
        occurredAt: at,
        value: null,
        amountMinor: null,
        currency: null,
      },
      {
        id: "analytics:scroll:1",
        type: "scroll-depth",
        projectId: id,
        episodeId: "episode:1",
        locale: "ko-KR",
        anonymousSessionId: "anon:reader-1",
        occurredAt: at,
        value: 0.86,
        amountMinor: null,
        currency: null,
      },
      {
        id: "analytics:complete:1",
        type: "episode-complete",
        projectId: id,
        episodeId: "episode:1",
        locale: "ko-KR",
        anonymousSessionId: "anon:reader-1",
        occurredAt: at,
        value: null,
        amountMinor: null,
        currency: null,
      },
      {
        id: "analytics:revenue:1",
        type: "revenue",
        projectId: id,
        episodeId: "episode:1",
        locale: "ko-KR",
        anonymousSessionId: "anon:finance",
        occurredAt: at,
        value: null,
        amountMinor: 350_000,
        currency: "KRW",
      },
      {
        id: "analytics:cost:1",
        type: "production-cost",
        projectId: id,
        episodeId: "episode:1",
        locale: "ko-KR",
        anonymousSessionId: "anon:finance",
        occurredAt: at,
        value: null,
        amountMinor: 125_000,
        currency: "KRW",
      },
    ],
    automation: {
      recipe: {
        id: "recipe:release",
        version: 1,
        name: "출판 준비 자동화",
        steps: [
          {
            id: "step:quality",
            commandId: "webtoon.quality.check",
            label: "모바일 가독성과 컷 리듬 검사",
            risk: "safe",
            conditions: [],
            requiredCapabilities: ["webtoon.quality"],
            requiresSelection: false,
          },
          {
            id: "step:preflight",
            commandId: "export.preflight",
            label: "플랫폼 규격과 사용 권리 검사",
            risk: "safe",
            conditions: [],
            requiredCapabilities: ["export.preflight"],
            requiresSelection: false,
          },
          {
            id: "step:publish",
            commandId: "publish.package",
            label: "게시용 파일 패키지 만들기",
            risk: "external-write",
            conditions: [],
            requiredCapabilities: ["publish.package"],
            requiresSelection: false,
          },
        ],
      },
      context: {
        facts: { projectReady: true },
        availableCapabilities: ["webtoon.quality", "export.preflight", "publish.package"],
        selectionAvailable: true,
        confirmedStepIds: [],
        allowedPaidStepIds: [],
      },
    },
  };
}

export function readStudioProjectFeatureSuite(
  storage: StudioProjectFeatureSuiteStorage,
  projectId: string,
): StudioProjectFeatureSuiteState | null {
  const id = normalizedProjectId(projectId);
  const raw = storage.getItem(studioProjectFeatureSuiteStorageKey(id));
  if (!raw) return null;
  try {
    const parsed = record(JSON.parse(raw));
    if (!parsed || parsed.schemaVersion !== 1 || parsed.projectId !== id) return null;
    const defaults = createDefaultStudioProjectFeatureSuite(id);
    const quality = record(parsed.quality);
    const render3d = record(parsed.render3d);
    const voiceMotion = record(parsed.voiceMotion);
    const design = record(parsed.design);
    const automation = record(parsed.automation);
    return {
      ...defaults,
      ...parsed,
      schemaVersion: 1,
      projectId: id,
      updatedAt: typeof parsed.updatedAt === "string" && Number.isFinite(Date.parse(parsed.updatedAt))
        ? parsed.updatedAt
        : defaults.updatedAt,
      storyBeats: arrayOr<StudioStoryBeat>(parsed.storyBeats, defaults.storyBeats),
      quality: {
        cuts: arrayOr<StudioWebtoonCutMetric>(quality?.cuts, defaults.quality.cuts),
        balloons: arrayOr<StudioWebtoonBalloonMetric>(quality?.balloons, defaults.quality.balloons),
        viewport: record(quality?.viewport)
          ? quality?.viewport as unknown as StudioWebtoonReaderViewport
          : defaults.quality.viewport,
      },
      render3d: {
        scene: record(render3d?.scene)
          ? render3d?.scene as unknown as StudioWebtoon3dScene
          : defaults.render3d.scene,
        request: record(render3d?.request)
          ? render3d?.request as unknown as StudioWebtoon3dRenderRequest
          : defaults.render3d.request,
      },
      voiceMotion: {
        profiles: arrayOr<StudioCharacterVoiceProfile>(voiceMotion?.profiles, defaults.voiceMotion.profiles),
        lines: arrayOr<StudioDialogueVoiceLine>(voiceMotion?.lines, defaults.voiceMotion.lines),
        segments: arrayOr<StudioVoiceSegment>(voiceMotion?.segments, defaults.voiceMotion.segments),
        cues: arrayOr<StudioMotionCue>(voiceMotion?.cues, defaults.voiceMotion.cues),
      },
      design: {
        template: record(design?.template)
          ? design?.template as unknown as StudioTemplateDefinition
          : defaults.design.template,
        values: record(design?.values)
          ? design?.values as unknown as Readonly<Record<string, StudioTemplateValue>>
          : defaults.design.values,
        slides: arrayOr<StudioPresentationSlide>(design?.slides, defaults.design.slides),
      },
      analyticsEvents: arrayOr<StudioAnalyticsEvent>(parsed.analyticsEvents, defaults.analyticsEvents),
      automation: {
        recipe: record(automation?.recipe)
          ? automation?.recipe as unknown as StudioAutomationRecipe
          : defaults.automation.recipe,
        context: record(automation?.context)
          ? automation?.context as unknown as StudioAutomationContext
          : defaults.automation.context,
      },
    } as StudioProjectFeatureSuiteState;
  } catch {
    return null;
  }
}

export function writeStudioProjectFeatureSuite(
  storage: StudioProjectFeatureSuiteStorage,
  state: StudioProjectFeatureSuiteState,
  target?: StudioProjectFeatureSuiteEventTarget,
): StudioProjectFeatureSuiteState {
  const id = normalizedProjectId(state.projectId);
  const next = {
    ...state,
    schemaVersion: 1 as const,
    projectId: id,
    updatedAt: validTimestamp(state.updatedAt),
  };
  storage.setItem(studioProjectFeatureSuiteStorageKey(id), JSON.stringify(next));
  target?.dispatchEvent(new CustomEvent(STUDIO_PROJECT_FEATURE_SUITE_UPDATED_EVENT, {
    detail: next,
  }));
  return next;
}

export function ensureStudioProjectFeatureSuite(
  storage: StudioProjectFeatureSuiteStorage,
  projectId: string,
): StudioProjectFeatureSuiteState {
  const current = readStudioProjectFeatureSuite(storage, projectId);
  if (current) return current;
  const initial = createDefaultStudioProjectFeatureSuite(projectId);
  return writeStudioProjectFeatureSuite(storage, initial);
}

export function updateStudioProjectFeatureSuite(
  storage: StudioProjectFeatureSuiteStorage,
  projectId: string,
  updater: StudioProjectFeatureSuiteUpdater,
  target?: StudioProjectFeatureSuiteEventTarget,
): StudioProjectFeatureSuiteState {
  const id = normalizedProjectId(projectId);
  const current = ensureStudioProjectFeatureSuite(storage, id);
  const updated = updater(current);
  if (updated.projectId !== id) {
    throw new Error("A feature-suite update cannot change project identity.");
  }
  return writeStudioProjectFeatureSuite(storage, {
    ...updated,
    updatedAt: new Date().toISOString(),
  }, target);
}
