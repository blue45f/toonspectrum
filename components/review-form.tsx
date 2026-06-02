"use client";

import { useState } from "react";
import { useApp, useHydrated } from "@/lib/store";
import { RatingInput, ScaleSwitcher } from "./rating-input";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { Check, Trash2, AlertTriangle } from "lucide-react";

const SUGGESTED = [
  "몰입감",
  "그림체甲",
  "사이다",
  "정주행각",
  "강추",
  "킬링타임",
  "후반부아쉬움",
  "호불호",
  "캐릭터매력",
  "스토리탄탄",
];

export function ReviewForm({ titleId }: { titleId: string }) {
  const hydrated = useHydrated();
  const existing = useApp((s) => s.reviews[titleId]);
  const upsert = useApp((s) => s.upsertReview);
  const remove = useApp((s) => s.deleteReview);

  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [text, setText] = useState(existing?.text ?? "");
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [spoiler, setSpoiler] = useState(existing?.spoiler ?? false);
  const [saved, setSaved] = useState(false);

  // 하이드레이션 후 기존 리뷰 동기화 (최초 1회)
  const [synced, setSynced] = useState(false);
  if (hydrated && !synced && existing) {
    setRating(existing.rating);
    setText(existing.text);
    setTags(existing.tags);
    setSpoiler(existing.spoiler);
    setSynced(true);
  }

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].slice(0, 5)));

  const submit = () => {
    if (rating === 0) return;
    upsert({
      titleId,
      rating,
      text: text.trim(),
      tags,
      spoiler,
      createdAt: new Date().toISOString(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-line bg-card p-5 surface-hl">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-fg">
          {existing ? "내 리뷰 수정" : "이 작품 평가하기"}
        </h3>
        <ScaleSwitcher />
      </div>

      <RatingInput value={rating} onChange={setRating} />

      <label htmlFor="review-text" className="sr-only">
        리뷰 내용
      </label>
      <textarea
        id="review-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="이 작품, 한 줄로 어땠나요? 스포일러는 아래 토글을 켜주세요."
        className="w-full resize-none rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm leading-relaxed text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent/60"
      />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="태그 선택">
        {SUGGESTED.map((t) => {
          const on = tags.includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleTag(t)}
              aria-pressed={on}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                on
                  ? "border-accent/60 bg-accent-soft text-accent"
                  : "border-line bg-raised/50 text-fg-3 hover:text-fg"
              )}
            >
              {t}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setSpoiler((s) => !s)}
          aria-pressed={spoiler}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            spoiler ? "border-warn/50 bg-[oklch(0.82_0.15_80/0.12)] text-warn" : "border-line text-fg-3 hover:text-fg-2"
          )}
        >
          <AlertTriangle size={14} />
          스포일러 포함 {spoiler ? "ON" : "OFF"}
        </button>

        <div className="flex items-center gap-2">
          {existing && (
            <Button variant="quiet" size="sm" onClick={() => remove(titleId)}>
              <Trash2 size={15} /> 삭제
            </Button>
          )}
          <Button size="sm" onClick={submit} disabled={rating === 0}>
            {saved ? (
              <>
                <Check size={15} /> 저장됨
              </>
            ) : existing ? (
              "수정 저장"
            ) : (
              "리뷰 등록"
            )}
          </Button>
        </div>
      </div>
      <p className="text-[0.7rem] text-fg-3">
        평가는 이 브라우저에만 저장됩니다 (localStorage). 별점은 {`'`}내 서재{`'`}의 취향 분석에 반영돼요.
      </p>
    </div>
  );
}
