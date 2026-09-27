import { describe, expect, it } from "vitest";

import { resolveStudioLiveCanonicalAuthority, type StudioLiveCanonicalAuthorityInput } from "./studio-live-canonical-authority";

const local: StudioLiveCanonicalAuthorityInput = {
  bindingState: "ready", transportReady: true, transportMode: "local",
  crdtFanout: undefined, previousAuthority: false,
};
const server: StudioLiveCanonicalAuthorityInput = {
  ...local, transportMode: "server", crdtFanout: "authoritative",
};

const mesh: StudioLiveCanonicalAuthorityInput = {
  ...server, crdtFanout: "mesh",
};

describe("정본 편집 권위와 전송 상태의 분리", () => {
  it.each([local, mesh])("전달을 마친 $transportMode 문서는 서버 ACK 대기만으로 페이지 편집 권위를 잃지 않는다", (input) => {
    let previousAuthority = resolveStudioLiveCanonicalAuthority(input);
    for (let index = 0; index < 100; index += 1) {
      previousAuthority = resolveStudioLiveCanonicalAuthority({
        ...input, bindingState: index % 2 === 0 ? "retrying" : "syncing", previousAuthority,
        nonAuthoritativeDeliveryPending: true,
      });
      expect(previousAuthority).toBe(true);
    }
    expect(resolveStudioLiveCanonicalAuthority({ ...input, bindingState: "retrying", nonAuthoritativeDeliveryPending: true })).toBe(false);
    expect(resolveStudioLiveCanonicalAuthority({ ...input, bindingState: "retrying", previousAuthority: true })).toBe(false);
    expect(resolveStudioLiveCanonicalAuthority({
      ...input, bindingState: "retrying", previousAuthority: true, transportReady: false, nonAuthoritativeDeliveryPending: true,
    })).toBe(false);
  });

  it.each([local, server, mesh])("검증된 정본에 연속 편집하는 동안 syncing 표시는 기존 권위를 유지한다 ($transportMode)", (input) => {
    const ready = resolveStudioLiveCanonicalAuthority(input);
    expect(ready).toBe(true);
    let previousAuthority = ready;
    for (let index = 0; index < 100; index += 1) {
      previousAuthority = resolveStudioLiveCanonicalAuthority({ ...input, bindingState: "syncing", previousAuthority });
      expect(previousAuthority).toBe(true);
    }
  });

  it.each([local, server, mesh])("초기 동기화나 연결이 끊어진 상태에서 권위를 새로 만들지 않는다 ($transportMode)", (input) => {
    expect(resolveStudioLiveCanonicalAuthority({ ...input, bindingState: "syncing" })).toBe(false);
    expect(resolveStudioLiveCanonicalAuthority({ ...input, transportReady: false, previousAuthority: true })).toBe(false);
    expect(resolveStudioLiveCanonicalAuthority({ ...input, bindingState: "syncing", transportReady: false, previousAuthority: true })).toBe(false);
  });

  it.each(["idle", "repairing", "error", "recovery-required"] as const)("%s 상태에서 권위를 해제하고 ready 확인 전까지 복구하지 않는다", (bindingState) => {
    for (const input of [local, server, mesh]) {
      const revoked = resolveStudioLiveCanonicalAuthority({ ...input, bindingState, previousAuthority: true });
      expect(revoked).toBe(false);
      expect(resolveStudioLiveCanonicalAuthority({ ...input, bindingState: "syncing", previousAuthority: revoked })).toBe(false);
      expect(resolveStudioLiveCanonicalAuthority({ ...input, previousAuthority: revoked })).toBe(true);
    }
  });

  it("권위 서버 ACK 실패는 비권위 전달 대기 표식으로 우회할 수 없다", () => {
    expect(resolveStudioLiveCanonicalAuthority({ ...server, bindingState: "retrying", previousAuthority: true,
      nonAuthoritativeDeliveryPending: true })).toBe(false);
  });

  it.each([server, mesh])("서버 문서의 재시도에는 로컬 편집 예외를 적용하지 않는다 ($crdtFanout)", (input) => {
    const revoked = resolveStudioLiveCanonicalAuthority({ ...input, bindingState: "retrying", previousAuthority: true });
    expect(revoked).toBe(false);
    expect(resolveStudioLiveCanonicalAuthority({ ...input, bindingState: "syncing", previousAuthority: revoked })).toBe(false);
    expect(resolveStudioLiveCanonicalAuthority({ ...input, previousAuthority: revoked })).toBe(true);
  });

  it.each(["none", undefined] as const)("서버 신호 전달만으로 정본 권위를 부여하지 않는다 (%s)", (crdtFanout) => {
    for (const bindingState of ["ready", "syncing"] as const) {
      expect(resolveStudioLiveCanonicalAuthority({ ...server, bindingState, crdtFanout, previousAuthority: true })).toBe(false);
    }
  });

  it("전송 방식이 아직 없으면 기존 권위도 재사용하지 않는다", () => {
    expect(resolveStudioLiveCanonicalAuthority({ ...local, transportMode: null, previousAuthority: true })).toBe(false);
  });
});
