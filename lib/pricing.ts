// 플랫폼간 가격 비교 — 같은 작품도 플랫폼별로 보기/소장 비용이 다르다.
// ⚠️ 실제 회차 단가는 크롤하지 않으므로, 플랫폼의 공개 과금 '모델'(무료/기다무/유료/구독)에
// 대표 단가를 곱한 추정·예시값이다. 모델 자체는 실데이터(availability.pricing)다.
import type { Availability, Pricing, PlatformId } from "./types";
import { PLATFORMS } from "./platforms";

export interface PlatformCost {
  platformId: PlatformId;
  name: string;
  color: string;
  model: Pricing;
  modelLabel: string;
  readPerEpWon: number; // 회차당 보기(대여/스트리밍) 추정. 0 = 무료/구독 포함
  ownPerEpWon: number; // 회차당 소장(영구 구매) 추정
  monthlyWon: number; // 구독 모델 월정액 추정(없으면 0)
  note: string;
  url?: string;
  cheapestRead?: boolean;
  cheapestOwn?: boolean;
}

const MODEL_LABEL: Record<Pricing, string> = {
  free: "무료",
  "wait-free": "기다리면 무료",
  paid: "건별 유료",
  subscription: "구독",
};

// 모델별 대표 단가(원, 추정·예시).
const MODEL_RATE: Record<Pricing, { read: number; own: number; monthly: number; note: string }> = {
  free: { read: 0, own: 0, monthly: 0, note: "전회차 무료(미리보기 쿠키 등 일부 유료 가능)" },
  "wait-free": { read: 0, own: 100, monthly: 0, note: "기다리면 무료 · 빨리보기 시 회차당 과금" },
  paid: { read: 100, own: 200, monthly: 0, note: "대여(보기) / 소장(영구) 건별 결제" },
  subscription: { read: 0, own: 0, monthly: 9900, note: "월정액 구독에 포함" },
};

// 플랫폼별 단가 보정 계수(대표적 코인/캐시 단가 차이, 추정).
const PLATFORM_FACTOR: Partial<Record<PlatformId, number>> = {
  lezhin: 1.25,
  toptoon: 1.2,
  toomics: 1.15,
  "kakao-page": 1.1,
  "kakao-webtoon": 1.1,
  ridi: 1.0,
  bomtoon: 1.1,
  "naver-series": 0.95,
  munpia: 0.9,
  joara: 0.9,
  novelpia: 0.95,
  kyobo: 1.0,
  yes24: 1.0,
};

function round10(n: number): number {
  return Math.round(n / 10) * 10;
}

export function comparePlatformCosts(availability: Availability[]): PlatformCost[] {
  const rows: PlatformCost[] = availability.map((a) => {
    const p = PLATFORMS[a.platformId];
    const rate = MODEL_RATE[a.pricing];
    const factor = PLATFORM_FACTOR[a.platformId] ?? 1;
    return {
      platformId: a.platformId,
      name: p?.name ?? a.platformId,
      color: p?.color ?? "#888",
      model: a.pricing,
      modelLabel: MODEL_LABEL[a.pricing],
      readPerEpWon: round10(rate.read * factor),
      ownPerEpWon: round10(rate.own * factor),
      monthlyWon: rate.monthly,
      note: rate.note,
      url: a.url,
    };
  });

  // 최저 보기/소장 단가 표시(무료/구독은 보기 0원으로 최저).
  const minRead = Math.min(...rows.map((r) => r.readPerEpWon));
  const minOwn = Math.min(...rows.filter((r) => r.ownPerEpWon > 0).map((r) => r.ownPerEpWon), Infinity);
  for (const r of rows) {
    if (r.readPerEpWon === minRead) r.cheapestRead = true;
    if (r.ownPerEpWon > 0 && r.ownPerEpWon === minOwn) r.cheapestOwn = true;
  }
  // 보기 비용 오름차순(무료/기다무 우선), 동률이면 소장 단가.
  rows.sort((a, b) => a.readPerEpWon - b.readPerEpWon || a.ownPerEpWon - b.ownPerEpWon);
  return rows;
}

export function formatWon(won: number): string {
  if (won <= 0) return "무료";
  return `${won.toLocaleString("ko-KR")}원`;
}
