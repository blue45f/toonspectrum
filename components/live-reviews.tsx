"use client";

import { useEffect, useState } from "react";
import type { SeedReview } from "@/lib/types";
import { ReviewCard } from "./review-card";
import { useApp } from "@/lib/store";

// 상세 페이지: DB에 저장된 실제 사용자 리뷰(공유)를 불러와 시드 리뷰 위에 표시.
// 내가 로그인해 쓴 리뷰도 즉시 여기에 반영(저장 후 재요청).
export function LiveReviews({ titleId }: { titleId: string }) {
  const [reviews, setReviews] = useState<SeedReview[]>([]);
  // 내 리뷰가 바뀌면(작성/삭제) 다시 불러오기
  const myReview = useApp((s) => s.reviews[titleId]);
  const userId = useApp((s) => s.userId);

  useEffect(() => {
    let alive = true;
    fetch(`/api/titles/${titleId}/reviews`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: SeedReview[]) => {
        if (alive) setReviews(Array.isArray(d) ? d : []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [titleId, myReview, userId]);

  if (reviews.length === 0) return null;

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-good/40 bg-[oklch(0.8_0.15_150/0.12)] px-2 py-0.5 text-[0.65rem] font-semibold text-good">
          실사용자
        </span>
        <span className="text-xs text-fg-3">DB에 저장된 독자 리뷰 {reviews.length}</span>
      </div>
      {reviews.map((r) => (
        <ReviewCard key={r.id} review={r} />
      ))}
    </>
  );
}
