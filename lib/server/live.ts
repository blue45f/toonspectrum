// 서버 전용 — 네이버/카카오에서 런타임에 실시간 인기 랭킹을 가져온다.
// Next ISR(`revalidate`) 캐시로 N초마다 갱신. 실패 시 빈 배열(상위 호출부가 스냅샷 폴백).
// (하드코딩 스냅샷이 아니라 실제 소스에서 동적 페치하는 경로 데모)
import { getTitle } from "@/lib/data";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const REVALIDATE = 600; // 10분 (최대한 실시간성 유지 + 캐시로 소스 보호)
const WEEK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export interface LiveItem {
  key: string;
  rank: number;
  title: string;
  author: string;
  thumbnail?: string;
  rating: number;
  platform: "네이버웹툰" | "카카오웹툰";
  platformColor: string;
  href: string;
  external: boolean;
}

const proxy = (u?: string) => (u ? `/api/cover?u=${encodeURIComponent(u)}` : undefined);
const names = (arr: unknown): string =>
  Array.isArray(arr)
    ? arr.map((x) => (typeof x === "string" ? x : (x as { name?: string })?.name || "")).filter(Boolean).join(", ")
    : "";

function hrefFor(id: string, ext: string): { href: string; external: boolean } {
  return getTitle(id) ? { href: `/title/${id}`, external: false } : { href: ext, external: true };
}

async function fetchNaver(day: string): Promise<LiveItem[]> {
  try {
    const r = await fetch(
      `https://comic.naver.com/api/webtoon/titlelist/weekday?week=${day}&order=user`,
      { headers: { "User-Agent": UA, Referer: "https://comic.naver.com/" }, next: { revalidate: REVALIDATE } }
    );
    if (!r.ok) return [];
    const j = (await r.json()) as { titleList?: Array<Record<string, unknown>> };
    return (j.titleList ?? []).slice(0, 10).map((t, i) => {
      const id = `nw-${t.titleId}`;
      const { href, external } = hrefFor(id, `https://comic.naver.com/webtoon/list?titleId=${t.titleId}`);
      return {
        key: id,
        rank: i + 1,
        title: String(t.titleName ?? ""),
        author: names(t.writers) || String(t.author ?? ""),
        thumbnail: proxy(t.thumbnailUrl as string),
        rating: Math.round(((Number(t.starScore) || 0) / 2) * 10) / 10,
        platform: "네이버웹툰" as const,
        platformColor: "#00DC64",
        href,
        external,
      };
    });
  } catch {
    return [];
  }
}

async function fetchKakao(day: string): Promise<LiveItem[]> {
  try {
    const r = await fetch(
      `https://gateway-kw.kakao.com/section/v2/timetables/days?placement=timetable_${day}`,
      {
        headers: { "User-Agent": UA, Referer: "https://webtoon.kakao.com/", Origin: "https://webtoon.kakao.com" },
        next: { revalidate: REVALIDATE },
      }
    );
    if (!r.ok) return [];
    const j = (await r.json()) as { data?: Array<{ cardGroups?: Array<{ cards?: Array<{ content?: Record<string, unknown> }> }> }> };
    const cards: Record<string, unknown>[] = [];
    for (const sec of j.data ?? [])
      for (const grp of sec.cardGroups ?? [])
        for (const card of grp.cards ?? []) if (card.content) cards.push(card.content);
    return cards.slice(0, 8).map((c, i) => {
      const id = `kw-${c.id}`;
      const img = (c.backgroundImage as string) || (c.featuredCharacterImageA as string);
      const { href, external } = hrefFor(id, `https://webtoon.kakao.com/content/${c.seoId || c.id}/${c.id}`);
      return {
        key: id,
        rank: i + 1,
        title: String(c.title ?? ""),
        author: names(c.authors),
        thumbnail: img ? proxy(img + ".webp") : undefined,
        rating: 0,
        platform: "카카오웹툰" as const,
        platformColor: "#FF3D54",
        href,
        external,
      };
    });
  } catch {
    return [];
  }
}

// 실시간 인기 — 네이버 + 카카오 오늘자 인기 순서를 교차 병합
export async function getLiveRanking(limit = 12): Promise<{ items: LiveItem[]; day: string }> {
  const day = WEEK[new Date().getDay()];
  const [naver, kakao] = await Promise.all([fetchNaver(day), fetchKakao(day)]);
  const merged: LiveItem[] = [];
  const max = Math.max(naver.length, kakao.length);
  for (let i = 0; i < max && merged.length < limit; i++) {
    if (naver[i]) merged.push(naver[i]);
    if (kakao[i] && merged.length < limit) merged.push(kakao[i]);
  }
  return { items: merged.map((it, i) => ({ ...it, rank: i + 1 })), day };
}
