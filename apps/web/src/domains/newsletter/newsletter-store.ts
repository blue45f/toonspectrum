/**
 * 작가 뉴스레터 스토어 — 구독 관계, 뉴스레터 초안/발송 상태, 발송 이력.
 *
 * 게스트-퍼스트 정책:
 * - 작가 페이지·작품 페이지 둘러보기와 뉴스레터 화면 열람은 로그인 없이 된다.
 * - 구독·해지·발송처럼 소유권이 필요한 동작은 게스트에게 로그인 유도를
 *   반환하고 상태를 바꾸지 않는다(컷츠 좋아요와 같은 규칙).
 * - 정본은 이 브라우저의 IndexedDB다. (구 localStorage 값은 첫 읽기에 이관된다.)
 *   서버 구독/발송 계약이 생기면 이 스토어의 동기화 지점만 교체한다.
 *
 * 발송 정책:
 * - 실제 이메일은 보내지 않는다. 발송은 메일 어댑터(`newsletter-mail-adapter.ts`,
 *   현재 로컬 기록 전용)가 확정한 건수를 이력에 남기는 상태 전이까지만 한다.
 * - 발송 직전 가드: 이미 보낸 글, 빈 제목/본문, 구독자 0명은 차단한다.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { idbJsonStorage } from "@/shared/lib/idb-json-storage";

import {
  NEWSLETTER_MAIL_ADAPTER,
  type NewsletterMailAdapter,
} from "./newsletter-mail-adapter";
import {
  NEWSLETTER_UNSUBSCRIBE_PATH,
  listNewsletterRecipientIds,
  validateNewsletterIssueDraft,
} from "./newsletter-model";
import type {
  NewsletterCadence,
  NewsletterIssue,
  NewsletterSendRecord,
  NewsletterSubscription,
  SendIssueResult,
  SubscribeResult,
} from "./newsletter-types";

const STORAGE_KEY = "toonstudio-newsletter-v1";
const MAX_ISSUES = 100;
const MAX_SEND_HISTORY = 100;
/** 설계 기본값 — 새 화를 주 1회 묶어서 보낸다(설계 6.2-1). */
export const DEFAULT_NEWSLETTER_CADENCE: NewsletterCadence = "weekly";

interface NewsletterState {
  readonly subscriptions: readonly NewsletterSubscription[];
  readonly issues: readonly NewsletterIssue[];
  readonly sendHistory: readonly NewsletterSendRecord[];
  /** 작성 화면에서 쓰는 내 작가(필명) 이름. 구독은 이 이름으로 묶인다. */
  readonly penName: string | null;

  subscribe: (authorName: string, actorId: string | null) => SubscribeResult;
  unsubscribe: (authorName: string, actorId: string | null) => boolean;
  toggleSubscribe: (authorName: string, actorId: string | null) => SubscribeResult;
  setCadence: (authorName: string, actorId: string | null, cadence: NewsletterCadence) => boolean;
  setPenName: (penName: string) => void;
  createIssue: (authorName: string, input: { title: string; body: string }) => NewsletterIssue;
  updateIssue: (issueId: string, patch: { title?: string; body?: string }) => NewsletterIssue | null;
  deleteIssue: (issueId: string) => boolean;
  sendIssue: (issueId: string, adapter?: NewsletterMailAdapter) => Promise<SendIssueResult>;
  resetForTests: () => void;
}

let fallbackIdCounter = 0;

function nextNewsletterId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  fallbackIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackIdCounter}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

const initialState = {
  subscriptions: [] as readonly NewsletterSubscription[],
  issues: [] as readonly NewsletterIssue[],
  sendHistory: [] as readonly NewsletterSendRecord[],
  penName: null as string | null,
};

