import sample from '../sample-data.json';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://toonspectrum.vercel.app').replace(/\/+$/, '');

export interface Availability { platformId: string; pricing?: string; url?: string }
export interface Title {
  id: string; slug: string; type: string; title: string; author?: string; artist?: string;
  genres?: string[]; tags?: string[]; synopsis?: string; cover?: string[]; coverImage?: string;
  status?: string; ageRating?: string; releaseYear?: number; availability?: Availability[];
  stats?: { views?: number; likes?: number; bookmarks?: number; ratingAvg?: number; ratingCount?: number };
}

const isAdult = (t: Title) => /19|adult/i.test(t.ageRating || ''); // 토스 콘텐츠 정책: 성인물 제외
export const coverUrl = (t: Title): string | null =>
  t.coverImage ? (t.coverImage.startsWith('http') ? t.coverImage : `${API_BASE}${t.coverImage}`) : null;

const seed: Title[] = ((sample as { items?: Title[] }).items || []).filter((t) => !isAdult(t));
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
