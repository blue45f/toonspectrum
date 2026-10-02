import { getClassProduct } from "./learning-classes";

/**
 * 유료 클래스 신청이 결제·계정 시스템과 만나는 유일한 지점.
 *
 * 현재 빌드에는 실제 결제 수단이 연결되어 있지 않다. 그래서 이 어댑터는
 * 결제를 흉내 내지 않고, 로그인 사용자의 신청을 "사전 신청"으로만 접수한다.
 * 실제 결제를 붙일 때는 이 어댑터만 마켓 체크아웃 세션 생성으로 교체하면 되고,
 * 호출부(LearningClassesPage)와 신청 상태 모델(learning-classes)은 바꾸지 않는다.
 * 게스트 차단은 호출부의 표준 계정 게이트(useAccountGate)가 먼저 안내하고,
 * 어댑터에서도 계정 없이는 접수를 거부해 이중으로 막는다.
 */
export interface ClassCheckoutRequest {
  classId: string;
  userId: string | null;
}

export type ClassCheckoutResult =
  | { kind: "requires-account" }
  | { kind: "unknown-class" }
  | { kind: "accepted"; appliedAt: string };

export interface ClassCheckoutAdapter {
  checkout(request: ClassCheckoutRequest): Promise<ClassCheckoutResult>;
}

export const preEnrollmentCheckoutAdapter: ClassCheckoutAdapter = {
  async checkout(request) {
    if (!request.userId) return { kind: "requires-account" };
    if (!getClassProduct(request.classId)) return { kind: "unknown-class" };
    return { kind: "accepted", appliedAt: new Date().toISOString() };
  },
};

/** 결제 연결 지점은 이 상수 하나뿐이다 — 실제 결제 어댑터로 교체할 자리. */
export const classCheckoutAdapter: ClassCheckoutAdapter = preEnrollmentCheckoutAdapter;
