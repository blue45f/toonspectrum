/**
 * 코미포·툰스푼식 원클릭 조립 — 패널 레이아웃 + 장면 템플릿 + 대사 스크립트를 한 번에 시드로 합친다.
 */

import { dialogueToBubbles } from "./studio-dialogue";
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
  dialogueScript?: string;
  dialogueStartY?: number;
}

export interface ComipoAssemblyResult {
  canvasH: number;
  frameCount: number;
  bubbleCount: number;
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
  const seeds: ComipoAssemblySeed[] = [...panelSeeds];

  if (input.sceneTemplateId) {
    const scene = findSceneTemplate(input.sceneTemplateId);
    if (scene) seeds.push(...scene.build(0, 0));
  }

  if (input.dialogueScript?.trim()) {
    const startY = input.dialogueStartY ?? layout.frames[0]?.y ?? 24;
    const dialogueSeeds = dialogueToBubbles(input.dialogueScript, {
      canvasWidth: 720,
      startY: startY + 48,
    });
    seeds.push(...dialogueSeeds);
  }

  const frameCount = seeds.filter((s) => "type" in s && s.type === "frame").length;
  const bubbleCount = seeds.filter((s) => "type" in s && s.type === "bubble").length;

  return { canvasH, frameCount, bubbleCount, seeds };
}