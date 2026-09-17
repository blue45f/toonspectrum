import {
  ArrowRight,
  BookOpen,
  Boxes,
  Brush,
  Clock3,
  FileOutput,
  PackageCheck,
  PlayCircle,
  Search,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";

import Link from "@/compat/router-link";
import { WorkflowTrustBadge } from "@/shared/components/WorkflowTrustBadge";
import {
  creatorDestinationDescription,
  creatorDestinationLabel,
  formatCreatorRelativeTime,
  getCreatorContinuityServerSnapshot,
  getCreatorContinuitySnapshot,
  subscribeCreatorContinuity,
} from "@/shared/lib/creator-continuity";
import { useI18n } from "@/shared/lib/i18n";
import {
  PRODUCT_START_DESTINATIONS,
  resolveProductLocale,
  type ProductStartDestinationId,
} from "@/shared/lib/product-identity";
import { useUi } from "@/shared/lib/ui-store";

interface IntentVisual {
  readonly icon: LucideIcon;
  readonly image: string;
}

const INTENT_VISUALS: Record<ProductStartDestinationId, IntentVisual> = {
  plan: { icon: BookOpen, image: "/brand/atelier-process-640.webp" },
  draw: { icon: Brush, image: "/brand/atelier-world-640.webp" },
  "three-d": { icon: Boxes, image: "/brand/production-os-workspace.svg" },
  assets: { icon: PackageCheck, image: "/brand/atelier-materials-640.webp" },
  collaborate: { icon: Workflow, image: "/brand/production-os-journey.svg" },
  publish: { icon: FileOutput, image: "/brand/production-os-hero.svg" },
};

const COPY = {
  ko: {
    eyebrow: "지금 하고 싶은 일",
    title: "설명보다, 원하는 작업부터 고르세요.",
    hint: "카드를 고르면 필요한 작업공간으로 바로 이동해요.",
    search: "프로젝트·컷·도구·소재를 바로 찾기",
    recent: "최근 작업 이어하기",
    fallback: "내 프로젝트에서 이어가기",
    fallbackBody: "최근 작품, 공유 작업과 복구할 초안을 한곳에서 확인하세요.",
    all: "모든 프로젝트 보기",
    watch: "24초로 ToonStudio 이해하기",
    watchBody: "Remotion으로 만든 짧은 브랜드 필름에서 기획부터 제작·연재까지 흐름을 먼저 확인해 보세요.",
    filmLabel: "REMOTION · 24 SEC",
  },
  en: {
    eyebrow: "Choose what you want to do",
    title: "Start with the task, not the feature list.",
    hint: "Pick a visual card and go straight to the workspace you need.",
    search: "Find projects, panels, tools and assets instantly",
    recent: "Continue recent work",
    fallback: "Continue from My projects",
    fallbackBody: "Find recent work, shared projects and recoverable drafts in one place.",
    all: "See all projects",
    watch: "Understand ToonStudio in 24 seconds",
    watchBody: "Watch the Remotion brand film to see the flow from planning through creation and publishing before reading the details.",
    filmLabel: "REMOTION · 24 SEC",
  },
} as const;

export function ProductIntentStart() {
  const language = useI18n((state) => state.lang);
  const locale = resolveProductLocale(language);
  const copy = COPY[locale];
  const openSearch = useUi((state) => state.openCommandPalette);
  const prefersReducedMotion = useReducedMotion();
  const continuity = useSyncExternalStore(
    subscribeCreatorContinuity,
    getCreatorContinuitySnapshot,
    getCreatorContinuityServerSnapshot,
  );
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const recent = continuity.recent[0] ?? null;

  return (
    <section className="cf-intent cf-intent-visual" lang={locale} aria-labelledby="product-intent-title">
      <div className="cf-intent-main">
        <p className="cf-intent-eyebrow">{copy.eyebrow}</p>
        <h2 id="product-intent-title">{copy.title}</h2>
        <p className="cf-intent-hint">{copy.hint}</p>

        <button type="button" className="cf-intent-search" onClick={openSearch}>
          <Search size={18} aria-hidden="true" />
          <span>{copy.search}</span>
          <kbd aria-hidden="true">⌘ K</kbd>
        </button>

        <nav className="cf-intent-visual-nav" aria-label={copy.title}>
          {PRODUCT_START_DESTINATIONS.map((destination, index) => {
            const visual = INTENT_VISUALS[destination.id];
            const Icon = visual.icon;
            return (
              <motion.div
                key={destination.id}
                className="cf-intent-motion-card"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
                whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.4, delay: index * 0.045, ease: [0.16, 1, 0.3, 1] }}
                whileHover={prefersReducedMotion ? undefined : { y: -4 }}
              >
                <Link href={destination.href} title={destination.description[locale]}>
                  <span className="cf-intent-card-media" aria-hidden="true">
                    <img src={visual.image} alt="" loading="lazy" decoding="async" />
                    <span className="cf-intent-card-icon"><Icon size={18} /></span>
                  </span>
                  <span className="cf-intent-card-copy">
                    <strong>{destination.label[locale]}</strong>
                    <small>{destination.description[locale]}</small>
                  </span>
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </motion.div>
            );
          })}
        </nav>
      </div>

      <aside className="cf-intent-side">
        <Link className="cf-intent-film" href="/brand-film">
          <span className="cf-intent-film-media" aria-hidden="true">
            <img src="/brand/production-os-hero.svg" alt="" loading="lazy" decoding="async" />
            <span className="cf-intent-film-play"><PlayCircle size={28} /></span>
          </span>
          <span className="cf-intent-film-copy">
            <small>{copy.filmLabel}</small>
            <strong>{copy.watch}</strong>
            <span>{copy.watchBody}</span>
          </span>
          <ArrowRight size={17} aria-hidden="true" />
        </Link>

        <div className="cf-intent-recent">
          <p><Clock3 size={16} aria-hidden="true" />{copy.recent}</p>
          <Link className="cf-recent-card" href={recent?.href ?? "/studio/projects"}>
            <strong>{recent ? creatorDestinationLabel(recent.id, locale) : copy.fallback}</strong>
            <span>{recent ? creatorDestinationDescription(recent.id, locale) : copy.fallbackBody}</span>
            {recent && now > 0 ? <small>{formatCreatorRelativeTime(recent.visitedAt, locale, now)}</small> : null}
            {recent ? <WorkflowTrustBadge state="resume-ready" locale={locale} className="w-fit" /> : null}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link className="cf-link" href="/studio/projects">
            {copy.all}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </aside>
    </section>
  );
}
