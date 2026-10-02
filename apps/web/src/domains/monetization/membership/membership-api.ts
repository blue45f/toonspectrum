/**
 * membership-api.ts
 *
 * 멤버십 구독 결제를 기존 커머스 인프라(`/commerce`)로 처리하는 클라이언트.
 * 월 구독(정기결제)의 실제 과금은 PG의 정기결제 지원 여부에 따르며,
 * 이 모듈은 주문 생성·승인 계약을 정의하고 실패를 명확히 전달한다.
 */
import { api } from "@/platform/api";

export interface MembershipSubscriptionOrderRequest {
  readonly tierId: string;
  readonly creatorId: string;
  readonly monthlyPriceKrw: number;
  readonly requestId: string;
}

export interface MembershipSubscriptionOrder {
  readonly orderId: string;
  readonly tierId: string;
  readonly monthlyPriceKrw: number;
  readonly currency: "KRW";
  readonly paymentKey: string | null;
  /** true면 즉시 승인 후 구독 개시, false면 별도 승인 단계 필요. */
  readonly checkoutEnabled: boolean;
  readonly disabledReason: string | null;
  /** PG가 정기결제를 지원하는지. 미지원이면 단건 결제로 대체됨을 알린다. */
  readonly recurringSupported: boolean;
}

export function createMembershipSubscriptionOrder(
  input: MembershipSubscriptionOrderRequest,
): Promise<MembershipSubscriptionOrder> {
  return api.post<MembershipSubscriptionOrder>("/commerce/memberships/orders", {
    tierId: input.tierId,
    creatorId: input.creatorId,
    monthlyPriceKrw: input.monthlyPriceKrw,
    requestId: input.requestId,
    acceptedTerms: true,
  });
}

export function confirmMembershipSubscriptionPayment(input: {
  paymentKey: string;
  orderId: string;
  amountKrw: number;
}): Promise<{ orderId: string; status: string }> {
  return api.post<{ orderId: string; status: string }>("/commerce/memberships/confirm", input);
}

export function membershipApiErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "멤버십 가입 처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.";
}
