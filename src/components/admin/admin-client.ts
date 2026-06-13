// 관리자 API(Nest /api/admin/*) 공용 클라이언트 — 서명 세션 토큰을 x-user-id 헤더로 전달(서버 검증).
import { getAuthToken } from "@/src/compat/auth-session-store";

export interface AdminMe {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  intervalDays: number;
  currency: string;
  priceCents: number;
  perks: string[];
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface Campaign {
  id: string;
  creatorId: string;
  titleId: string | null;
  planId: string | null;
  title: string;
  description: string;
  targetAmountCents: number;
  raisedAmountCents: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
  planName: string | null;
  planCode: string | null;
}

export type RevenueStatus = "pending" | "approved" | "paid" | "rejected" | "revoked";

export interface RevenueEvent {
  id: string;
  status: RevenueStatus;
  kind: string;
  amountCents: number;
  currency: string;
  planId: string | null;
  campaignId: string | null;
  payerId: string;
  recipientId: string;
  reviewNote: string | null;
  settledAt: string | null;
  createdAt: string;
}

export interface RevenueSummary {
  pendingAmount: number;
  approvedAmount: number;
  paidAmount: number;
  rejectedAmount: number;
  revokedAmount: number;
  pendingEvents: number;
  approvedEvents: number;
  paidEvents: number;
  rejectedEvents: number;
  revokedEvents: number;
  totalEvents: number;
}

export interface RevenueResponse {
  summary: RevenueSummary;
  plans: { planId: string | null; planName: string | null; events: number; amountCents: number }[];
  events: RevenueEvent[];
  generatedAt: string;
}

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function adminFetch<T>(path: string, uid: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "x-user-id": getAuthToken() ?? uid, // 서명 토큰 우선(없으면 레거시 uid → 서버가 거부)
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error || data?.message) message = String(data.error ?? data.message);
    } catch {
      /* ignore */
    }
    throw new AdminApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// 표시 보조 — cents ↔ 원
export const centsToWon = (cents: number) => Math.round((Number(cents) || 0) / 100);
export const wonToCents = (won: number) => Math.round((Number(won) || 0) * 100);
export const formatWon = (cents: number) => `₩${centsToWon(cents).toLocaleString("ko-KR")}`;
export const formatNum = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");
export const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("ko-KR") : "—";
