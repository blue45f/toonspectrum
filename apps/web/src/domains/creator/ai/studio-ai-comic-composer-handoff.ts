import type {
  StudioAiEpisodeProductionPlan,
  StudioAiVariantCount,
} from "./studio-ai-episode-production-director";
import type { ScenarioSceneInput } from "../studio-scenario-layout";
import type { ScenarioBeatType } from "../studio-story-beats";

export interface StudioAiComicComposerScene extends ScenarioSceneInput {
  readonly sourceSceneNumber: number;
  readonly sourceCutNumber: number;
}

export interface StudioAiComicComposerHandoff {
  readonly version: 1;
  readonly source: "episode-production-director";
  readonly episodeTitle: string;
  readonly storyText: string;
  readonly characterDescription: string;
  readonly variants: StudioAiVariantCount;
  readonly modeLabel: string;
  readonly totalCuts: number;
  readonly projectedOutputCount: number;
  readonly generationWorkUnits: number;
  readonly scenes: readonly StudioAiComicComposerScene[];
}

function nonEmpty(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function beatTypeForCut(index: number, total: number): ScenarioBeatType {
  if (index === 0) return "setup";
  if (index === 1 && total >= 4) return "inciting";
  if (index === total - 1) return "resolution";
  if (index === total - 2 && total >= 4) return "climax";
  if (index >= Math.ceil(total * 0.55)) return "turn";
  return "escalation";
}

function dialogueLine(value: string | undefined): string {
  const text = value?.trim() ?? "";
  if (!text) return "";
  return /[:：]/u.test(text) ? text : `인물: ${text}`;
}

function anchorLine(label: string, values: readonly string[]): string {
  const normalized = nonEmpty(values);
  return normalized.length > 0 ? `${label}: ${normalized.join(", ")}` : "";
}

export function createStudioAiComicComposerHandoff(
  plan: StudioAiEpisodeProductionPlan,
): StudioAiComicComposerHandoff {
  const continuityLines = [
    anchorLine("캐릭터", plan.anchors.characters),
    anchorLine("의상", plan.anchors.costumes),
    anchorLine("장소", plan.anchors.locations),
    anchorLine("조명", plan.anchors.lighting),
    anchorLine("화풍", plan.anchors.styles),
    anchorLine("소품", plan.anchors.props),
  ].filter(Boolean);
  const characterDescription = [
    anchorLine("고정 캐릭터", plan.anchors.characters),
    anchorLine("고정 의상", plan.anchors.costumes),
    anchorLine("고정 소품", plan.anchors.props),
    anchorLine("고정 화풍", plan.anchors.styles),
  ].filter(Boolean).join("\n");

  const flattened = plan.scenes.flatMap((scene) =>
    scene.cuts.map((cut) => ({ scene, cut })),
  );

  const scenes: StudioAiComicComposerScene[] = flattened.map(({ scene, cut }, index) => {
    const imagePrompt = [
      cut.backgroundPrompt,
      `샷: ${cut.shotScale}, 카메라: ${cut.cameraAngle}, 감정: ${cut.emotion}`,
      cut.suggestedSfx ? `효과음 연출: ${cut.suggestedSfx}` : "",
      anchorLine("캐릭터 기준", plan.anchors.characters),
      anchorLine("의상 기준", plan.anchors.costumes),
      anchorLine("장소 기준", scene.locations),
      anchorLine("조명 기준", scene.lighting),
      anchorLine("화풍 기준", plan.anchors.styles),
      anchorLine("소품 기준", plan.anchors.props),
      "말풍선과 읽을 수 있는 텍스트는 이미지에 그리지 않습니다.",
    ].filter(Boolean).join("\n");

    return {
      sourceSceneNumber: scene.sceneNumber,
      sourceCutNumber: cut.cutNumber,
      beatType: beatTypeForCut(index, flattened.length),
      summary: `${scene.title} · ${cut.summary}`,
      imagePrompt,
      dialogue: dialogueLine(cut.dialogue),
      continuity: {
        ...(plan.anchors.characters.length > 0
          ? { characterNames: [...plan.anchors.characters] }
          : {}),
        ...(scene.locations[0] ? { location: scene.locations[0] } : {}),
        ...(plan.anchors.props.length > 0
          ? { props: Object.fromEntries(plan.anchors.props.map((prop) => [prop, "고정"])) }
          : {}),
      },
    };
  });

  const storyText = [
    `# ${plan.episodeTitle}`,
    continuityLines.length > 0 ? `[연속성 기준]\n${continuityLines.join("\n")}` : "",
    ...plan.scenes.map((scene) => `[장면 ${scene.sceneNumber}] ${scene.rawText}`),
  ].filter(Boolean).join("\n\n");

  return {
    version: 1,
    source: "episode-production-director",
    episodeTitle: plan.episodeTitle,
    storyText,
    characterDescription,
    variants: plan.variants,
    modeLabel: plan.modeLabel,
    totalCuts: plan.totalCuts,
    projectedOutputCount: plan.projectedOutputCount,
    generationWorkUnits: plan.generationWorkUnits,
    scenes,
  };
}
