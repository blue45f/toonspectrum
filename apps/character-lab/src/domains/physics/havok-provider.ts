/**
 * havok provider: `@babylonjs/havok`가 설치돼 있지 않으므로 항상 unavailable이다.
 * 시뮬레이션 메서드는 호출 즉시 PhysicsProviderError를 던져 무음 대체를 막는다(ADR-0018).
 */
import { failVisible } from "../../contracts";

import { PhysicsProviderError } from "./builtin-provider";

import type { PhysicsProvider, PhysicsStatus, SettleReceipt } from "../../contracts";

export const HAVOK_UNAVAILABLE_REASON_KO = "@babylonjs/havok 패키지가 설치되어 있지 않습니다(라이선스·lockfile 승인 필요).";

function unavailableError(): PhysicsProviderError {
  return new PhysicsProviderError(failVisible("physics-havok-unavailable", HAVOK_UNAVAILABLE_REASON_KO));
}

export function createHavokProvider(): PhysicsProvider {
  return {
    id: "havok",
    init(): Promise<PhysicsStatus> {
      return Promise.resolve({ id: "havok", status: "unavailable", reasonKo: HAVOK_UNAVAILABLE_REASON_KO });
    },
    setChains(): void {
      throw unavailableError();
    },
    setBoneWorld(): void {
      throw unavailableError();
    },
    step(): void {
      throw unavailableError();
    },
    settle(): SettleReceipt {
      throw unavailableError();
    },
    readChainPositions(): Float32Array {
      throw unavailableError();
    },
    reset(): void {
      // 상태가 없으므로 할 일이 없다(실패 아님).
    },
    dispose(): void {
      // 보유 자원 없음.
    },
  };
}
