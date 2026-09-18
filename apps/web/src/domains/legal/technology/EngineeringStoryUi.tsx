import {
  BookOpen,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Film,
  FlaskConical,
  LibraryBig,
  Presentation,
  Scale,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";

import Link from "@/compat/router-link";
import { usePathname } from "@/compat/navigation";
import { cx } from "@/shared/lib/cx";

import {
  ENGINEERING_STATUS_META,
  type EngineeringLocale,
  type EngineeringStatus,
} from "./engineering-story-content";
import { useEngineeringLocale } from "./use-engineering-locale";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("EngineeringStoryUi", ko, en);

const NAV_ITEMS = [
  {
    href: "/about/technology/story",
    icon: BookOpen,
    ko: "제작 스토리",
    en: "Story",
  },
  {
    href: "/about/technology/guides",
    icon: Wrench,
    ko: "적용 가이드",
    en: "Guides",
  },
  {
    href: "/about/technology/references",
    icon: LibraryBig,
    ko: "참고·장애 기록",
    en: "References",
  },
  {
    href: "/about/technology/field-notes",
    icon: FlaskConical,
    ko: "기술 심화",
    en: "Field notes",
  },
  {
    href: "/about/technology/deck",
    icon: Presentation,
    ko: "발표 모드",
    en: "Deck",
  },
  {
    href: "/about/technology/videos",
    icon: Film,
    ko: "영상 제작",
    en: "Video",
  },
  {
    href: "/about/technology/licenses",
    icon: Scale,
    ko: "라이선스",
    en: "Licenses",
  },
] as const;

const STATUS_STYLES: Record<EngineeringStatus, string> = {
  live: "border-success/35 bg-success-soft/25 text-success",
  configured: "border-accent/35 bg-accent-soft text-accent",
  experimental: "border-warning/35 bg-warning-soft/25 text-warning",
  documented: "border-line-strong bg-raised text-fg-2",
  planned: "border-info/35 bg-info-soft/20 text-info",
  retired: "border-danger/35 bg-danger-soft/20 text-danger",
  "reference-only": "border-line bg-card text-fg-3",
};

const STATUS_ICONS = {
  live: CheckCircle2,
  configured: CircleDot,
  experimental: FlaskConical,
  documented: BookOpen,
  planned: CircleDashed,
  retired: CircleDashed,
  "reference-only": CircleDot,
} as const;

export function EngineeringStatusBadge({
  status,
  locale: _locale,
  className,
}: {
  readonly status: EngineeringStatus;
  readonly locale: EngineeringLocale;
  readonly className?: string;
}) {
  useBilingualI18nRevision();
  const Icon = STATUS_ICONS[status];
  const meta = ENGINEERING_STATUS_META[status];

  return (
    <span
      className={cx(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 font-display text-[0.66rem] font-bold",
        STATUS_STYLES[status],
        className,
      )}
      title={bi((meta.description).ko, (meta.description).en)}
    >
      <Icon size={12} aria-hidden="true" />
      {bi((meta.label).ko, (meta.label).en)}
    </span>
  );
}

export function EngineeringStoryNav({ className }: { readonly className?: string }) {
  useBilingualI18nRevision();
  const pathname = usePathname();


  return (
    <nav
      aria-label={bi("기술 스토리 세부 메뉴", "Engineering story sections")}
      className={cx(
        "rounded-3xl border border-line/70 bg-panel/75 p-2 shadow-sm backdrop-blur-xl",
        className,
      )}
    >
      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "group flex min-h-12 items-center gap-2.5 rounded-2xl border px-3 py-2 text-sm font-bold transition-colors",
                active
                  ? "border-accent/45 bg-card text-fg shadow-sm"
                  : "border-transparent text-fg-2 hover:border-line hover:bg-raised hover:text-fg",
              )}
            >
              <span
                className={cx(
                  "grid size-8 shrink-0 place-items-center rounded-xl border",
                  active
                    ? "border-accent/35 bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3 group-hover:text-accent",
                )}
              >
                <Icon size={15} aria-hidden="true" />
              </span>
              <span>{bi((item).ko, (item).en)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function EngineeringPageIntro({
  eyebrow,
  title,
  description,
  aside,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly aside?: ReactNode;
}) {
  useBilingualI18nRevision();
  return (
    <header className="grid gap-7 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div>
        <p className="eyebrow text-accent">{eyebrow}</p>
        <h1 className="mt-4 max-w-4xl text-balance text-3xl font-black tracking-tight text-fg sm:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base sm:leading-8">
          {description}
        </p>
      </div>
      {aside ? <div className="lg:max-w-sm">{aside}</div> : null}
    </header>
  );
}
