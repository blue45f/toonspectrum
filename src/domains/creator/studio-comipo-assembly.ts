/**
 * 코미포·툰스푼식 원클릭 조립 — 패널 레이아웃 + 장면 템플릿 + 대사 스크립트를
 * 패널 프레임 안에 공간적으로 배치한다(겹침 없음).
 */

import {
  composeDialogueIntoFrames,
  composeSceneIntoFrame,
  isComposableAssembly,
} from "./studio-comipo-compose";
import { materializePanelLayout, PANEL_LAYOUTS, type PanelLayoutElementSeed } from "./studio-panel-layouts";
import { SCENE_TEMPLATES, type SceneSeed } from "./studio-scene-templates";

export type ComipoAssemblySeed =
  | PanelLayoutElementSeed
  | SceneSeed
  | {
      type: "bubble";
      variant: "speech" | "box" | "thought" | "shout" | "whisper" | "scared" | "system" | "heart" | "phone" | "angry";
      text: string;
      x: number;
      y: number;
      width: number;
      height: number;
      fill: string;
      textFill: string;
      rotation: number;
      tail?: "left" | "right" | "none";
      tailDirection?: "bottom" | "top" | "left" | "right";
      align?: "left" | "center" | "right";
    };

export interface ComipoAssemblyInput {
  layoutId: string;
  sceneTemplateId?: string;
  /** 장면을 넣을 패널 프레임 인덱스(기본 0 = 첫 컷). */
  sceneFrameIndex?: number;
  dialogueScript?: string;
}

export interface ComipoAssemblyResult {
  canvasH: number;
  frameCount: number;
  bubbleCount: number;
  composable: boolean;
  seeds: ComipoAssemblySeed[];
}

function findLayout(id: string) {
  return PANEL_LAYOUTS.find((layout) => layout.id === id) ?? null;
}

function findSceneTemplate(id: string) {
  return SCENE_TEMPLATES.find((template) => template.id === id) ?? null;
}

/** 패널·장면·대사를 결합한 원클릭 조립 결과. layoutId 가 없으면 null. */
export function assembleComipoPage(input: ComipoAssemblyInput): ComipoAssemblyResult | null {
  const layout = findLayout(input.layoutId);
  if (!layout) return null;

  const { canvasH, seeds: panelSeeds } = materializePanelLayout(layout);
  const frameSeeds = panelSeeds.filter((s) => s.type === "frame");
  const hasDialogue = Boolean(input.dialogueScript?.trim());
  // 대사 스크립트가 있으면 레이아웃 placeholder 말풍선은 대체한다.
  const layoutBubbles = hasDialogue ? [] : panelSeeds.filter((s) => s.type === "bubble");

  const decor: ComipoAssemblySeed[] = [...layoutBubbles];

  if (input.sceneTemplateId && layout.frames.length > 0) {
    const scene = findSceneTemplate(input.sceneTemplateId);
    const frameIndex = Math.min(
      Math.max(0, input.sceneFrameIndex ?? 0),
      layout.frames.length - 1
    );
    const targetFrame = layout.frames[frameIndex]!;
    if (scene) {
      const rawScene = scene.build(0, 0);
      // 대사 스크립트가 있으면 장면 placeholder 말풍선도 대체한다.
      const sceneForCompose = hasDialogue
        ? rawScene.filter((s) => s.type !== "frame" && s.type !== "bubble")
        : rawScene;
      decor.push(...composeSceneIntoFrame(sceneForCompose, targetFrame));
    }
  }

  if (hasDialogue) {
    decor.push(...composeDialogueIntoFrames(input.dialogueScript!, layout.frames));
  }

  const seeds: ComipoAssemblySeed[] = [...frameSeeds, ...decor];
  const frameCount = frameSeeds.length;
  const bubbleCount = seeds.filter((s) => "type" in s && s.type === "bubble").length;
  const composable = isComposableAssembly(layout.frames, decor, canvasH);

  return { canvasH, frameCount, bubbleCount, composable, seeds };
}