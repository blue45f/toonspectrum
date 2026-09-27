import type { StudioCrdtBindingStatus } from "./studio-crdt-room-binding";
import type { StudioLiveCrdtFanout, StudioLiveTransportMode } from "./studio-live-collaboration-transport";

export interface StudioLiveCanonicalAuthorityInput {
  readonly bindingState: StudioCrdtBindingStatus["state"];
  readonly transportReady: boolean;
  readonly transportMode: StudioLiveTransportMode | null;
  readonly crdtFanout: StudioLiveCrdtFanout | undefined;
  readonly previousAuthority: boolean;
  readonly nonAuthoritativeDeliveryPending?: boolean;
}

/** 정본 편집 권위와 전송 대기 표시를 구분한다. 권한·잠금 검사는 호출자의 기존 경계가 소유한다. */
export function resolveStudioLiveCanonicalAuthority(input: StudioLiveCanonicalAuthorityInput): boolean {
  // 이미 합쳐진 정본의 후속 전송·ACK 대기는 권한 상실이 아니다.
  // 최초 동기화와 오류 복구는 ready를 다시 확인해야 한다.
  // P2P/로컬 문서의 전달 완료와 서버 ACK는 별개의 경계다. 일반 전송 실패는 허용하지 않는다.
  const pendingLocalDelivery = input.bindingState === "retrying"
    && input.nonAuthoritativeDeliveryPending === true
    && (input.transportMode === "local" || input.crdtFanout === "mesh");
  const established = input.bindingState === "ready"
    || ((input.bindingState === "syncing" || pendingLocalDelivery) && input.previousAuthority);
  return established
    && input.transportReady
    && input.transportMode !== null
    // 서버를 사용하는 시그널링과 Yjs 문서의 권위는 별개다. 준비된 mesh 문서도 편집할 수
    // 있지만 서버 저장 완료는 기존 binding의 authoritative ACK 경계에서만 증명한다.
    && (input.transportMode !== "server"
      || input.crdtFanout === "authoritative"
      || input.crdtFanout === "mesh");
}
