import type { ReactNode } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import { RevealOnScroll } from "./reveal-on-scroll";
import "./visual-step-guide.css";

export interface VisualStepGuideStep {
  /** 단계 일러스트 — 이미지, 도식, 다이어그램 등 시각 노드. */
  readonly illustration: ReactNode;
  readonly title: string;
  readonly body: string;
}

interface VisualStepGuideProps {
  readonly steps: ReadonlyArray<VisualStepGuideStep>;
  readonly eyebrow?: string;
  readonly heading?: string;
  readonly className?: string;
}

/**
 * 텍스트 설명을 단계별 시각 가이드로 바꿔주는 공용 컴포넌트.
 * "어떻게 하나요?" 같은 장문의 설명 대신 번호 + 일러스트 + 짧은 문장으로 보여준다.
 * - 데스크톱: 좌우 교대 2열, 모바일: 세로 스택
 * - 스크롤 진입 시 순차 등장 (reduced-motion에서는 즉시 표시)
 */
export function VisualStepGuide({ steps, eyebrow, heading, className }: VisualStepGuideProps) {
  const bt = useBilingual("VisualStepGuide");
  if (steps.length === 0) return null;
  return (
    <section
      data-slot="visual-step-guide"
      aria-label={heading ?? bt("단계별 안내", "Step-by-step guide")}
      className={cn("visual-step-guide", className)}
    >
      {eyebrow || heading ? (
        <div className="visual-step-guide__heading">
          {eyebrow ? <p className="visual-step-guide__eyebrow">{eyebrow}</p> : null}
          {heading ? <h2 className="visual-step-guide__title">{heading}</h2> : null}
        </div>
      ) : null}
      <ol className="visual-step-guide__list">
        {steps.map((step, index) => (
          <RevealOnScroll
            as="li"
            key={step.title}
            delayMs={Math.min(index * 90, 360)}
            className={cn(
              "visual-step-guide__item",
              index % 2 === 1 && "visual-step-guide__item--flip",
            )}
          >
            <span className="visual-step-guide__number" aria-hidden="true">
              {index + 1}
            </span>
            <span className="visual-step-guide__sr-step">
              {bt(`단계 ${index + 1}`, `Step ${index + 1}`)}
            </span>
            <div className="visual-step-guide__art">{step.illustration}</div>
            <div className="visual-step-guide__copy">
              <h3 className="visual-step-guide__step-title">{step.title}</h3>
              <p className="visual-step-guide__step-body">{step.body}</p>
            </div>
          </RevealOnScroll>
        ))}
      </ol>
    </section>
  );
}

export default VisualStepGuide;
