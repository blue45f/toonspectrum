import Link from "next/link";
import { cn } from "@/lib/utils";

export type ReviewSort = "recent" | "likes" | "high" | "low";

const TABS: { value: ReviewSort; label: string }[] = [
  { value: "recent", label: "최신순" },
  { value: "likes", label: "공감순" },
  { value: "high", label: "별점 높은순" },
  { value: "low", label: "별점 낮은순" },
];

// 서버 렌더 정렬 탭 — searchParams로 동작 (Link 기반). 알약형 세그먼티드 룩.
export function SortTabs({ active }: { active: ReviewSort }) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full border border-line bg-panel p-1"
      role="tablist"
      aria-label="리뷰 정렬"
    >
      {TABS.map((t) => {
        const isActive = t.value === active;
        return (
          <Link
            key={t.value}
            role="tab"
            aria-selected={isActive}
            href={t.value === "recent" ? "/reviews" : `/reviews?sort=${t.value}`}
            scroll={false}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-150",
              isActive
                ? "bg-accent text-on-accent"
                : "text-fg-2 hover:text-fg"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
