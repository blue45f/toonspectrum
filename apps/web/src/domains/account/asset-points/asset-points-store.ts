/**
 * 에셋 포인트 지갑 스토어 — 로컬-퍼스트 원장 보관소.
 *
 * 게스트-퍼스트 정책:
 * - 원장은 이 브라우저(localStorage)에 먼저 쌓인다. 적립·사용 판정은 전부
 *   순수 로직(asset-points-ledger)이 하고, 스토어는 이벤트를 붙이기만 한다.
 * - 실제 적립 트리거는 로그인 사용자에게만 연결한다(asset-points-triggers).
 *   게스트가 지갑을 열면 로그인 유도를 보여준다.
 * - 서버 지갑 계약이 완성되면 이 스토어의 이벤트를 서버 원장과 맞바꾸는
 *   어댑터만 교체한다(asset-points-api의 계약 지점 참고).
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  assetPointEarnRule,
} from "./asset-points-policy";
import {
  createEarnEvent,
  createSpendEvent,
  createSpendRefundEvent,
  evaluateEarn,
  evaluateSpend,
  type AssetPointEvent,
  type EarnRejection,
  type SpendRejection,
} from "./asset-points-ledger";

const STORAGE_KEY = "toonstudio-asset-points-v1";
const MAX_EVENTS = 1000;

export type EarnResult =
  | { readonly granted: true; readonly points: number }
  | { readonly granted: false; readonly reason: EarnRejection | "unknown-rule" };

export type SpendResult =
  | { readonly ok: true; readonly eventId: string }
  | { readonly ok: false; readonly reason: SpendRejection };

interface AssetPointsState {
  readonly events: readonly AssetPointEvent[];
  readonly nextSeq: number;

  earn: (activityKey: string, sourceRef: string, now?: Date) => EarnResult;
  spendForResource: (input: {
    readonly resourceId: string;
    readonly resourceName: string;
    readonly pointPrice: number;
    readonly now?: Date;
  }) => SpendResult;
  /** 구매 확정이 실패했을 때 spend를 되돌린다. 이미 환불했으면 false. */
  refundSpend: (spendEventId: string, now?: Date) => boolean;
  resetForTests: () => void;
}

function nextEventId(seq: number): string {
  return `ape_${seq.toString().padStart(6, "0")}`;
}

function trimEvents(events: readonly AssetPointEvent[]): AssetPointEvent[] {
  return events.length > MAX_EVENTS ? events.slice(events.length - MAX_EVENTS) : [...events];
}

export const useAssetPointsStore = create<AssetPointsState>()(
  persist(
    (set, get) => ({
      events: [],
      nextSeq: 1,

      earn: (activityKey, sourceRef, now = new Date()) => {
        const rule = assetPointEarnRule(activityKey);
        if (!rule) return { granted: false, reason: "unknown-rule" };
        const state = get();
        const evaluation = evaluateEarn(state.events, rule, sourceRef, now);
        if (!evaluation.ok) return { granted: false, reason: evaluation.reason };
        const event = createEarnEvent({
          id: nextEventId(state.nextSeq),
          rule,
          sourceRef,
          now,
        });
        set({
          events: trimEvents([...state.events, event]),
          nextSeq: state.nextSeq + 1,
        });
        return { granted: true, points: rule.points };
      },

      spendForResource: ({ resourceId, resourceName, pointPrice, now = new Date() }) => {
        const state = get();
        const evaluation = evaluateSpend(state.events, resourceId, pointPrice, now);
        if (!evaluation.ok) return { ok: false, reason: evaluation.reason };
        const event = createSpendEvent({
          id: nextEventId(state.nextSeq),
          resourceId,
          resourceName,
          pointPrice,
          now,
        });
        set({
          events: trimEvents([...state.events, event]),
          nextSeq: state.nextSeq + 1,
        });
        return { ok: true, eventId: event.id };
      },

      refundSpend: (spendEventId, now = new Date()) => {
        const state = get();
        const spend = state.events.find(
          (event) => event.id === spendEventId && event.kind === "spend",
        );
        if (!spend) return false;
        const alreadyRefunded = state.events.some(
          (event) => event.kind === "spend_refund" && event.spendEventId === spendEventId,
        );
        if (alreadyRefunded) return false;
        const event = createSpendRefundEvent({
          id: nextEventId(state.nextSeq),
          spend,
          now,
        });
        set({
          events: trimEvents([...state.events, event]),
          nextSeq: state.nextSeq + 1,
        });
        return true;
      },

      resetForTests: () => set({ events: [], nextSeq: 1 }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ events: state.events, nextSeq: state.nextSeq }),
    },
  ),
);
