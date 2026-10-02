/**
 * tipping-api.ts
 *
 * 에피소드 후원 결제를 기존 커머스 인프라(`/commerce`)로 처리하는 클라이언트.
 * 마켓 도메인의 commerce-api.ts와 같은 호출 규약을 따른다.
 * 결제 단계가 실패하면 호출자가 명확한 오류를 받아 UI에서 안내한다.
 */
import { api } from "@/platform/api";

export interface TipOrderRequest {
  readonly episodeId: string;
  readonly titleId: string;
  readonly creatorId: string;
  readonly amountKrw: number;
  readonly message: string | null;
  readonly requestId: string;
}

export interface TipOrder {
  readonly orderId: string;
  readonly episodeId: string;
  readonly amountKrw: number;
  readonly currency: "KRW";
  /** 결제 승인에 쓰는 키 (mock 모드에서는 시뮬레이션용). */
  readonly paymentKey: string | null;
  readonly checkoutEnabled: boolean;
  readonly disabledReason: string | null;
}

export interface TipPaymentConfirmation {
  readonly paymentKey: string;
  readonly orderId: string;
  readonly amountKrw: number;
}

/** 후원 주문을 생성한다. */
export function createTipOrder(input: TipOrderRequest): Promise<TipOrder> {
  return api.post<TipOrder>("/commerce/tips/orders", {
    episodeId: input.episodeId,
    titleId: input.titleId,
    creatorId: input.creatorId,
    amountKrw: input.amountKrw,
    message: input.message,
    requestId: input.requestId,
    acceptedTerms: true,
  });
}

/** 후원 결제를 승인한다. */
export function confirmTipPayment(
  input: TipPaymentConfirmation,
): Promise<{ orderId: string; status: string }> {
  return api.post<{ orderId: string; status: string }>("/commerce/tips/confirm", input);
}

/** API 오류를 사용자에게 보여줄 문구로 바꾼다. */
export function tipApiErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "후원 처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.";
}
