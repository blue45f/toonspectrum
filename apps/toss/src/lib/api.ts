import { type Title, type PlatformId, platform } from '@toonspectrum/core';

import sample from '../sample-data.json';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://toonspectrum.vercel.app').replace(/\/+$/, '');

// 정식 도메인 타입은 @toonspectrum/core 에서 가져온다(웹·토스 단일 소스). /api/titles?limit=80 은
// 풀 Title[] 를 반환하므로 카드형(TitleCard)이 아닌 Title 을 그대로 소비한다.
export type { Title, PlatformId };
export { platform };

const isAdult = (t: Title) => /19|adult/i.test(t.ageRating || ''); // 토스 콘텐츠 정책: 성인물 제외
export const coverUrl = (t: Title): string | null =>
  t.coverImage ? (t.coverImage.startsWith('http') ? t.coverImage : `${API_BASE}${t.coverImage}`) : null;

// sample-data.json 은 실제 카탈로그 스냅샷이지만 JSON 추론 타입은 리터럴 유니온(WorkType·
// SerialStatus·AgeRating·PlatformId)이 아닌 넓은 string 이라 unknown 을 거쳐 Title[] 로 단언한다.
const seed: Title[] = ((sample as unknown as { items?: Title[] }).items || []).filter((t) => !isAdult(t));
let cache: Title[] = seed;

export async function fetchTitles(): Promise<Title[]> {
  try {
    const res = await fetch(`${API_BASE}/api/titles?limit=80`);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const items: Title[] = Array.isArray(data?.items) ? data.items : [];
    cache = items.filter((t) => !isAdult(t));
  } catch {
    cache = seed; // CORS/오프라인 시 임베드 스냅샷 사용
  }
  return cache;
}
export function getCached(id: string): Title | undefined {
  return cache.find((t) => t.id === id || t.slug === id);
}
