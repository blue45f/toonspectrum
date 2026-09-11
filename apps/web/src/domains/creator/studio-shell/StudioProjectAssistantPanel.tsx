import { ArrowRight, Check, Sparkles, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  createStudioAiProjectHandoff,
  writeStudioAiProjectHandoff,
  type StudioAiProjectHandoff,
} from "../ai/studio-ai-project-handoff";
import type { StudioAiAssistToolId } from "../ai/studio-ai-assist-ux";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export type StudioProjectAssistantSection =
  | "overview"
  | "story"
  | "production"
  | "assets"
  | "review"
  | "export"
  | "settings";

type Locale = "ko" | "en";

type AssistantSuggestion = Readonly<{
  tool: StudioAiAssistToolId;
  label: Record<Locale, string>;
  prompt: Record<Locale, string>;
}>;

const SUGGESTIONS: Readonly<Record<StudioProjectAssistantSection, readonly AssistantSuggestion[]>> = {
  overview: [
    { tool: "composition", label: { ko: "다음 장면 계획", en: "Plan next scene" }, prompt: { ko: "현재 프로젝트 진행 상황을 바탕으로 다음 장면의 컷 구성안을 만들어줘.", en: "Draft the next scene composition from the current project progress." } },
    { tool: "palette", label: { ko: "작품 색감 정리", en: "Refine project palette" }, prompt: { ko: "현재 작품의 장르와 분위기에 맞는 일관된 색상 팔레트를 제안해줘.", en: "Suggest a consistent palette for the project's genre and mood." } },
  ],
  story: [
    { tool: "dialogue", label: { ko: "대사 다듬기", en: "Refine dialogue" }, prompt: { ko: "현재 장면의 대사를 캐릭터 말투를 유지하면서 자연스럽고 간결하게 다듬어줘.", en: "Refine the current scene dialogue while preserving each character's voice." } },
    { tool: "composition", label: { ko: "대본을 컷으로", en: "Script to panels" }, prompt: { ko: "현재 대본을 웹툰 컷 단위로 나누고 카메라 구도와 말풍선 여백을 제안해줘.", en: "Break the current script into webtoon panels with camera and balloon-space suggestions." } },
    { tool: "character", label: { ko: "캐릭터 일관성", en: "Character consistency" }, prompt: { ko: "현재 장면의 캐릭터 외형·의상·표정이 작품 설정과 일관적인지 확인할 수 있는 참고안을 만들어줘.", en: "Prepare references to check character appearance, outfit and expression consistency." } },
  ],
  production: [
    { tool: "background", label: { ko: "배경 참고 만들기", en: "Create background reference" }, prompt: { ko: "현재 컷의 카메라와 분위기에 맞는 배경 참고 이미지를 만들어줘.", en: "Create a background reference matching the current panel camera and mood." } },
    { tool: "composition", label: { ko: "컷 구성 개선", en: "Improve composition" }, prompt: { ko: "현재 장면의 시선 흐름과 긴장감을 높이는 컷 구성 대안을 제안해줘.", en: "Suggest panel compositions that improve eye flow and dramatic tension." } },
    { tool: "palette", label: { ko: "장면 팔레트", en: "Scene palette" }, prompt: { ko: "현재 장면의 시간대와 감정에 맞는 채색 팔레트를 만들어줘.", en: "Create a color palette for the scene's time and emotion." } },
  ],
  assets: [
    { tool: "character", label: { ko: "캐릭터 참고", en: "Character reference" }, prompt: { ko: "프로젝트 설정을 유지하는 캐릭터 표정·포즈 참고안을 만들어줘.", en: "Create expression and pose references that preserve project character settings." } },
    { tool: "palette", label: { ko: "Series Kit 색상", en: "Series Kit colors" }, prompt: { ko: "작품 로고·표지·대사에 함께 쓸 수 있는 Series Kit 색상 체계를 제안해줘.", en: "Suggest a Series Kit color system for logo, covers and dialogue." } },
  ],
  review: [
    { tool: "dialogue", label: { ko: "대사 검토", en: "Review dialogue" }, prompt: { ko: "검토 중인 대사의 어색한 표현, 캐릭터 말투 불일치와 글자 과밀 가능성을 찾아줘.", en: "Find awkward phrasing, voice inconsistency and likely text crowding in review dialogue." } },
    { tool: "composition", label: { ko: "연출 검토", en: "Review direction" }, prompt: { ko: "검토 중인 컷의 시선 흐름, 장면 전환과 스크롤 리듬 문제를 찾아줘.", en: "Find eye-flow, scene-transition and scroll-rhythm issues in the reviewed panels." } },
  ],
  export: [
    { tool: "dialogue", label: { ko: "글자 가독성 확인", en: "Check text readability" }, prompt: { ko: "출력 전 말풍선 글자 크기, 대사 길이와 번역 시 넘침 가능성을 검토해줘.", en: "Review balloon text size, dialogue length and localization overflow risk before export." } },
    { tool: "palette", label: { ko: "출력 색상 확인", en: "Check export colors" }, prompt: { ko: "현재 원고의 웹·인쇄 출력에서 색상 손실 가능성과 안전한 팔레트 대안을 알려줘.", en: "Check color-loss risks for web and print export and suggest safe palette alternatives." } },
  ],
  settings: [
    { tool: "palette", label: { ko: "작품 기본 색상", en: "Project color defaults" }, prompt: { ko: "이 프로젝트의 장르와 독자층에 맞는 기본 색상·대사·표지 규칙을 제안해줘.", en: "Suggest default color, dialogue and cover rules for this project's genre and audience." } },
  ],
};

