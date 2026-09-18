import { BookOpen, ExternalLink, FlaskConical } from "lucide-react";
import { useMemo } from "react";

import {
  CURATED_LEARNING_RESOURCES,
  PRODUCTION_STEP_LABELS,
  RESOURCE_FORMAT_LABELS,
} from "../../learn/learning-resources";
import { cn } from "@/shared/lib/utils";
import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../studio-panel-ui";
import {
  recommendStudioLearningResources,
  resolveStudioLearningFocus,
  type StudioAssistantLearningTool,
} from "./studio-contextual-learning";
import type { WebtoonProductionStage } from "./webtoon-focus-timer";

export interface StudioContextualLearningPanelProps {
  readonly tool: StudioAssistantLearningTool;
  readonly focusStage: WebtoonProductionStage;
}

export function StudioContextualLearningPanel({
  tool,
  focusStage,
}: StudioContextualLearningPanelProps) {
  const focus = useMemo(() => resolveStudioLearningFocus(tool, focusStage), [tool, focusStage]);
  const resources = useMemo(
    () => recommendStudioLearningResources(CURATED_LEARNING_RESOURCES, focus, 4),
    [focus],
  );
  const primaryStep = focus.primarySteps[0] ?? "workflow";
  const libraryHref = `/learn/resources?step=${encodeURIComponent(primaryStep)}`;

  return (
    <div data-testid="studio-contextual-learning-panel" className="flex flex-col gap-4">
      <section className="rounded-xl border border-accent/35 bg-accent-soft p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-accent">
              <BookOpen className="size-4 shrink-0" aria-hidden />
              <span className="text-[0.72rem] font-black tracking-wide">지금 작업에 맞는 학습</span>
            </div>
            <h3 className="mt-2 text-sm font-black text-fg">{focus.label}</h3>
            <p className="mt-1 max-w-2xl text-[0.68rem] leading-relaxed text-fg-2">{focus.reason}</p>
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="추천 제작 단계">
            {focus.primarySteps.map((step) => (
              <span key={step} className="rounded-full border border-accent/40 bg-card px-2 py-1 text-[0.6rem] font-bold text-accent">
                {PRODUCTION_STEP_LABELS[step]}
              </span>
            ))}
          </div>
        </div>
      </section>
      <section aria-labelledby="studio-learning-recommendations-title">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[0.58rem] font-black tracking-[0.12em] text-fg-3">LEARN → PRACTICE</p>
            <h3 id="studio-learning-recommendations-title" className="mt-1 text-[0.82rem] font-bold text-fg">
              지금 바로 도움이 되는 강좌와 자료
            </h3>
          </div>
          <a
            href={libraryHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-[0.65rem] font-bold text-fg hover:bg-raised",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
              STUDIO_TOUCH_TARGET,
            )}
          >
            전체 자료 보기 <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {resources.map((resource) => (
            <article key={resource.id} className="flex min-w-0 flex-col rounded-xl border border-line bg-card/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[0.58rem] text-fg-3">
                <span>{resource.provider}</span>
                <span>{RESOURCE_FORMAT_LABELS[resource.format]} · {resource.external ? "외부 공식 자료" : "자체 강좌"}</span>
              </div>
              <h4 className="mt-2 text-[0.76rem] font-bold leading-snug text-fg">{resource.title}</h4>
              <p className="mt-1 flex-1 text-[0.64rem] leading-relaxed text-fg-3">{resource.summary}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent-soft px-2.5 text-[0.62rem] font-bold text-accent hover:bg-accent/15",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                    STUDIO_TOUCH_TARGET,
                  )}
                >
                  {resource.external ? "원문 보기" : "강좌 보기"} <ExternalLink className="size-3" aria-hidden />
                </a>
                {resource.practicePath && resource.practicePath !== "/studio" && (
                  <a
                    href={resource.practicePath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "inline-flex items-center gap-1 rounded-lg border border-line bg-raised px-2.5 text-[0.62rem] font-bold text-fg hover:bg-card",
                      STUDIO_EASE,
                      STUDIO_FOCUS_RING,
                      STUDIO_TOUCH_TARGET,
                    )}
                  >
                    <FlaskConical className="size-3" aria-hidden /> 실습 열기
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <p className="rounded-lg border border-line bg-card px-3 py-2 text-[0.61rem] leading-relaxed text-fg-3">
        학습 링크는 현재 작업을 잃지 않도록 새 탭에서 엽니다. 외부 자료는 검증된 공식·공공 출처의 원문으로 이동합니다.
      </p>
    </div>
  );
}
