import Link from "@/shared/navigation/router-link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { buttonClass } from "./ui/button-utils";
import { RevealOnScroll } from "./reveal-on-scroll";
import "./illustrated-feature-card.css";

interface IllustratedFeatureCardProps {
  readonly imageSrc: string;
  readonly imageAlt: string;
  readonly eyebrow?: string;
  readonly title: string;
  readonly body: string;
  /** 단일 CTA 원칙 — 카드당 액션은 하나만. */
  readonly href: string;
  readonly actionLabel: string;
  readonly className?: string;
  readonly eager?: boolean;
}

/**
 * 기능 소개용 일러스트 카드.
 * 이미지(상단) + 짧은 설명 + 액션 하나. 여러 버튼을 나열하지 않고
 * "보는 재미 → 한 번의 다음 행동"으로 동선을 단순화한다.
 */
export function IllustratedFeatureCard({
  imageSrc,
  imageAlt,
  eyebrow,
  title,
  body,
  href,
  actionLabel,
  className,
  eager = false,
}: IllustratedFeatureCardProps) {
  return (
    <RevealOnScroll
      className={cn("illustrated-feature-card", className)}
    >
      <div className="illustrated-feature-card__media">
        <img
          src={imageSrc}
          alt={imageAlt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={eager ? "high" : "auto"}
          draggable={false}
        />
        <span className="illustrated-feature-card__shine" aria-hidden="true" />
      </div>
      <div className="illustrated-feature-card__copy">
        {eyebrow ? <p className="illustrated-feature-card__eyebrow">{eyebrow}</p> : null}
        <h3 className="illustrated-feature-card__title">{title}</h3>
        <p className="illustrated-feature-card__body">{body}</p>
        <Link
          href={href}
          className={buttonClass({ size: "sm", className: "illustrated-feature-card__action min-h-11" })}
        >
          {actionLabel}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </RevealOnScroll>
  );
}

export default IllustratedFeatureCard;
