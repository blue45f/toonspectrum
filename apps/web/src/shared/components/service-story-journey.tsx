import {
  Clapperboard,
  Compass,
  Cpu,
  Film,
  LibraryBig,
  Presentation,
  type LucideIcon,
} from "lucide-react";

import Link from "@/shared/navigation/router-link";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { cx } from "@/shared/lib/cx";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("ServiceStoryJourney", ko, en);

export type ServiceStoryJourneyId =
  | "tour"
  | "brand"
  | "story"
  | "playbook"
  | "deck"
  | "film";

interface JourneyItem {
  readonly id: ServiceStoryJourneyId;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly ko: string;
  readonly en: string;
  readonly koDescription: string;
  readonly enDescription: string;
}
const JOURNEY_ITEMS: readonly JourneyItem[] = [
  {
    id: "tour",
    href: "/product-tour",
    icon: Compass,
    ko: "서비스 전체 흐름",
    en: "Service journey",
    koDescription: "기획에서 게시 준비까지 제품 동선",
    enDescription: "The product journey from planning to delivery",
  },
  {
    id: "brand",
    href: "/brand-film",
    icon: Clapperboard,
    ko: "브랜드 필름",
    en: "Brand film",
    koDescription: "24초로 보는 창작 방향과 감성",
    enDescription: "A 24-second view of the creative direction",
  },
  {
    id: "story",
    href: "/about/technology/story",
    icon: Cpu,
    ko: "기술 스토리",
    en: "Engineering story",
    koDescription: "아키텍처 결정과 실제 근거",
    enDescription: "Architecture decisions and evidence",
  },
  {
    id: "playbook",
    href: "/about/technology/playbook#benchmarks",
    icon: LibraryBig,
    ko: "벤치마크·재사용",
    en: "Benchmarks · reuse",
    koDescription: "배운 점, 적용과 주장하지 않는 범위",
    enDescription: "Lessons, application and claim boundaries",
  },  {
    id: "deck",
    href: "/about/technology/deck",
    icon: Presentation,
    ko: "웹 발표 자료",
    en: "Web presentation",
    koDescription: "필요한 깊이만 선택하는 발표 모드",
    enDescription: "Presentation modes at the needed depth",
  },
  {
    id: "film",
    href: "/about/technology/videos",
    icon: Film,
    ko: "기술 영상",
    en: "Engineering film",
    koDescription: "동일 원본에서 만드는 Remotion 영상",
    enDescription: "Remotion films from the same source",
  },
];

export function ServiceStoryJourney({
  current,
  className,
}: {
  readonly current: ServiceStoryJourneyId;
  readonly className?: string;
}) {
  useBilingualI18nRevision();

  return (
    <nav
      className={cx(
        "rounded-[2rem] border border-line/70 bg-panel/65 p-3 shadow-sm",
        className,
      )}
      aria-label={bi("서비스 소개와 기술 스토리 흐름", "Service and engineering story journey")}
    >      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {JOURNEY_ITEMS.map((item, index) => {
          const Icon = item.icon;
          const active = item.id === current;
          return (
            <li key={item.id} className="min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "group flex min-h-full gap-3 rounded-2xl border px-3 py-3 transition-colors",
                  active
                    ? "border-accent bg-accent text-on-accent"
                    : "border-transparent bg-card/75 text-fg hover:border-accent/35 hover:text-accent",
                )}
              >
                <span
                  className={cx(
                    "grid size-8 shrink-0 place-items-center rounded-xl text-xs font-black",
                    active ? "bg-white/15" : "bg-accent-soft text-accent",
                  )}
                  aria-hidden="true"
                >
                  {active ? <Icon size={15} /> : index + 1}
                </span>
                <span className="min-w-0">
                  <strong className="block text-xs font-black">
                    {bi(item.ko, item.en)}
                  </strong>
                  <span
                    className={cx(
                      "mt-1 block text-[0.66rem] leading-5",
                      active ? "text-on-accent/80" : "text-fg-3 group-hover:text-fg-2",
                    )}
                  >
                    {bi(item.koDescription, item.enDescription)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
