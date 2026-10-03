// 작품 카드 격자 — 처음에는 한 화면 분량만 그리고 "더 보기"로 이어 붙인다(분량 규칙은 ShowcaseMoreGrid).
import { ShowcaseMoreGrid } from "./ShowcaseMoreGrid";
import { WorkCard } from "../creator-community-ui";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { WorkSummary } from "@/platform/creator-client";

/** 처음에 보여 줄 작품 수(모바일 2열 기준 6줄, 데스크톱 5열 기준 2줄 남짓). */
export const SHOWCASE_GRID_INITIAL = 12;
/** "더 보기"를 한 번 누를 때 늘어나는 작품 수. */
export const SHOWCASE_GRID_STEP = 12;

export function ShowcaseWorkGrid({
  works,
  resetKey,
  initial = SHOWCASE_GRID_INITIAL,
  step = SHOWCASE_GRID_STEP,
}: {
  readonly works: readonly WorkSummary[];
  /** 목록 조건(정렬·필터·탭)이 바뀌면 달라지는 값 — 바뀌면 다시 처음 분량으로 돌아간다. */
  readonly resetKey: string;
  readonly initial?: number;
  readonly step?: number;
}) {
  const bt = useBilingual("ShowcaseWorkGrid");
  return (
    <ShowcaseMoreGrid
      items={works}
      itemKey={(work) => work.id}
      renderItem={(work) => <WorkCard work={work} />}
      resetKey={resetKey}
      initial={initial}
      step={step}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      moreLabel={(remaining) => formatI18nTemplate(bt("더 보기 · 남은 작품 {count}개", "Show more · {count} left"), { count: remaining })}
    />
  );
}
