import {
  ArrowRight,
  BookOpen,
  Boxes,
  Brush,
  Clock3,
  FileOutput,
  PackageCheck,
  Search,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";

import Link from "@/compat/router-link";
import { WorkflowTrustBadge } from "@/shared/components/WorkflowTrustBadge";
import {
  creatorRecentDestinationDescription,
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
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("ProductIntentStart", ko, en);

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
    watch: "8분 24초로 ToonStudio 전체 이해하기",
    watchBody: "실제 제품 화면을 따라 기획·드로잉·3D·협업·검토·게시 준비까지 9개 챕터로 자세히 살펴보세요.",
    filmLabel: "FULL PRODUCT TOUR · 08:24",
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
    watch: "Understand all of ToonStudio in 8m24s",
    watchBody: "Follow real product screens across nine chapters covering planning, drawing, 3D, collaboration, review and publishing preparation.",
    filmLabel: "FULL PRODUCT TOUR · 08:24",
  },
} as const;

export function ProductIntentStart() {
  useBilingualI18nRevision();
  const language = useI18n((state) => state.lang);
  const locale = resolveProductLocale(language);
  const copy = bi((COPY).ko, (COPY).en);
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
                <Link href={destination.href} title={bi((destination.description).ko, (destination.description).en)}>
                  <span className="cf-intent-card-media" aria-hidden="true">
                    <img src={visual.image} alt="" loading="lazy" decoding="async" />
                    <span className="cf-intent-card-icon"><Icon size={18} /></span>
                  </span>
                  <span className="cf-intent-card-copy">
                    <strong>{bi((destination.label).ko, (destination.label).en)}</strong>
                    <small>{bi((destination.description).ko, (destination.description).en)}</small>
                  </span>
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </motion.div>
            );
          })}
        </nav>
      </div>
      <aside>
        <div className="cf-intent-recent">
          <p><Clock3 size={16} aria-hidden="true" />{copy.recent}</p>
          <Link className="cf-recent-card" href={recent?.href ?? "/studio/projects"}>
            <strong>{recent ? creatorDestinationLabel(recent.id, locale) : copy.fallback}</strong>
            <span>{recent ? creatorRecentDestinationDescription(recent, locale) : copy.fallbackBody}</span>
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
