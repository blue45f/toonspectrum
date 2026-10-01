import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { Layers, Scale, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

import Link from "@/shared/navigation/router-link";
import { usePathname } from "@/shared/navigation/navigation";
import { cx } from "@/shared/lib/cx";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("AboutSectionNav", ko, en);

interface AboutNavItem {
  readonly href: string;
  readonly icon: LucideIcon;
  readonly ko: { readonly label: string; readonly description: string };
  readonly en: { readonly label: string; readonly description: string };
  /** 하위 경로도 이 탭의 위치로 표시한다. */
  readonly includesDescendants?: boolean;
}

const ABOUT_ITEMS: readonly AboutNavItem[] = [
  {
    href: "/about",
    icon: Sparkles,
    ko: { label: "서비스 소개", description: "ToonStudio가 연결하는 창작 경험" },
    en: { label: "Service", description: "How ToonStudio connects creation" },
  },
  {
    href: "/about/workflow",
    icon: Layers,
    ko: { label: "웹툰 제작 과정", description: "기획부터 저장·연재까지" },
    en: { label: "Webtoon workflow", description: "From planning to saving and release" },
  },
  {
    href: "/about/technology",
    icon: Wrench,
    ko: { label: "기술과 신뢰", description: "브라우저 작업실을 만드는 기술" },
    en: { label: "Technology & trust", description: "Technology behind the browser studio" },
    includesDescendants: true,
  },
  {
    href: "/about/principles",
    icon: Scale,
    ko: { label: "제품 원칙", description: "창작 흐름·권리·AI·접근성 기준" },
    en: { label: "Product principles", description: "Creative flow, rights, AI and accessibility" },
  },
];

interface AboutSectionNavProps {
  readonly className?: string;
  /**
   * `full`: 아이콘·이름·한 줄 설명 카드(소개 첫 화면용).
   * `compact`: 한 줄 탭(기술 하위 페이지처럼 본문이 긴 화면용).
   */
  readonly variant?: "full" | "compact";
}

/**
 * 서비스·제작 과정·기술·제품 원칙을 하나의 소개 흐름으로 묶는다.
 * 좁은 화면에서는 세로로 쌓지 않고 가로로 넘겨 보게 해 본문이 첫 화면에 보이도록 한다.
 */
export function AboutSectionNav({ className, variant = "full" }: AboutSectionNavProps) {
  useBilingualI18nRevision();
  const pathname = usePathname().replace(/\/+$/u, "") || "/";
  const compact = variant === "compact";
  const scrollerRef = useRef<HTMLDivElement>(null);

  // 가로로 넘기는 좁은 화면에서도 현재 탭이 보이도록 가로 위치만 맞춘다(세로 스크롤은 바꾸지 않음).
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const active = scroller?.querySelector<HTMLElement>("[aria-current]");
    if (!scroller || !active || scroller.scrollWidth <= scroller.clientWidth) return;
    const offset = active.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
    scroller.scrollLeft = Math.max(0, offset - (scroller.clientWidth - active.offsetWidth) / 2);
  }, [pathname]);

  return (
    <nav
      aria-label={bi("ToonStudio 소개 메뉴", "ToonStudio introduction")}
      className={cx(
        "rounded-3xl border border-line/70 bg-panel/70 shadow-sm backdrop-blur-xl",
        compact ? "p-1.5" : "p-2",
        className,
      )}
    >
      <div
        ref={scrollerRef}
        className={cx(
          "flex snap-x gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]",
          !compact && "sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-4",
        )}
      >
        {ABOUT_ITEMS.map((item) => {
          const Icon = item.icon;
          const copy = bi(item.ko, item.en);
          const exact = pathname === item.href;
          const descendant = Boolean(item.includesDescendants) && pathname.startsWith(`${item.href}/`);
          const active = exact || descendant;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={exact ? "page" : descendant ? "location" : undefined}
              className={cx(
                "group flex shrink-0 snap-start border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                compact
                  ? "min-h-11 items-center gap-2 whitespace-nowrap rounded-2xl px-3 text-sm font-bold"
                  : "min-h-20 w-[15.5rem] items-start gap-3 rounded-2xl px-4 py-3 text-left sm:w-auto",
                active
                  ? "border-accent/45 bg-card text-fg shadow-sm"
                  : "border-transparent text-fg-2 hover:border-line hover:bg-raised/70 hover:text-fg",
              )}
            >
              <span
                className={cx(
                  "grid shrink-0 place-items-center border transition-colors",
                  compact ? "size-7 rounded-lg" : "mt-0.5 size-9 rounded-xl",
                  active
                    ? "border-accent/35 bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3 group-hover:text-accent",
                )}
              >
                <Icon size={compact ? 14 : 17} aria-hidden="true" />
              </span>
              {compact ? (
                <span>{copy.label}</span>
              ) : (
                <span className="min-w-0">
                  <span className="block font-display text-sm font-bold">{copy.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-fg-3">{copy.description}</span>
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
