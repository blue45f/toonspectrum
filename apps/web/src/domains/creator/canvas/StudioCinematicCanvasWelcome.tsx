import { ArrowRight, Layers3, Sparkles, X } from "lucide-react";
import { useState } from "react";

import {
  requestStudioCreationMode,
  type StudioCreationMode,
} from "../studio-creation-mode";

const ICON_ROOT = "/brand/toonstudio-premium-icons";
const SCENE_ROOT = "/assets/studio/generated-backgrounds/gpt25-v1";

interface CanvasStartAction {
  readonly mode: StudioCreationMode;
  readonly label: string;
  readonly description: string;
  readonly art: string;
  readonly accent: string;
}

interface CanvasScenePreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly art: string;
}

const CANVAS_START_ACTIONS: readonly CanvasStartAction[] = [
  { mode: "draw", label: "직접 그리기", description: "브러시와 선화부터", art: "canvas.webp", accent: "violet" },
  { mode: "story", label: "컷과 대사", description: "말풍선·텍스트 구성", art: "story.webp", accent: "blue" },
  { mode: "character", label: "캐릭터 배치", description: "표정·포즈·의상", art: "character.webp", accent: "pink" },
  { mode: "background", label: "배경 만들기", description: "장면·원근·3D", art: "background.webp", accent: "cyan" },
  { mode: "assets", label: "에셋 불러오기", description: "소재와 참고 이미지", art: "assets.webp", accent: "amber" },
  { mode: "ai", label: "AI 첫 장면", description: "구도와 연출 제안", art: "ai-director.webp", accent: "aurora" },
] as const;

const CANVAS_SCENE_PRESETS: readonly CanvasScenePreset[] = [
  {
    id: "romance",
    label: "로맨스",
    description: "벚꽃길의 첫 만남",
    art: `${SCENE_ROOT}/romance/gpt25-bg-romance-cherry-path-vertical-depth/background.png`,
  },
  {
    id: "sf",
    label: "SF",
    description: "네온 도시의 추격",
    art: `${SCENE_ROOT}/sf/gpt25-bg-sf-cyber-alley-vertical-depth/background.png`,
  },
  {
    id: "action",
    label: "액션",
    description: "폐허 도시의 전투",
    art: `${SCENE_ROOT}/action/gpt25-bg-action-ruined-city-vertical-depth/background.png`,
  },
  {
    id: "fantasy",
    label: "판타지",
    description: "용의 절벽과 구름",
    art: `${SCENE_ROOT}/fantasy/gpt25-bg-fantasy-dragon-cliff-vertical-depth/background.png`,
  },
  {
    id: "daily",
    label: "일상",
    description: "밤의 작업실",
    art: `${SCENE_ROOT}/daily/gpt25-bg-daily-bedroom-night-vertical-depth/background.png`,
  },
  {
    id: "horror",
    label: "호러",
    description: "안개 낀 오두막",
    art: `${SCENE_ROOT}/horror/gpt25-bg-horror-fog-cabin-vertical-depth/background.png`,
  },
] as const;

interface StudioCinematicCanvasWelcomeProps {
  readonly pageKey: string;
  readonly visible: boolean;
}

export function StudioCinematicCanvasWelcome({
  pageKey,
  visible,
}: StudioCinematicCanvasWelcomeProps) {
  const [dismissedPageKey, setDismissedPageKey] = useState<string | null>(null);

  if (!visible || dismissedPageKey === pageKey) return null;

  const launch = (mode: StudioCreationMode) => {
    setDismissedPageKey(pageKey);
    requestStudioCreationMode(mode);
  };

  return (
    <section
      className="studio-cinematic-canvas-welcome"
      aria-label="빈 캔버스 시작 방법"
      data-studio-cinematic-canvas-welcome="true"
    >
      <button
        type="button"
        className="studio-cinematic-canvas-welcome__close"
        aria-label="시작 안내 닫기"
        onClick={() => setDismissedPageKey(pageKey)}
      >
        <X size={17} aria-hidden="true" />
      </button>

      <div className="studio-cinematic-canvas-welcome__art" aria-hidden="true">
        <span className="studio-cinematic-canvas-welcome__eyebrow">
          <Sparkles size={13} /> WEBTOON STAGE
        </span>
        <div className="studio-cinematic-canvas-welcome__page-stack">
          {CANVAS_SCENE_PRESETS.slice(0, 3).map((preset, index) => (
            <span
              key={preset.id}
              style={{ backgroundImage: `url("${preset.art}")` }}
              data-stack-index={index}
            />
          ))}
        </div>
        <span className="studio-cinematic-canvas-welcome__art-copy">
          <strong>첫 컷의 분위기를 선택하세요.</strong>
          <small>선화부터 AI 연출까지 같은 캔버스에서 이어집니다.</small>
        </span>
      </div>

      <div className="studio-cinematic-canvas-welcome__body">
        <div className="studio-cinematic-canvas-welcome__heading">
          <span>START YOUR SCENE</span>
          <h2>첫 장면을 어떻게 시작할까요?</h2>
          <p>작업 방식만 고르면 필요한 도구와 패널을 바로 준비합니다.</p>
        </div>

        <div className="studio-cinematic-canvas-welcome__actions">
          {CANVAS_START_ACTIONS.map((action) => (
            <button
              key={action.mode}
              type="button"
              data-canvas-start-mode={action.mode}
              data-accent={action.accent}
              onClick={() => launch(action.mode)}
            >
              <span className="studio-cinematic-canvas-welcome__action-art" aria-hidden="true">
                <img src={`${ICON_ROOT}/${action.art}`} alt="" />
              </span>
              <span>
                <strong>{action.label}</strong>
                <small>{action.description}</small>
              </span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <footer className="studio-cinematic-canvas-welcome__scenes">
        <div className="studio-cinematic-canvas-welcome__scenes-heading">
          <span><Layers3 size={13} aria-hidden="true" /> SCENE PRESETS</span>
          <small>장면 이미지를 고르면 배경 제작 도구가 열립니다.</small>
        </div>
        <div className="studio-cinematic-canvas-welcome__scene-strip">
          {CANVAS_SCENE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-canvas-scene-preset={preset.id}
              aria-label={`${preset.label} 장면으로 배경 시작`}
              onClick={() => launch("background")}
            >
              <span
                className="studio-cinematic-canvas-welcome__scene-art"
                style={{ backgroundImage: `url("${preset.art}")` }}
                aria-hidden="true"
              />
              <span className="studio-cinematic-canvas-welcome__scene-copy">
                <strong>{preset.label}</strong>
                <small>{preset.description}</small>
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="studio-cinematic-canvas-welcome__blank"
          onClick={() => setDismissedPageKey(pageKey)}
        >
          빈 캔버스로 그대로 시작
        </button>
      </footer>
    </section>
  );
}
