import {
  BookOpenText,
  Brush,
  ChevronDown,
  GraduationCap,
  Image as ImageIcon,
  Mountain,
  Sparkles,
  UserRound,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useState, type KeyboardEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  requestStudioCreationMode,
  type StudioCreationMode,
} from "../studio-creation-mode";
import {
  readStudioCanvasStartDockCollapsed,
  rememberStudioCanvasStartDockCollapsed,
} from "./studio-canvas-start-dock-preference";
import { setStudioCanvasStartDockExpanded } from "./studio-canvas-start-dock-state";
import "./studio-canvas-start-dock.css";

const SCENE_ROOT = "/brand/studio-canvas-previews";

type CanvasStartAccent = "violet" | "blue" | "pink" | "cyan" | "amber" | "aurora";

interface CanvasStartAction {
  readonly mode: StudioCreationMode;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly icon: LucideIcon;
  readonly accent: CanvasStartAccent;
}

/** 참고용 예시 장면(브랜드 일러스트). 고른 장르를 도구에 넘기지 않으므로 선택지로 꾸미지 않는다. */
interface CanvasScenePreset {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly art: string;
}

/** 왼쪽 도구 막대의 "만들기(작업 모드)"와 같은 여섯 갈래. 아이콘은 편집기 도구와 같은 선형 아이콘을 쓴다. */
const CANVAS_START_ACTIONS: readonly CanvasStartAction[] = [
  { mode: "draw", labelKo: "직접 그리기", labelEn: "Draw", descriptionKo: "브러시와 선화부터", descriptionEn: "Brushes & line art", icon: Brush, accent: "violet" },
  { mode: "story", labelKo: "컷과 대사", labelEn: "Panels & dialogue", descriptionKo: "말풍선·텍스트 구성", descriptionEn: "Balloons & text", icon: BookOpenText, accent: "blue" },
  { mode: "character", labelKo: "캐릭터 배치", labelEn: "Place characters", descriptionKo: "표정·포즈·의상", descriptionEn: "Expression & pose", icon: UserRound, accent: "pink" },
  { mode: "background", labelKo: "배경 만들기", labelEn: "Backgrounds", descriptionKo: "장면·원근·3D", descriptionEn: "Scene, perspective, 3D", icon: Mountain, accent: "cyan" },
  { mode: "assets", labelKo: "에셋 불러오기", labelEn: "Add assets", descriptionKo: "소재와 참고 이미지", descriptionEn: "Materials & references", icon: ImageIcon, accent: "amber" },
  { mode: "ai", labelKo: "AI 첫 장면", labelEn: "AI first scene", descriptionKo: "구도와 연출 제안", descriptionEn: "Composition ideas", icon: WandSparkles, accent: "aurora" },
] as const;

const CANVAS_SCENE_PRESETS: readonly CanvasScenePreset[] = [
  { id: "romance", labelKo: "로맨스", labelEn: "Romance", descriptionKo: "벚꽃길의 첫 만남", descriptionEn: "First meeting under blossoms", art: `${SCENE_ROOT}/romance.webp` },
  { id: "sf", labelKo: "SF", labelEn: "Sci-fi", descriptionKo: "네온 도시의 추격", descriptionEn: "Chase in a neon city", art: `${SCENE_ROOT}/sf.webp` },
  { id: "action", labelKo: "액션", labelEn: "Action", descriptionKo: "폐허 도시의 전투", descriptionEn: "Battle in ruins", art: `${SCENE_ROOT}/action.webp` },
  { id: "fantasy", labelKo: "판타지", labelEn: "Fantasy", descriptionKo: "용의 절벽과 구름", descriptionEn: "Dragon cliffs", art: `${SCENE_ROOT}/fantasy.webp` },
  { id: "daily", labelKo: "일상", labelEn: "Slice of life", descriptionKo: "밤의 작업실", descriptionEn: "Studio at night", art: `${SCENE_ROOT}/daily.webp` },
  { id: "horror", labelKo: "호러", labelEn: "Horror", descriptionKo: "안개 낀 오두막", descriptionEn: "Cabin in the fog", art: `${SCENE_ROOT}/horror.webp` },
] as const;

interface StudioCinematicCanvasWelcomeProps {
  readonly pageKey: string;
  readonly visible: boolean;
  /** 핵심 도구를 화면에서 차례로 안내하는 사용법 따라 하기를 연다. */
  readonly onOpenTutorial?: () => void;
}

/**
 * 빈 캔버스의 비차단 시작 도크. 캔버스 위쪽 한 줄만 차지하고 나머지 화면에서는 바로 그릴 수 있다.
 * 한 번 닫거나 방식을 고르면 이후 빈 페이지에서는 작은 "시작 방법" 버튼으로만 남는다.
 */
