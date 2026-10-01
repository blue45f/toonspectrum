import type { Title } from "@/shared/lib/types";

import { Rail, Section } from "@/shared/components/section";
import { TitleCard } from "@/shared/components/title-card";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp, useHydrated } from "@/shared/lib/store";
import { useApiResource } from "@/platform/use-api-resource";

import { orderTitlesByIds } from "./discover-home";

/** "최근 본 작품" 레일에 보여 줄 최대 수. */
export const DISCOVER_RECENT_LIMIT = 10;

/**
 * 탐색 허브의 "최근 본 작품" 레일 — 이 기기에 남은 방문 기록이 있을 때만 나타난다.
 * 작품 정보를 불러오지 못하면 레일 자체를 숨겨 첫 방문 화면과 같게 둔다(기록은 서재에서 다시 볼 수 있다).
 */
export function DiscoverRecentShelf() {
  const bt = useBilingual("DiscoverRecentShelf");
  const hydrated = useHydrated();
  const recentlyViewed = useApp((state) => state.recentlyViewed);
  const ids = hydrated ? recentlyViewed.slice(0, DISCOVER_RECENT_LIMIT) : [];
  const key = ids.join(",");
  const { data } = useApiResource<{ readonly items?: readonly Title[] }>(
    key ? `/api/titles?ids=${encodeURIComponent(key)}` : null,
    bt("최근 본 작품을 불러오지 못했습니다.", "Couldn't load recently viewed stories."),
  );
  const titles = orderTitlesByIds(ids, data?.items ?? []);
  if (titles.length === 0) return null;

  const title = bt("최근 본 작품", "Jump back in");
  return (
    <Section
      eyebrow="RECENTLY VIEWED"
      title={title}
      desc={bt("이 기기에서 둘러본 작품으로 바로 돌아가요.", "Return to the stories you browsed on this device.")}
      action={{ label: bt("내 서재", "My library"), href: "/library" }}
    >
      <Rail ariaLabel={title}>
        {titles.map((item) => (
          <TitleCard key={item.id} title={item} />
        ))}
      </Rail>
    </Section>
  );
}
