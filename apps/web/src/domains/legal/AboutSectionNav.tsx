import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { Layers, Scale, Sparkles, Wrench } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { usePathname } from "@/shared/navigation/navigation";
import { cx } from "@/shared/lib/cx";


const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("AboutSectionNav", ko, en);

const ABOUT_ITEMS = [
  {
    href: "/about",
    icon: Sparkles,
    ko: {
      label: "서비스 소개",
      description: "ToonStudio가 연결하는 창작 경험",
    },
    en: {
      label: "Service",
      description: "How ToonStudio connects creation",
    },
  },
  {
    href: "/about/workflow",
    icon: Layers,
    ko: {
      label: "웹툰 제작 과정",
      description: "기획부터 저장·연재까지",
    },
    en: {
      label: "Webtoon workflow",
      description: "From planning to saving and release",
    },
  },
  {
    href: "/about/technology",
    icon: Wrench,
    ko: {
      label: "기술과 신뢰",
      description: "브라우저 작업실을 만드는 기술",
    },
    en: {
      label: "Technology & trust",
      description: "Technology behind the browser studio",
    },
  },
  {
    href: "/about/principles",
    icon: Scale,
    ko: {
      label: "제품 원칙",
      description: "창작 흐름·권리·AI·접근성 기준",
    },
    en: {
      label: "Product principles",
      description: "Creative flow, rights, AI and accessibility",
    },
  },
] as const;

interface AboutSectionNavProps {
  readonly className?: string;
}

/** Keep service, workflow, technology and product principles discoverable as one product story. */
export function AboutSectionNav({ className }: AboutSectionNavProps) {
  useBilingualI18nRevision();
  const pathname = usePathname();



  return (
    <nav
      aria-label={bi("ToonStudio 소개 메뉴", "ToonStudio introduction")}
      className={cx(
        "rounded-3xl border border-line/70 bg-panel/70 p-2 shadow-sm backdrop-blur-xl",
        className,
      )}
    >
      <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-4">
        {ABOUT_ITEMS.map((item) => {
          const Icon = item.icon;
          const copy = bi((item).ko, (item).en);
          const exact = pathname === item.href;
          const descendant = item.href === "/about/technology" && pathname.startsWith("/about/technology/");
          const active = exact || descendant;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={exact ? "page" : descendant ? "location" : undefined}
              className={cx(
                "group flex min-h-20 items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200",
                active
                  ? "border-accent/45 bg-card text-fg shadow-sm"
                  : "border-transparent text-fg-2 hover:border-line hover:bg-raised/70 hover:text-fg",
              )}
            >
              <span
                className={cx(
                  "mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border transition-colors",
                  active
                    ? "border-accent/35 bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3 group-hover:text-accent",
                )}
              >
                <Icon size={17} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-sm font-bold">{copy.label}</span>
                <span className="mt-1 block text-xs leading-5 text-fg-3">{copy.description}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
