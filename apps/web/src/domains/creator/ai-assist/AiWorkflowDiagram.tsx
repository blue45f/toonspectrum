import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { useScrollReveal } from "./ai-motion";

/**
 * AI 채색 3단계 도식 — 텍스트가 아니라 다이어그램으로 설명.
 * 스크롤 시 순차 등장 + 연결선 흐름 애니메이션.
 */
export function AiWorkflowDiagram() {
  const t = useBilingual("ai-assist");
  const { ref, visible } = useScrollReveal<HTMLDivElement>();

  const steps = [
    {
      icon: (
        <svg viewBox="0 0 48 48" className="ai-flow__icon" aria-hidden="true">
          <rect x="8" y="8" width="32" height="32" rx="8" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="5 4" />
          <circle cx="24" cy="24" r="7" fill="currentColor" className="ai-flow__pulse" />
        </svg>
      ),
      title: t("탭으로 힌트 배치", "Tap to drop hints"),
      desc: t("색을 골라 영역을 톡톡", "Pick a color, tap an area"),
    },
    {
      icon: (
        <svg viewBox="0 0 48 48" className="ai-flow__icon" aria-hidden="true">
          <path d="M24 6 L28 20 L42 24 L28 28 L24 42 L20 28 L6 24 L20 20 Z" fill="currentColor" className="ai-flow__sparkle" />
        </svg>
      ),
      title: t("AI가 채색", "AI colors it"),
      desc: t("경계·음영·광원 자동 계산", "Boundaries, shade & light"),
    },
    {
      icon: (
        <svg viewBox="0 0 48 48" className="ai-flow__icon" aria-hidden="true">
          <rect x="6" y="10" width="36" height="28" rx="6" fill="none" stroke="currentColor" strokeWidth="3" />
          <line x1="24" y1="10" x2="24" y2="38" stroke="currentColor" strokeWidth="3" />
          <circle cx="24" cy="24" r="5" fill="currentColor" />
        </svg>
      ),
      title: t("비교하고 다듬기", "Compare & tweak"),
      desc: t("Before/After 슬라이더로 확인", "Before/After slider"),
    },
  ];

  return (
    <div
      ref={ref}
      className={`ai-flow${visible ? " is-visible" : ""}`}
      role="list"
      aria-label={t("AI 채색 동작 방식", "How AI coloring works")}
    >
      {steps.map((step, i) => (
        <div
          key={step.title}
          className="ai-flow__step"
          role="listitem"
          style={{ transitionDelay: `${i * 140}ms` }}
        >
          <div className="ai-flow__badge" aria-hidden="true">{i + 1}</div>
          <div className="ai-flow__iconwrap">{step.icon}</div>
          <div className="ai-flow__title">{step.title}</div>
          <div className="ai-flow__desc">{step.desc}</div>
          {i < steps.length - 1 && (
            <svg viewBox="0 0 40 24" className="ai-flow__connector" aria-hidden="true">
              <path
                d="M4 12 H32 M28 6 L36 12 L28 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="ai-flow__dash"
              />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}
