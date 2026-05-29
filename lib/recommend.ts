import type { Title, ReadState } from "./types";

// 두 작품의 콘텐츠 유사도 (장르/태그/유형/이용가 기반 자카드 가중)
export function similarity(a: Title, b: Title): number {
  if (a.id === b.id) return 0;
  const genreA = new Set(a.genres);
  const genreB = new Set(b.genres);
  const tagA = new Set(a.tags);
  const tagB = new Set(b.tags);

  const gInter = [...genreA].filter((g) => genreB.has(g)).length;
  const gUnion = new Set([...genreA, ...genreB]).size || 1;
  const tInter = [...tagA].filter((t) => tagB.has(t)).length;
  const tUnion = new Set([...tagA, ...tagB]).size || 1;

  let s = (gInter / gUnion) * 0.55 + (tInter / tUnion) * 0.35;
  if (a.type === b.type) s += 0.06;
  if (a.ageRating === b.ageRating) s += 0.02;
  // 같은 어댑테이션 패밀리면 강하게
  if (a.adaptedFrom && (a.adaptedFrom === b.id || a.adaptedFrom === b.adaptedFrom)) s += 0.4;
  if (b.adaptedFrom === a.id) s += 0.4;
  return s;
}

export function similarTitles(all: Title[], target: Title, limit = 8): Title[] {
  return all
    .map((t) => ({ t, s: similarity(target, t) }))
    .filter((x) => x.s > 0.05)
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
    t.genres.forEach((g) => genreW.set(g, (genreW.get(g) ?? 0) + weight));
    t.tags.forEach((tag) => tagW.set(tag, (tagW.get(tag) ?? 0) + weight * 0.7));
    if (t.type === "webtoon") typeWebtoon += weight;
    else typeNovel += weight;
  };

  for (const t of all) {
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

  return all
    .filter((t) => !seen.has(t.id))
    .map((t) => {
      let score = 0;
      const matchedG: string[] = [];
      const matchedT: string[] = [];
      t.genres.forEach((g) => {
        if (gw.has(g)) {
          score += gw.get(g)!;
          matchedG.push(g);
        }
      });
      t.tags.forEach((tag) => {
        if (tw.has(tag)) {
          score += tw.get(tag)! * 0.6;
          matchedT.push(tag);
        }
      });
      score += (t.stats.ratingAvg - 3.5) * 2; // 품질 보정
      const reason =
        matchedG[0] && matchedT[0]
          ? `'${matchedG[0]}' 취향 + ${matchedT[0]} 코드`
          : matchedG[0]
            ? `즐겨보는 '${matchedG[0]}' 장르`
            : matchedT[0]
              ? `${matchedT[0]} 코드 일치`
              : "평점 높은 추천작";
      return { title: t, score, reason };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ title, reason }) => ({ title, reason }));
}
