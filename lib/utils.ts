import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function keepInlineText(value: string): string {
  return value.replace(/\s+/g, "\u00a0");
}

// 12345 -> "1.2만", 123456789 -> "1.2억", 980 -> "980"
export function formatCount(n: number): string {
  if (n >= 1e8) {
    const v = n / 1e8;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")}억`;
  }
  if (n >= 1e4) {
    const v = n / 1e4;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")}만`;
  }
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}천`;
  return String(n);
}

export function formatFull(n: number): string {
  return n.toLocaleString("ko-KR");
}

// 별점 표기 4.7
export function formatRating(n: number): string {
  return n.toFixed(1);
}

// ISO 날짜 -> "3일 전" / "2024.03.11"
export function relativeDate(iso: string, now = new Date("2025-05-29T00:00:00Z")): string {
  const then = new Date(iso);
  const diff = now.getTime() - then.getTime();
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(diff / day);
  if (days < 0) return iso.slice(0, 10).replace(/-/g, ".");
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

// 한국 표준시(KST) 기준 요일 (0=일 … 6=토). 서버 타임존(UTC 등)과 무관하게 한국 날짜로 계산.
// getDay()는 서버 로컬 TZ를 쓰므로 UTC 배포 시 KST 자정 부근에 요일이 어긋난다 → 이 헬퍼로 통일.
export function kstDayOfWeek(): number {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay();
}

// 결정적 의사난수 (시드 기반) — 아바타/스켈레톤 등 SSR 안전한 변주에 사용
export function seededRandom(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}
