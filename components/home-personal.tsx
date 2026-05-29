"use client";

import { useEffect, useState } from "react";
import { useApp, useHydrated } from "@/lib/store";
import type { Title } from "@/lib/types";
import { buildTasteProfile, recommendForTaste } from "@/lib/recommend";
import { Section, Rail } from "./section";
import { TitleCard } from "./title-card";

// 개인화 홈 섹션 — 스토어에 기록이 있을 때만 렌더(신규 방문자엔 영향 없음).
// 작품 데이터는 기록이 있을 때만 지연 로드하여 초기 번들 경량화 유지.
export function HomePersonal() {
  const hydrated = useHydrated();
  const reads = useApp((s) => s.reads);
  const ratings = useApp((s) => s.ratings);
  const [titles, setTitles] = useState<Title[] | null>(null);

  const hasData = hydrated && (Object.keys(reads).length > 0 || Object.keys(ratings).length > 0);

  useEffect(() => {
    if (hasData && !titles) import("@/lib/data").then((m) => setTitles(m.TITLES));
  }, [hasData, titles]);

  if (!hasData || !titles) return null;

  const byId = new Map(titles.map((t) => [t.id, t]));
  const reading = Object.entries(reads)
    .filter(([, s]) => s === "reading" || s === "want")
    .map(([id]) => byId.get(id))
    .filter((t): t is Title => Boolean(t));
  const seen = new Set([...Object.keys(reads), ...Object.keys(ratings)]);
  const profile = buildTasteProfile(titles, ratings, reads);
  const recs = recommendForTaste(titles, profile, seen, 12).map((r) => r.title);

  if (reading.length === 0 && recs.length === 0) return null;

  return (
    <div className="flex flex-col gap-16">
      {reading.length > 0 && (
        <Section
          eyebrow="WELCOME BACK"
          title="내 서재에서 이어보기"
          desc="관심·정주행 중인 작품"
          action={{ label: "내 서재", href: "/library" }}
        >
          <Rail>
            {reading.map((t) => (
              <TitleCard key={t.id} title={t} />
            ))}
          </Rail>
        </Section>
      )}
      {recs.length > 0 && (
        <Section
          eyebrow="FOR YOU"
          title="당신을 위한 추천"
          desc="평가·관심 이력으로 고른 작품"
          action={{ label: "추천 더 보기", href: "/recommend" }}
        >
          <Rail>
            {recs.map((t) => (
              <TitleCard key={t.id} title={t} />
            ))}
          </Rail>
        </Section>
      )}
    </div>
  );
}