export function StudioCinematicCanvasWelcome({
  pageKey,
  visible,
  onOpenTutorial,
}: StudioCinematicCanvasWelcomeProps) {
  const bt = useBilingual("StudioCinematicCanvasWelcome");
  const headingId = useId();
  const scenesId = useId();
  const [dismissedPageKey, setDismissedPageKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(() => !readStudioCanvasStartDockCollapsed());
  const [scenesOpen, setScenesOpen] = useState(false);
  const shown = visible && dismissedPageKey !== pageKey;
  const dockOpen = shown && expanded;

  // 펼친 도크가 유일한 시작 안내가 되도록 코치·인스펙터 시작 카드에 알린다.
  useEffect(() => {
    setStudioCanvasStartDockExpanded(dockOpen);
    return () => setStudioCanvasStartDockExpanded(false);
  }, [dockOpen]);

  if (!shown) return null;

  const closeForPage = () => {
    setDismissedPageKey(pageKey);
    setScenesOpen(false);
    // 같은 편집 세션에서 새 빈 페이지를 만들어도 다시 펼치지 않고 접힌 버튼만 보여 준다.
    setExpanded(false);
    rememberStudioCanvasStartDockCollapsed();
  };

  const launch = (mode: StudioCreationMode) => {
    closeForPage();
    requestStudioCreationMode(mode);
  };

  const openTutorial = () => {
    closeForPage();
    onOpenTutorial?.();
  };

  // 도크 안의 어느 버튼에 초점이 있어도 Esc로 캔버스 편집에 바로 돌아간다.
  const closeWithEscape = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeForPage();
  };

  if (!expanded) {
    return (
      <div className="studio-canvas-start studio-canvas-start--collapsed" data-studio-cinematic-canvas-welcome="collapsed">
        <button
          type="button"
          className="studio-canvas-start__pill"
          aria-expanded={false}
          onClick={() => setExpanded(true)}
        >
          <Sparkles size={14} aria-hidden="true" />
          <span className="studio-canvas-start__pill-long">{bt("빈 캔버스 · 시작 방법 보기", "Blank canvas · Show ways to start")}</span>
          <span className="studio-canvas-start__pill-short">{bt("시작 방법 보기", "Ways to start")}</span>
        </button>
        <button
          type="button"
          className="studio-canvas-start__pill-close"
          aria-label={bt("시작 안내 닫기", "Close start guide")}
          onClick={() => setDismissedPageKey(pageKey)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <section
      className="studio-canvas-start"
      aria-label={bt("빈 캔버스 시작 방법", "Ways to start a blank canvas")}
      data-studio-cinematic-canvas-welcome="true"
      data-studio-mobile-coach="true"
    >
      <header className="studio-canvas-start__header">
        <div className="studio-canvas-start__title">
          <span className="studio-canvas-start__eyebrow">
            <Sparkles size={12} aria-hidden="true" /> START YOUR SCENE
          </span>
          <h2 id={headingId}>{bt("첫 장면을 어떻게 시작할까요?", "How do you want to start?")}</h2>
          <p>
            {bt(
              "바로 그려도 됩니다. 방식을 고르면 필요한 도구와 패널을 준비해요.",
              "Start drawing right away, or pick a way to start and the right tools open.",
            )}
          </p>
        </div>
        <div className="studio-canvas-start__header-actions">
          <button
            type="button"
            className="studio-canvas-start__scenes-toggle"
            onKeyDown={closeWithEscape}
            aria-expanded={scenesOpen}
            aria-controls={scenesId}
            onClick={() => setScenesOpen((open) => !open)}
          >
            {bt("예시 장면", "Example scenes")}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="studio-canvas-start__close"
            onKeyDown={closeWithEscape}
            aria-label={bt("시작 안내 닫기", "Close start guide")}
            aria-keyshortcuts="Escape"
            title={bt("시작 안내 닫기 (Esc)", "Close start guide (Esc)")}
            onClick={closeForPage}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <ul className="studio-canvas-start__modes" aria-labelledby={headingId}>
        {CANVAS_START_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <li key={action.mode}>
              <button
                type="button"
                data-canvas-start-mode={action.mode}
                data-accent={action.accent}
                onKeyDown={closeWithEscape}
                onClick={() => launch(action.mode)}
              >
                <span className="studio-canvas-start__mode-icon" aria-hidden="true"><Icon size={18} /></span>
                <span className="studio-canvas-start__mode-copy">
                  <strong>{bt(action.labelKo, action.labelEn)}</strong>
                  <small>{bt(action.descriptionKo, action.descriptionEn)}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {scenesOpen ? (
        <div id={scenesId} className="studio-canvas-start__scenes">
          <div className="studio-canvas-start__scenes-head">
            <p>
              {bt(
                "장르별 참고용 예시 일러스트예요. 배경은 배경 도구에서 직접 만들 수 있어요.",
                "Reference illustrations by genre. Build your own background with the background tools.",
              )}
            </p>
            <button
              type="button"
              className="studio-canvas-start__scenes-action"
              data-canvas-scene-open-background="true"
              onKeyDown={closeWithEscape}
              onClick={() => launch("background")}
            >
              <Mountain size={14} aria-hidden="true" />
              {bt("배경 도구 열기", "Open background tools")}
            </button>
          </div>
          <ul className="studio-cinematic-canvas-welcome__scene-strip" aria-label={bt("예시 장면", "Example scenes")}>
            {CANVAS_SCENE_PRESETS.map((preset) => (
              <li key={preset.id} data-canvas-scene-example={preset.id}>
                <span
                  className="studio-canvas-start__scene-art"
                  style={{ backgroundImage: `url("${preset.art}")` }}
                  aria-hidden="true"
                />
                <span className="studio-canvas-start__scene-badge">{bt("예시", "Example")}</span>
                <span className="studio-canvas-start__scene-copy">
                  <strong>{bt(preset.labelKo, preset.labelEn)}</strong>
                  <small>{bt(preset.descriptionKo, preset.descriptionEn)}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="studio-canvas-start__footer">
        <p className="studio-canvas-start__hint">
          {bt(
            "닫아도 왼쪽 도구 막대의 ‘만들기’에서 언제든 다시 고를 수 있어요.",
            "You can reopen these anytime from “Create” in the left tool rail.",
          )}
        </p>
        {onOpenTutorial ? (
          <button
            type="button"
            className="studio-canvas-start__tutorial"
            data-canvas-start-tutorial="true"
            onKeyDown={closeWithEscape}
            onClick={openTutorial}
          >
            <GraduationCap size={14} aria-hidden="true" />
            {bt("처음이라면 사용법 따라 하기", "New here? Follow the guided tour")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
