import type { Title, ReadState } from "./types";

// 두 작품의 콘텐츠 유사도 (장르/태그/유형/이용가 기반 자카드 가중)
// 메모리 할당(Set/Array)을 최소화하여 수만 건의 작품 추천 연산 속도를 극대화합니다.
export function similarity(a: Title, b: Title): number {
  if (a.id === b.id) return 0;

  let gInter = 0;
  const lenGA = a.genres.length;
  const lenGB = b.genres.length;
  for (let i = 0; i < lenGA; i++) {
    if (b.genres.includes(a.genres[i])) gInter++;
  }
  const gUnion = lenGA + lenGB - gInter || 1;

  let tInter = 0;
  const lenTA = a.tags.length;
  const lenTB = b.tags.length;
  for (let i = 0; i < lenTA; i++) {
    if (b.tags.includes(a.tags[i])) tInter++;
  }
  const tUnion = lenTA + lenTB - tInter || 1;

  let s = (gInter / gUnion) * 0.55 + (tInter / tUnion) * 0.35;
  if (a.type === b.type) s += 0.06;
  if (a.ageRating === b.ageRating) s += 0.02;

  // 같은 어댑테이션 패밀리면 강하게 가산
  if (a.adaptedFrom && (a.adaptedFrom === b.id || a.adaptedFrom === b.adaptedFrom)) s += 0.4;
  if (b.adaptedFrom === a.id) s += 0.4;
  return s;
}

export function similarTitles(all: Title[], target: Title, limit = 8): Title[] {
  const scored: { t: Title; s: number }[] = [];
  const len = all.length;
  for (let i = 0; i < len; i++) {
    const t = all[i];
    const s = similarity(target, t);
    if (s > 0.05) {
      scored.push({ t, s });
    }
  }

  return scored
    .sort((a, b) => b.s - a.s || b.t.stats.ratingAvg - a.t.stats.ratingAvg)
    .slice(0, limit)
    .map((x) => x.t);
}

export interface TasteProfile {
  topGenres: { name: string; weight: number }[];
  topTags: { name: string; weight: number }[];
  ratedCount: number;
  avgRating: number;
  affinityType?: "webtoon" | "webnovel" | "균형";
}

// 사용자의 평점/북마크 기반 취향 프로필 산출
export function buildTasteProfile(
  all: Title[],
  ratings: Record<string, number>,
  reads: Record<string, ReadState>
): TasteProfile {
  const genreW = new Map<string, number>();
  const tagW = new Map<string, number>();
  let typeWebtoon = 0;
  let typeNovel = 0;
  let sum = 0;
  let n = 0;

  const consider = (t: Title, weight: number) => {
    const gLen = t.genres.length;
    for (let i = 0; i < gLen; i++) {
      const g = t.genres[i];
      genreW.set(g, (genreW.get(g) ?? 0) + weight);
    }
    const tagLen = t.tags.length;
    for (let i = 0; i < tagLen; i++) {
      const tag = t.tags[i];
      tagW.set(tag, (tagW.get(tag) ?? 0) + weight * 0.7);
    }
    if (t.type === "webtoon") typeWebtoon += weight;
    else typeNovel += weight;
  };

  const len = all.length;
  for (let i = 0; i < len; i++) {
    const t = all[i];
    const r = ratings[t.id];
    const read = reads[t.id];
    if (r != null) {
      const w = r - 3; // 3점 기준 호불호 가중 (-2.5 ~ +2)
      consider(t, w);
      sum += r;
      n++;
    } else if (read === "done" || read === "reading") {
      consider(t, 1);
    } else if (read === "want") {
      consider(t, 0.5);
    }
  }

  const top = (m: Map<string, number>) =>
    Array.from(m.entries())
      .filter(([, w]) => w > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, weight]) => ({ name, weight }));

  const affinityType =
    typeWebtoon === 0 && typeNovel === 0
      ? undefined
      : Math.abs(typeWebtoon - typeNovel) < 1.5
        ? ("균형" as const)
        : typeWebtoon > typeNovel
          ? ("webtoon" as const)
          : ("webnovel" as const);

  return {
    topGenres: top(genreW),
    topTags: top(tagW),
    ratedCount: n,
    avgRating: n ? sum / n : 0,
    affinityType,
  };
}

// 취향 프로필 기반 추천 (이미 평가/소비한 작품 제외)
export function recommendForTaste(
  all: Title[],
  profile: TasteProfile,
  seen: Set<string>,
  limit = 12
): { title: Title; reason: string }[] {
  if (profile.topGenres.length === 0 && profile.topTags.length === 0) return [];
  const gw = new Map(profile.topGenres.map((g) => [g.name, g.weight]));
  const tw = new Map(profile.topTags.map((t) => [t.name, t.weight]));

  const scored: { title: Title; score: number; reason: string; hasAffinity: boolean }[] = [];
  const len = all.length;

  for (let i = 0; i < len; i++) {
    const t = all[i];
    if (seen.has(t.id)) continue;

    let scoreVal = 0;
    let matchedGFirst: string | undefined;
    let matchedTFirst: string | undefined;
    let hasAffinity = false;

    const gLen = t.genres.length;
    for (let j = 0; j < gLen; j++) {
      const g = t.genres[j];
      const w = gw.get(g);
      if (w !== undefined) {
        scoreVal += w;
        if (!matchedGFirst) matchedGFirst = g;
        hasAffinity = true;
      }
    }

    const tLen = t.tags.length;
    for (let j = 0; j < tLen; j++) {
      const tag = t.tags[j];
      const w = tw.get(tag);
      if (w !== undefined) {
        scoreVal += w * 0.6;
        if (!matchedTFirst) matchedTFirst = tag;
        hasAffinity = true;
      }
    }

    if (hasAffinity) {
      scoreVal += (t.stats.ratingAvg - 3.5) * 2;
      const reason =
        matchedGFirst && matchedTFirst
          ? `'${matchedGFirst}' 취향 + ${matchedTFirst} 코드`
          : matchedGFirst
            ? `즐겨보는 '${matchedGFirst}' 장르`
            : matchedTFirst
              ? `${matchedTFirst} 코드 일치`
              : "평점 높은 추천작";
      scored.push({ title: t, score: scoreVal, reason, hasAffinity: true });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ title, reason }) => ({ title, reason }));
}
