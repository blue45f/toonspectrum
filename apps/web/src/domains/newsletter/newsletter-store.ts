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

import { useSyncExternalStore } from "react";
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
  /** 작성 화면에서 쓰는 내 작가(필명) 이름. 구독은 이 이름으로 묶인다. (레거시 전역 값 — penNames로 이관 중) */
  readonly penName: string | null;
  /** 계정별 필명. 로그인 상태에서는 이쪽이 정본이고, penName은 미귀속 레거시 원천으로만 남는다. */
  readonly penNames: Readonly<Record<string, string>>;

  subscribe: (authorName: string, actorId: string | null) => SubscribeResult;
  unsubscribe: (authorName: string, actorId: string | null) => boolean;
  toggleSubscribe: (authorName: string, actorId: string | null) => SubscribeResult;
  setCadence: (authorName: string, actorId: string | null, cadence: NewsletterCadence) => boolean;
  setPenName: (penName: string, actorId?: string | null) => void;
  /** 미귀속(레거시) 이슈·이력·필명을 현재 계정 소유로 확정한다. 작성 화면 진입 시 1회 호출. */
  claimLegacyData: (actorId: string | null) => void;
  createIssue: (authorName: string, input: { title: string; body: string }, actorId?: string | null) => NewsletterIssue;
  updateIssue: (issueId: string, patch: { title?: string; body?: string }, actorId?: string | null) => NewsletterIssue | null;
  deleteIssue: (issueId: string, actorId?: string | null) => boolean;
  sendIssue: (issueId: string, actorId?: string | null, adapter?: NewsletterMailAdapter) => Promise<SendIssueResult>;
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
  penNames: {} as Readonly<Record<string, string>>,
};

/** 소유 검사 — 미귀속(레거시) 레코드는 귀속 전이라 허용하고, 귀속된 레코드는 소유 계정만 통과시킨다. */
function ownsRecord(ownerId: string | null, actorId: string | null | undefined): boolean {
  // 구 persist 데이터는 ownerId 필드 자체가 없어 undefined로 온다 — 그것도 미귀속으로 본다.
  if (ownerId == null) return true;
  return actorId != null && ownerId === actorId;
}

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

      setPenName: (penName, actorId) => {
        const trimmed = penName.trim();
        if (actorId) {
          set((state) => {
            const next = { ...state.penNames };
            if (trimmed.length > 0) next[actorId] = trimmed;
            else delete next[actorId];
            return { penNames: next };
          });
          return;
        }
        set({ penName: trimmed.length > 0 ? trimmed : null });
      },

      claimLegacyData: (actorId) => {
        if (!actorId) return;
        const state = get();
        const hasLegacy =
          state.issues.some((issue) => issue.ownerId == null) ||
          state.sendHistory.some((record) => record.ownerId == null) ||
          (state.penName !== null && state.penNames[actorId] === undefined);
        if (!hasLegacy) return;
        set((current) => ({
          issues: current.issues.map((issue) =>
            issue.ownerId == null ? { ...issue, ownerId: actorId } : issue,
          ),
          sendHistory: current.sendHistory.map((record) =>
            record.ownerId == null ? { ...record, ownerId: actorId } : record,
          ),
          // 레거시 전역 필명은 처음 귀속하는 계정의 필명으로 옮기고 전역 값은 비운다 —
          // 다음 계정이 같은 필명을 물려받는 일이 없어야 한다.
          penNames:
            current.penName !== null && current.penNames[actorId] === undefined
              ? { ...current.penNames, [actorId]: current.penName }
              : current.penNames,
          penName:
            current.penName !== null && current.penNames[actorId] === undefined
              ? null
              : current.penName,
        }));
      },

      createIssue: (authorName, input, actorId) => {
        const timestamp = nowIso();
        const issue: NewsletterIssue = {
          id: nextNewsletterId("newsletter-issue"),
          authorName,
          ownerId: actorId ?? null,
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

      updateIssue: (issueId, patch, actorId) => {
        const current = get().issues.find((issue) => issue.id === issueId);
        if (!current || current.status !== "draft" || !ownsRecord(current.ownerId, actorId)) return null;
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

      deleteIssue: (issueId, actorId) => {
        const current = get().issues.find((issue) => issue.id === issueId);
        if (!current || current.status !== "draft" || !ownsRecord(current.ownerId, actorId)) return false;
        set((state) => ({ issues: state.issues.filter((issue) => issue.id !== issueId) }));
        return true;
      },

      sendIssue: async (issueId, actorId, adapter = NEWSLETTER_MAIL_ADAPTER) => {
        const issue = get().issues.find((item) => item.id === issueId);
        if (!issue || !ownsRecord(issue.ownerId, actorId)) return { sent: false, reason: "not-found" };
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
          ownerId: issue.ownerId,
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
        penNames: state.penNames,
      }),
    },
  ),
);

/**
 * 뉴스레터 스토어의 IndexedDB 복원 완료를 구독한다.
 * 복원 전에는 구독 목록이 빈 배열이라 "구독자 0명·구독 없음"이 사실처럼
 * 보이고, 그 상태에서의 토글·해지는 복원 시점에 유실된다. 구독 상태를
 * 표시·변경하는 화면은 이 게이트를 통과한 뒤에만 그려야 한다.
 */
export function useNewsletterHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useNewsletterStore.persist.onFinishHydration(cb),
    () => useNewsletterStore.persist.hasHydrated(),
    () => false,
  );
}