export const useNewsletterStore = create<NewsletterState>()(
  persist(
    (set, get) => ({
      ...initialState,

      subscribe: (authorName, actorId) => {
        if (!actorId) return { subscribed: false, needsLogin: true };
        const existing = get().subscriptions.find(
          (sub) => sub.readerId === actorId && sub.authorName === authorName,
        );
        if (existing) return { subscribed: true, needsLogin: false };
        const subscription: NewsletterSubscription = {
          readerId: actorId,
          authorName,
          cadence: DEFAULT_NEWSLETTER_CADENCE,
          subscribedAt: nowIso(),
        };
        set((state) => ({ subscriptions: [subscription, ...state.subscriptions] }));
        return { subscribed: true, needsLogin: false };
      },

      unsubscribe: (authorName, actorId) => {
        if (!actorId) return false;
        const before = get().subscriptions.length;
        set((state) => ({
          subscriptions: state.subscriptions.filter(
            (sub) => !(sub.readerId === actorId && sub.authorName === authorName),
          ),
        }));
        return get().subscriptions.length < before;
      },

      toggleSubscribe: (authorName, actorId) => {
        if (!actorId) return { subscribed: false, needsLogin: true };
        const existing = get().subscriptions.find(
          (sub) => sub.readerId === actorId && sub.authorName === authorName,
        );
        if (existing) {
          get().unsubscribe(authorName, actorId);
          return { subscribed: false, needsLogin: false };
        }
        return get().subscribe(authorName, actorId);
      },

      setCadence: (authorName, actorId, cadence) => {
        if (!actorId) return false;
        let changed = false;
        set((state) => ({
          subscriptions: state.subscriptions.map((sub) => {
            if (sub.readerId !== actorId || sub.authorName !== authorName) return sub;
            changed = true;
            return { ...sub, cadence };
          }),
        }));
        return changed;
      },

      setPenName: (penName) => {
        const trimmed = penName.trim();
        set({ penName: trimmed.length > 0 ? trimmed : null });
      },

      createIssue: (authorName, input) => {
        const timestamp = nowIso();
        const issue: NewsletterIssue = {
          id: nextNewsletterId("newsletter-issue"),
          authorName,
          title: input.title,
          body: input.body,
          status: "draft",
          createdAt: timestamp,
          updatedAt: timestamp,
          sentAt: null,
        };
        set((state) => ({ issues: [issue, ...state.issues].slice(0, MAX_ISSUES) }));
        return issue;
      },

      updateIssue: (issueId, patch) => {
        const current = get().issues.find((issue) => issue.id === issueId);
        if (!current || current.status !== "draft") return null;
        const updated: NewsletterIssue = {
          ...current,
          title: patch.title ?? current.title,
          body: patch.body ?? current.body,
          updatedAt: nowIso(),
        };
        set((state) => ({
          issues: state.issues.map((issue) => (issue.id === issueId ? updated : issue)),
        }));
        return updated;
      },

      deleteIssue: (issueId) => {
        const current = get().issues.find((issue) => issue.id === issueId);
        if (!current || current.status !== "draft") return false;
        set((state) => ({ issues: state.issues.filter((issue) => issue.id !== issueId) }));
        return true;
      },

      sendIssue: async (issueId, adapter = NEWSLETTER_MAIL_ADAPTER) => {
        const issue = get().issues.find((item) => item.id === issueId);
        if (!issue) return { sent: false, reason: "not-found" };
        if (issue.status === "sent") return { sent: false, reason: "already-sent" };
        const validation = validateNewsletterIssueDraft(issue);
        if (!validation.ok) return { sent: false, reason: validation.reason };
        const recipientIds = listNewsletterRecipientIds(get().subscriptions, issue.authorName);
        if (recipientIds.length === 0) return { sent: false, reason: "no-subscribers" };

        const receipt = await adapter.send({
          authorName: issue.authorName,
          subject: issue.title.trim(),
          body: issue.body,
          recipientIds,
          unsubscribePath: NEWSLETTER_UNSUBSCRIBE_PATH,
        });

        const record: NewsletterSendRecord = {
          id: nextNewsletterId("newsletter-send"),
          issueId: issue.id,
          authorName: issue.authorName,
          issueTitle: issue.title.trim(),
          sentAt: receipt.deliveredAt,
          recipientCount: receipt.acceptedCount,
          adapterId: receipt.adapterId,
        };
        set((state) => ({
          issues: state.issues.map((item) =>
            item.id === issueId
              ? { ...item, status: "sent" as const, sentAt: receipt.deliveredAt, updatedAt: receipt.deliveredAt }
              : item,
          ),
          sendHistory: [record, ...state.sendHistory].slice(0, MAX_SEND_HISTORY),
        }));
        return { sent: true, record };
      },

      resetForTests: () => set({ ...initialState }),
    }),
    {
      name: STORAGE_KEY,
      // 구독·발행 이력은 IndexedDB가 정본이다 (구 localStorage 값은 첫 읽기에 이관).
      storage: idbJsonStorage,
      partialize: (state) => ({
        subscriptions: state.subscriptions,
        issues: state.issues,
        sendHistory: state.sendHistory,
        penName: state.penName,
      }),
    },
  ),
);
