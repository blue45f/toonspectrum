// 관리자 API(Nest /api/admin/*) 공용 클라이언트 — HttpOnly 쿠키 인증을 공유한다.
import { api, HTTPError } from "@/src/infrastructure/api";

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

export interface AdminBenchmarkSample {
  name: string;
  status: "ok" | "partial" | "error";
  iterations: number;
  successCount: number;
  errorCount: number;
  durationMs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  sampleSize?: number;
  error?: string;
}

export interface AdminBenchmarkResult {
  generatedAt: string;
  samples: AdminBenchmarkSample[];
}

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function adminFetch<T>(path: string, _uid: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
  };
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => (headers[key] = value));
  }
  try {
    const res = await api.raw(`/api/admin${path}`, {
      method: (init?.method ?? "GET") as never,
      cache: "no-store",
      body: init?.body as BodyInit | null | undefined,
      headers,
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  } catch (err) {
    if (err instanceof HTTPError) {
      let message = `요청 실패 (${err.response.status})`;
      const data = err.data;
      if (data && typeof data === "object") {
        const { error, message: msg } = data as { error?: unknown; message?: unknown };
        if (error || msg) message = String(error ?? msg);
      }
      throw new AdminApiError(err.response.status, message);
    }
    throw err;
  }
}

// 표시 보조 — cents ↔ 원
export const centsToWon = (cents: number) => Math.round((Number(cents) || 0) / 100);
export const wonToCents = (won: number) => Math.round((Number(won) || 0) * 100);
export const formatWon = (cents: number) => `₩${centsToWon(cents).toLocaleString("ko-KR")}`;
export const formatNum = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");
export const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("ko-KR") : "—";
