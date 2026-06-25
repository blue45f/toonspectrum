// 웹툰 룰렛 — "오늘의 추천" 스피너 순수 엔진(toonspectrum 본 레포 이식).
import type { GameTitle as PlayTitle } from './types';

export function popularityScore(title: PlayTitle): number {
  return title.views + title.likes * 12 + title.bookmarks * 6;
}

export type PopularityTier = 'legend' | 'hit' | 'rising' | 'hidden';

export function popularityTier(title: PlayTitle): PopularityTier {
  const score = popularityScore(title);
  if (score >= 100_000_000) return 'legend';
  if (score >= 10_000_000) return 'hit';
  if (score >= 1_000_000) return 'rising';
  return 'hidden';
}

export function genreChips(pool: readonly PlayTitle[]): string[] {
  const count = new Map<string, number>();
  for (const t of pool) {
    for (const g of t.genres) {
      if (!g) continue;
      count.set(g, (count.get(g) ?? 0) + 1);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g);
}

export function pickRandom(pool: readonly PlayTitle[], rng: () => number, genre?: string): PlayTitle | null {
  const candidates = genre ? pool.filter((t) => t.genres.includes(genre)) : pool;
  if (candidates.length === 0) return null;
  const idx = Math.floor(rng() * candidates.length) % candidates.length;
  return candidates[idx];
}

const TIER_LINE: Record<PopularityTier, string> = {
  legend: '이미 전설이 된 초대형 흥행작이에요.',
  hit: '수많은 독자가 정주행한 검증된 인기작이에요.',
  rising: '지금 빠르게 입소문 타는 떠오르는 작품이에요.',
  hidden: '아직 덜 알려진, 취향 맞으면 보석 같은 숨은작이에요.',
};

const GENRE_LINE: Record<string, string> = {
  로맨스: '설렘 가득한 전개가 필요할 때 딱이에요',
  로판: '로맨스와 판타지를 한 번에 즐기고 싶을 때 좋아요',
  판타지: '현실을 잠시 떠나 모험에 빠지고 싶을 때 추천',
  액션: '박진감 넘치는 전투를 원할 때 제격이에요',
  무협: '강호의 협과 무공을 좋아한다면 놓치지 마세요',
  드라마: '깊은 감정선과 서사에 몰입하고 싶을 때 좋아요',
  스릴러: '긴장감 있는 전개를 원할 때 강력 추천',
  미스터리: '한 번 잡으면 못 놓는 수수께끼가 기다려요',
  공포: '오싹한 분위기를 즐긴다면 취향 저격이에요',
  코미디: '가볍게 웃고 싶을 때 부담 없이 보기 좋아요',
  일상: '잔잔하게 힐링하고 싶을 때 어울려요',
  학원: '청춘과 성장의 이야기를 좋아한다면 추천',
  스포츠: '열정과 승부의 드라마를 느끼고 싶을 때 좋아요',
  역사: '시대를 넘나드는 이야기를 원할 때 어울려요',
  SF: '기발한 상상력의 세계를 탐험하고 싶을 때 추천',
  BL: '섬세한 관계의 서사를 즐긴다면 좋아요',
};

export function reasonFor(title: PlayTitle): string {
  const tier = popularityTier(title);
  const genre = title.genres[0];
  const genreLine = genre ? (GENRE_LINE[genre] ?? `${genre} 장르를 좋아한다면 추천`) : '오늘 같은 날 보기 좋아요';
  return `${genreLine}. ${TIER_LINE[tier]}`;
}

export function tierLabel(title: PlayTitle): string {
  switch (popularityTier(title)) {
    case 'legend':
      return '전설의 흥행작';
    case 'hit':
      return '검증된 인기작';
    case 'rising':
      return '떠오르는 작품';
    default:
      return '숨은 보석';
  }
}
