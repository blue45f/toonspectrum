import { createEmptyStudioWriterRoomDocument, normalizeStudioWriterRoomDocument, type StudioWriterRoomDocument } from "./studio-writer-room";
import { planStudioStoryboard, type StudioStoryBeat, type StudioStoryBeatKind } from "./studio-storyboard-planner";

export type StudioStorySourceKind = "web-novel" | "webtoon-script" | "original";
export type StudioStoryChapterStatus = "draft" | "review" | "locked";

export interface StudioStoryChapter {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly status: StudioStoryChapterStatus;
}

export interface StudioStoryDevelopmentDocument {
  readonly version: 1;
  readonly sourceKind: StudioStorySourceKind;
  readonly title: string;
  readonly logline: string;
  readonly synopsis: string;
  readonly chapters: readonly StudioStoryChapter[];
  readonly updatedAt: string;
}

export interface StudioStoryAdaptationScene {
  readonly id: string;
  readonly order: number;
  readonly heading: string;
  readonly summary: string;
  readonly beatIds: readonly string[];
}

export interface StudioStoryAdaptationPlan {
  readonly sourceCharacters: number;
  readonly scenes: readonly StudioStoryAdaptationScene[];
  readonly beats: readonly StudioStoryBeat[];
  readonly estimatedPanels: number;
  readonly estimatedCanvasHeightPx: number;
  readonly warnings: readonly string[];
}

const MAX_SOURCE_CHARS = 120_000;
const MAX_SCENES = 64;
const MAX_BEATS = 180;

export function createStudioStoryDevelopmentDocument(now = new Date()): StudioStoryDevelopmentDocument {
  return Object.freeze({
    version: 1,
    sourceKind: "web-novel",
    title: "",
    logline: "",
    synopsis: "",
    chapters: Object.freeze([
      Object.freeze({ id: "chapter-1", title: "1화", body: "", status: "draft" as const }),
    ]),
    updatedAt: now.toISOString(),
  });
}

function compact(value: string, max = 500): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, max);
}

