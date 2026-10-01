import { ErrorState } from "@/shared/components/feedback/error-state";
import { Rail, Section } from "@/shared/components/section";
import { TitleCard } from "@/shared/components/title-card";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  buildDiscoverShelves,
  currentKstWeekDay,
  englishWeekDay,
  type DiscoverHomeSnapshot,
  type DiscoverShelfId,
} from "./discover-home";

const SKELETON_SHELF_COUNT = 2;
const SKELETON_CARD_COUNT = 6;

function ShelfSkeleton({ label }: { readonly label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="skeleton-group">
      <span data-slot="skeleton" className="skeleton block h-3 w-20" aria-hidden="true" />
      <span data-slot="skeleton" className="skeleton mt-2 block h-6 w-56 max-w-full" aria-hidden="true" />
      <div className="mt-4 flex gap-3 overflow-hidden" aria-hidden="true">
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
          <div key={index} className="w-[150px] shrink-0 sm:w-[172px]">
            <span data-slot="skeleton" className="skeleton block aspect-[3/4] w-full rounded-2xl" />
            <span data-slot="skeleton" className="skeleton mt-2.5 block h-3.5 w-4/5" />
            <span data-slot="skeleton" className="skeleton mt-1.5 block h-3 w-3/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface ShelfCopy {
  readonly eyebrow: string;
  readonly title: string;
  readonly desc: string;
  readonly action: string;
}

export interface DiscoverShelvesProps {
  readonly snapshot: DiscoverHomeSnapshot | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRetry: () => void;
}

/**
 * 탐색 허브의 작품 레일 — 요일 연재·평점·무료·최신 네 줄을 실제 카탈로그 스냅샷으로 보여 준다.
 * 불러오는 동안에는 레일 모양 스켈레톤, 실패하면 재시도 블록을 같은 자리에 둔다.
 */
export function DiscoverShelves({ snapshot, loading, error, onRetry }: DiscoverShelvesProps) {
  const bt = useBilingual("DiscoverShelves");

  if (!snapshot) {
    if (error) {
      return (
        <ErrorState
          title={bt("추천 작품을 불러오지 못했어요", "Couldn't load the story picks")}
          message={bt(
            "검색과 아래 탐색 도구는 그대로 쓸 수 있어요. 잠시 뒤 다시 시도해 주세요.",
            "Search and the discovery tools below still work. Please try again in a moment.",
          )}
          onRetry={onRetry}
          className="p-8"
        />
      );
    }
    if (!loading) return null;
    const label = bt("추천 작품을 불러오는 중", "Loading story picks");
    return (
      <div className="flex flex-col gap-12">
        {Array.from({ length: SKELETON_SHELF_COUNT }, (_, index) => <ShelfSkeleton key={index} label={label} />)}
      </div>
    );
  }

  const day = snapshot.todayDay;
  const isToday = day === currentKstWeekDay();
  const copies: Record<DiscoverShelfId, ShelfCopy> = {
    weekday: {
      eyebrow: isToday ? "TODAY" : "WEEKLY",
      title: isToday
        ? bt("오늘 업데이트되는 웹툰", "Webtoons updating today")
        : formatI18nTemplate(bt("{v0}요일 연재 인기작", "Popular {v0} serials"), { v0: bt(day, englishWeekDay(day)) }),
      desc: bt("연재 중인 웹툰을 조회 신호가 높은 순서로 보여 줘요.", "Ongoing webtoons, highest view signals first."),
      action: bt("연재 캘린더", "Release calendar"),
    },
    "top-rated": {
      eyebrow: "TOP RATED",
      title: bt("평점 랭킹 상위 작품", "Top of the rating ranking"),
      desc: bt("통합 랭킹의 평점 산식으로 고른 작품이에요.", "Picked with the unified ranking's rating formula."),
      action: bt("평점 랭킹 보기", "Rating ranking"),
    },
    free: {
      eyebrow: "FREE TO START",
      title: bt("무료·기다리면 무료로 시작", "Start free or wait-for-free"),
      desc: bt("무료 또는 기다리면 무료로 볼 수 있는 인기작이에요.", "Popular stories you can start free or wait-for-free."),
      action: bt("무료 작품 더 보기", "More free stories"),
    },
    newest: {
      eyebrow: "NEW",
      title: bt("최근 공개된 작품", "Recently released"),
      desc: bt("공개 연도가 가까운 작품부터 보여 줘요.", "Stories with the most recent release year first."),
      action: bt("탐색에서 더 보기", "More in Explore"),
    },
  };

  return (
    <div className="flex flex-col gap-12 sm:gap-14" data-discover-shelves="">
      {buildDiscoverShelves(snapshot).map((shelf) => {
        const copy = copies[shelf.id];
        return (
          <Section
            key={shelf.id}
            eyebrow={copy.eyebrow}
            title={copy.title}
            desc={copy.desc}
            action={{ label: copy.action, href: shelf.href }}
          >
            <Rail ariaLabel={copy.title}>
              {shelf.titles.map((item) => (
                <TitleCard key={item.id} title={item} />
              ))}
            </Rail>
          </Section>
        );
      })}
    </div>
  );
}
