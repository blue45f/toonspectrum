import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { Eye, Globe2, Images, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import "./studio-publish-visual-journey.css";

export type StudioPublishVisualStep = "content" | "distribution" | "review";

const STEPS = [
  {
    id: "content" as const,
    icon: Images,
    label: "01 · MANUSCRIPT",
    title: "원고를 독자가 볼 순서로 정리",
    body: "이미지를 추가하면 첫 장을 표지로 보고, 순서·크기·호환성을 먼저 확인합니다.",
    image: "/brand/atelier-process.webp",
    image640: "/brand/atelier-process-640.webp",
    image960: "/brand/atelier-process-960.webp",
    alt: "러프에서 선화와 완성 컬러로 이어지는 웹툰 제작 과정",
  },
  {
    id: "distribution" as const,
    icon: Globe2,
    label: "02 · DISTRIBUTION",
    title: "공개 범위와 시점을 결과 기준으로 선택",
    body: "전체 공개·링크 공개·비공개와 즉시·예약 공개를 한 흐름에서 결정합니다.",
    image: "/brand/production-os-hero.svg",
    alt: "원고와 검토, 배포 설정이 연결된 ToonStudio 제품 화면",
  },
  {
    id: "review" as const,
    icon: Eye,
    label: "03 · READER VIEW",
    title: "게시 전에 독자 화면으로 최종 확인",
    body: "세로 스크롤·페이지 보기와 사전검사 결과를 확인한 뒤에만 게시합니다.",
    image: "/brand/atelier-world.webp",
    image640: "/brand/atelier-world-640.webp",
    image960: "/brand/atelier-world-960.webp",
    alt: "완성된 웹툰 장면을 보여주는 오리지널 ToonStudio 일러스트",
  },
] as const;

function Visual({ step }: { readonly step: (typeof STEPS)[number] }) {
  if ("image640" in step && step.image640 && "image960" in step && step.image960) {
    return (
      <picture>
        <source media="(max-width: 720px)" srcSet={step.image640} />
        <source media="(max-width: 1200px)" srcSet={step.image960} />
        <img src={step.image} alt={step.alt} loading="lazy" decoding="async" />
      </picture>
    );
  }
  return <img src={step.image} alt={step.alt} loading="lazy" decoding="async" />;
}

export function StudioPublishVisualJourney({
  activeStep,
  disabled,
  onSelect,
}: {
  readonly activeStep: StudioPublishVisualStep;
  readonly disabled?: boolean;
  readonly onSelect: (step: StudioPublishVisualStep) => void;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <section className="studio-publish-visual-journey" aria-label={translateCurrentStaticSourceText("domains.creator.StudioPublishVisualJourney", "ko", "게시 흐름 미리보기")}>
      <div className="studio-publish-visual-journey__intro">
        <span><ShieldCheck size={14} aria-hidden="true" /> {translateCurrentStaticSourceText("domains.creator.StudioPublishVisualJourney", "ko", "결과를 보면서 3단계로 게시해요")}</span>
        <p>{translateCurrentStaticSourceText("domains.creator.StudioPublishVisualJourney", "ko", "기술 설정을 한꺼번에 보여주지 않고, 원고 → 공개 방식 → 독자 화면 순서로 필요한 결정만 꺼냅니다.")}</p>
      </div>
      <div className="studio-publish-visual-journey__grid">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const active = step.id === activeStep;
          return (
            <motion.button
              key={step.id}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onSelect(step.id)}
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: .36, delay: index * .055, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="studio-publish-visual-journey__media"><Visual step={step} /><span className="studio-publish-visual-journey__icon"><Icon size={18} aria-hidden="true" /></span></span>
              <span className="studio-publish-visual-journey__copy"><small>{step.label}</small><strong>{step.title}</strong><span>{step.body}</span></span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