function assistantSource(section: StudioProjectAssistantSection): StudioAiProjectHandoff["source"] {
  if (section === "story") return "story";
  if (section === "review") return "review";
  if (section === "export") return "export";
  return "project-shell";
}

function editorHref(projectId: string, tool: StudioAiAssistToolId): string {
  const surface = tool === "background" || tool === "character" || tool === "palette" ? "canvas" : "comic";
  return `/studio/work/${encodeURIComponent(projectId)}/${surface}`;
}

/** Launch the existing editor AI hub from a project task without duplicating its runtime or provider state. */
export function StudioProjectAssistantPanel({
  projectId,
  section,
  locale,
}: {
  readonly projectId: string;
  readonly section: StudioProjectAssistantSection;
  readonly locale: Locale;
}) {
  const navigate = useNavigate();
  const suggestions = useMemo(() => SUGGESTIONS[section], [section]);
  const [selectedTool, setSelectedTool] = useState<StudioAiAssistToolId>(suggestions[0]?.tool ?? "composition");
  const [prompt, setPrompt] = useState(suggestions[0]?.prompt[locale] ?? "");
  const [error, setError] = useState<string | null>(null);

  const chooseSuggestion = (suggestion: AssistantSuggestion) => {
    setSelectedTool(suggestion.tool);
    setPrompt(suggestion.prompt[locale]);
    setError(null);
  };

  const launch = () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError(locale === "ko" ? "도우미에게 요청할 내용을 입력해 주세요." : "Describe what the assistant should do.");
      return;
    }
    try {
      const handoff = createStudioAiProjectHandoff({
        projectId,
        tool: selectedTool,
        prompt: trimmed,
        source: assistantSource(section),
      });
      writeStudioAiProjectHandoff(window.sessionStorage, handoff);
      navigate(editorHref(projectId, selectedTool));
    } catch {
      setError(locale === "ko"
        ? "요청을 안전하게 전달하지 못했습니다. 편집기에서 도우미를 직접 열어 주세요."
        : "The request could not be handed off safely. Open the assistant from the editor instead.");
    }
  };

  return (
    <section className="rounded-3xl border border-accent/25 bg-accent-soft/15 p-4 sm:p-5" aria-labelledby="project-assistant-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <Sparkles size={14} aria-hidden="true" /> TOONSTUDIO ASSISTANT
          </p>
          <h2 id="project-assistant-title" className="mt-2 text-xl font-black tracking-tight text-fg">
            {locale === "ko" ? "현재 작업에서 바로 도움받기" : "Get help with the current task"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-fg-2">
            {locale === "ko"
              ? "요청을 편집기로 안전하게 전달합니다. 실제 실행 전 설정과 비용을 확인하고, 결과는 원본을 덮지 않고 사본으로 적용합니다."
              : "The request opens in the editor for a final settings and cost check. Results are applied as a copy, never over the original."}
          </p>
        </div>
        <span className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-full border border-success/30 bg-success-soft/20 px-3 text-xs font-bold text-success">
          <Check size={14} aria-hidden="true" />
          {locale === "ko" ? "원본 보호" : "Original protected"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" aria-label={locale === "ko" ? "추천 요청" : "Suggested requests"}>
        {suggestions.map((suggestion) => {
          const active = prompt === suggestion.prompt[locale] && selectedTool === suggestion.tool;
          return (
            <button
              key={`${suggestion.tool}:${suggestion.label.en}`}
              type="button"
              aria-pressed={active}
              onClick={() => chooseSuggestion(suggestion)}
              className={cn(
                "min-h-11 rounded-xl border px-3 text-xs font-bold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                active
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-fg",
              )}
            >
              {suggestion.label[locale]}
            </button>
          );
        })}
      </div>

      <label className="mt-4 block text-xs font-bold text-fg-2" htmlFor="project-assistant-prompt">
        {locale === "ko" ? "요청 내용" : "Request"}
      </label>
      <textarea
        id="project-assistant-prompt"
        value={prompt}
        onChange={(event) => {
          setPrompt(event.target.value);
          setError(null);
        }}
        rows={3}
        className="mt-2 w-full resize-y rounded-2xl border border-line bg-card px-4 py-3 text-sm leading-6 text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent focus:ring-2 focus:ring-accent/25"
        placeholder={locale === "ko" ? "예: 컷 12~16의 긴장감을 높이는 구도를 제안해줘" : "Example: Suggest compositions that increase tension in panels 12–16"}
      />
      {error ? <p role="alert" className="mt-2 text-xs font-semibold text-danger">{error}</p> : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-fg-3">
          {locale === "ko" ? "편집기에서 실행 전 공급 방식·외부 전송·예상 비용을 확인할 수 있어요." : "Review processing, external transfer and estimated cost in the editor before running."}
        </p>
        <button type="button" onClick={launch} className={buttonClass({ className: "gap-2" })}>
          <WandSparkles size={16} aria-hidden="true" />
          {locale === "ko" ? "편집기에서 검토" : "Review in editor"}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