function sentences(paragraph: string): string[] {
  // Keep a closing quote attached to the terminator so dialogue detection retains paired quotes.
  const matched = paragraph.match(/[^.!?。！？\n]+[.!?。！？]?[”"」』]?/gu) ?? [];
  return matched.map((item) => compact(item, 700)).filter(Boolean);
}

function dialogueFrom(text: string): string {
  const match = text.match(/[“"「『]([^”"」』]{1,220})[”"」』]/u);
  if (match?.[1]) return compact(match[1], 220);
  const dash = text.match(/^(?:-|—)\s*(.{1,220})$/u);
  return dash?.[1] ? compact(dash[1], 220) : "";
}

function beatKind(text: string, index: number): StudioStoryBeatKind {
  if (dialogueFrom(text)) return "dialogue";
  if (index === 0) return "setup";
  if (/(드러나|밝혀|정체|비밀|reveal|truth|secret)/iu.test(text)) return "reveal";
  if (/(놀라|당황|웃|울|분노|충격|reaction|stare|gasp)/iu.test(text)) return "reaction";
  if (/(그날|다음 날|한편|시간이 흘|later|meanwhile|afterward)/iu.test(text)) return "transition";
  return "action";
}

function sourceParagraphs(source: string): string[] {
  return source
    .replace(/\r\n?/gu, "\n")
    .split(/\n\s*\n+/gu)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_SCENES);
}

export function buildStudioStoryAdaptationPlan(sourceText: string): StudioStoryAdaptationPlan {
  const original = sourceText.trim();
  if (!original) {
    return Object.freeze({
      sourceCharacters: 0,
      scenes: Object.freeze([]),
      beats: Object.freeze([]),
      estimatedPanels: 0,
      estimatedCanvasHeightPx: 0,
      warnings: Object.freeze(["source-empty"]),
    });
  }

  const warnings: string[] = [];
  const bounded = original.slice(0, MAX_SOURCE_CHARS);
  if (bounded.length < original.length) warnings.push("source-truncated");

  const paragraphs = sourceParagraphs(bounded);
  const beats: StudioStoryBeat[] = [];
  const scenes: StudioStoryAdaptationScene[] = [];

  paragraphs.forEach((paragraph, sceneIndex) => {
    if (beats.length >= MAX_BEATS) return;
    const sceneId = `adaptation-scene-${sceneIndex + 1}`;
    const parts = sentences(paragraph);
    const sourceParts = parts.length > 0 ? parts : [compact(paragraph, 700)];
    const beatIds: string[] = [];

    sourceParts.forEach((text, partIndex) => {
      if (beats.length >= MAX_BEATS || !text) return;
      const id = `adaptation-beat-${beats.length + 1}`;
      beatIds.push(id);
      beats.push(Object.freeze({
        id,
        sceneId,
        order: beats.length,
        kind: beatKind(text, partIndex),
        summary: text,
        dialogue: dialogueFrom(text),
        characterIds: Object.freeze([]),
        locationId: null,
      }));
    });

    if (beatIds.length > 0) {
      scenes.push(Object.freeze({
        id: sceneId,
        order: sceneIndex,
        heading: `Scene ${sceneIndex + 1}`,
        summary: compact(paragraph, 500),
        beatIds: Object.freeze(beatIds),
      }));
    }
  });

  if (paragraphs.length >= MAX_SCENES) warnings.push("scene-limit-reached");
  if (beats.length >= MAX_BEATS) warnings.push("beat-limit-reached");
  if (beats.length === 0) warnings.push("no-beats");

  const storyboard = beats.length > 0 ? planStudioStoryboard(beats) : null;
  if (storyboard?.warnings.length) warnings.push(...storyboard.warnings);

  return Object.freeze({
    sourceCharacters: original.length,
    scenes: Object.freeze(scenes),
    beats: Object.freeze(beats),
    estimatedPanels: storyboard?.shots.length ?? 0,
    estimatedCanvasHeightPx: storyboard?.estimatedCanvasHeightPx ?? 0,
    warnings: Object.freeze([...new Set(warnings)]),
  });
}

export function buildWriterRoomFromStoryAdaptation(input: {
  readonly development: StudioStoryDevelopmentDocument;
  readonly plan: StudioStoryAdaptationPlan;
}): StudioWriterRoomDocument {
  const { development, plan } = input;
  const empty = createEmptyStudioWriterRoomDocument();
  const storyboard = plan.beats.length > 0 ? planStudioStoryboard(plan.beats) : null;

  const panels = plan.beats.map((beat, index) => {
    const shot = storyboard?.shots[index];
    return {
      id: `adaptation-panel-${index + 1}`,
      order: index,
      sceneId: beat.sceneId,
      shot: shot ? `${shot.shotSize} · ${shot.camera}` : "medium",
      action: beat.summary,
      characterIds: [...beat.characterIds],
    };
  });
  const panelByBeat = new Map(plan.beats.map((beat, index) => [beat.id, panels[index]?.id ?? ""]));

  return normalizeStudioWriterRoomDocument({
    ...empty,
    stages: {
      premise: { text: development.logline, characterIds: [] },
      synopsis: { text: development.synopsis || compact(plan.scenes.map((scene) => scene.summary).join(" "), 4000), characterIds: [] },
      "episode-outline": {
        title: development.chapters[0]?.title || development.title || "Adaptation",
        summary: development.synopsis || compact(plan.scenes.map((scene) => scene.summary).join(" "), 4000),
        characterIds: [],
      },
      beats: {
        items: plan.beats.map((beat) => ({
          id: beat.id,
          order: beat.order,
          title: compact(beat.summary, 120),
          summary: beat.summary,
          characterIds: [...beat.characterIds],
        })),
      },
      scenes: {
        items: plan.scenes.map((scene) => ({
          id: scene.id,
          order: scene.order,
          beatIds: [...scene.beatIds],
          heading: scene.heading,
          summary: scene.summary,
          location: "",
          time: "",
          characterIds: [],
        })),
      },
      "panel-plan": { items: panels },
      "dialogue-sfx": {
        dialogue: plan.beats
          .filter((beat) => beat.dialogue.trim())
          .map((beat, index) => ({
            id: `adaptation-dialogue-${index + 1}`,
            order: index,
            panelId: panelByBeat.get(beat.id) ?? "",
            characterId: null,
            text: beat.dialogue,
          })),
        sfx: [],
      },
    },
    completion: {
      premise: Boolean(development.logline.trim()),
      synopsis: Boolean(development.synopsis.trim()),
      "episode-outline": Boolean(development.title.trim() || development.chapters[0]?.title.trim()),
      beats: plan.beats.length > 0,
      scenes: plan.scenes.length > 0,
      "panel-plan": panels.length > 0,
      "dialogue-sfx": false,
    },
  });
}

export function storyDevelopmentStorageKey(projectId: string): string {
  return `toonstudio:story-development:v1:${encodeURIComponent(projectId)}`;
}
