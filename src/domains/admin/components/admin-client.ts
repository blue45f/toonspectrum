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

export type RevenueStatus =
  | "pending"
  | "approved"
  | "paid"
  | "rejected"
  | "revoked";

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
  plans: {
    planId: string | null;
    planName: string | null;
    events: number;
    amountCents: number;
  }[];
  events: RevenueEvent[];
  generatedAt: string;
}

export interface AdminBenchmarkSample {
  name: string;
  status: "ok" | "partial" | "error";
  iterations: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  durationMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  stdDevMs: number;
  minMs: number;
  maxMs: number;
  sampleSize?: number;
  error?: string;
}

export interface AdminBenchmarkMetadata {
  iterations: number;
  sampleCount: number;
  warmup: boolean;
  totalDurationMs: number;
}

export interface AdminBenchmarkResult {
  generatedAt: string;
  metadata?: AdminBenchmarkMetadata;
  samples: AdminBenchmarkSample[];
}

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

function buildAdminHeaders(init?: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
  };
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value;
    });
  }
  return headers;
}

function toAdminApiError(error: HTTPError): AdminApiError {
  let message = `요청 실패 (${error.response.status})`;
  const data = error.data;
  if (data && typeof data === "object") {
    const { error, message: responseMessage } = data as {
      error?: unknown;
      message?: unknown;
    };
    if (error || responseMessage) {
      message = String(error ?? responseMessage);
    }
  }
  return new AdminApiError(error.response.status, message);
}

async function adminRaw(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await api.raw(`/api/admin${path}`, {
      method: (init?.method ?? "GET") as never,
      cache: "no-store",
      body: init?.body as BodyInit | null | undefined,
      headers: buildAdminHeaders(init),
    });
  } catch (error) {
    if (error instanceof HTTPError) throw toAdminApiError(error);
    throw error;
  }
}

export async function adminFetch<T>(
  path: string,
  _uid: string,
  init?: RequestInit,
): Promise<T> {
  const response = await adminRaw(path, init);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function adminFetchText(
  path: string,
  _uid: string,
  init?: RequestInit,
): Promise<string> {
  const response = await adminRaw(path, init);
  if (response.status === 204) return "";
  return response.text();
}

export function downloadAdminFile(
  filename: string,
  content: BlobPart,
  type = "text/plain;charset=utf-8",
): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// 표시 보조 — cents ↔ 원
export const centsToWon = (cents: number) =>
  Math.round((Number(cents) || 0) / 100);
export const wonToCents = (won: number) =>
  Math.round((Number(won) || 0) * 100);
export const formatWon = (cents: number) =>
  `₩${centsToWon(cents).toLocaleString("ko-KR")}`;
export const formatNum = (n: number) =>
  (Number(n) || 0).toLocaleString("ko-KR");
export const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("ko-KR") : "—";
