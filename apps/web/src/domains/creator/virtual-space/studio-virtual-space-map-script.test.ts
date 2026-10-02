// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  createMapScriptSandboxIframe,
  isMapScriptIncomingMessage,
  MapScriptHost,
  MAP_SCRIPT_PROTOCOL,
  mapScriptSandboxSrcdoc,
  mapScriptShimSource,
} from "./studio-virtual-space-map-script";

function makeHost() {
  const onBanner = vi.fn();
  const onModal = vi.fn();
  const host = new MapScriptHost({ onBanner, onModal });
  return { host, onBanner, onModal };
}

describe("MapScriptHost room", () => {
  it("구역 진입·퇴장 콜백을 zoneId로 디스패치한다", () => {
    const { host } = makeHost();
    const entered: string[] = [];
    const left: string[] = [];
    const offEnter = host.onEnterZone("zone-a", () => entered.push("a"));
    host.onEnterZone("zone-b", () => entered.push("b"));
    host.onLeaveZone("zone-a", () => left.push("a"));
    host.dispatchZoneEnter("zone-a");
    host.dispatchZoneLeave("zone-a");
    host.dispatchZoneEnter("zone-b");
    expect(entered).toEqual(["a", "b"]);
    expect(left).toEqual(["a"]);
    offEnter();
    host.dispatchZoneEnter("zone-a");
    expect(entered).toEqual(["a", "b"]);
  });

  it("깨진 zoneId는 무시된다", () => {
    const { host } = makeHost();
    const entered = vi.fn();
    host.onEnterZone("zone-a", entered);
    host.dispatchZoneEnter("../../../evil");
    host.dispatchZoneEnter("");
    expect(entered).not.toHaveBeenCalled();
  });

  it("스크립트 콜백 예외가 호스트를 깨지 않는다", () => {
    const { host } = makeHost();
    host.onEnterZone("zone-a", () => { throw new Error("boom"); });
    const second = vi.fn();
    host.onEnterZone("zone-a", second);
    expect(() => host.dispatchZoneEnter("zone-a")).not.toThrow();
    expect(second).toHaveBeenCalled();
  });
});

describe("MapScriptHost ui", () => {
  it("banner를 호스트 핸들러로 전달한다", () => {
    const { host, onBanner } = makeHost();
    host.banner("환영합니다", "Welcome");
    expect(onBanner).toHaveBeenCalledWith({ textKo: "환영합니다", textEn: "Welcome" });
  });

  it("빈 배너는 무시된다", () => {
    const { host, onBanner } = makeHost();
    host.banner("   ");
    expect(onBanner).not.toHaveBeenCalled();
  });

  it("modal을 호스트 핸들러로 전달한다", () => {
    const { host, onModal } = makeHost();
    host.modal({ titleKo: "공지", bodyKo: "내용입니다" });
    expect(onModal).toHaveBeenCalledWith({
      titleKo: "공지", titleEn: "공지", bodyKo: "내용입니다", bodyEn: "내용입니다",
    });
  });
});

describe("MapScriptHost state/event", () => {
  it("state를 읽고 쓰고 구독한다", () => {
    const { host } = makeHost();
    const seen: unknown[] = [];
    host.subscribeState("team.score", (value) => seen.push(value));
    expect(host.setState("team.score", 42)).toBe(true);
    expect(host.getState("team.score")).toBe(42);
    expect(seen).toEqual([42]);
    // 무효 키는 거부된다.
    expect(host.setState("", 1)).toBe(false);
    expect(host.setState("../../evil", 1)).toBe(false);
    // 직렬화 불가 값은 거부된다.
    expect(host.setState("team.score", () => 1)).toBe(false);
    expect(host.getState("team.score")).toBe(42);
  });

  it("event를 발신·수신한다", () => {
    const { host } = makeHost();
    const received: unknown[] = [];
    const off = host.onEvent("quiz.start", (payload) => received.push(payload));
    expect(host.sendEvent("quiz.start", { round: 1 })).toBe(true);
    expect(received).toEqual([{ round: 1 }]);
    off();
    host.sendEvent("quiz.start");
    expect(received).toHaveLength(1);
    expect(host.sendEvent("", 1)).toBe(false);
  });
});

describe("isMapScriptIncomingMessage", () => {
  it("프로토콜·kind allowlist를 검증한다", () => {
    expect(isMapScriptIncomingMessage({ protocol: MAP_SCRIPT_PROTOCOL, kind: "ui.banner", textKo: "hi" })).toBe(true);
    expect(isMapScriptIncomingMessage({ protocol: "wrong/v1", kind: "ui.banner" })).toBe(false);
    expect(isMapScriptIncomingMessage({ protocol: MAP_SCRIPT_PROTOCOL, kind: "dom.write" })).toBe(false);
    expect(isMapScriptIncomingMessage(null)).toBe(false);
    expect(isMapScriptIncomingMessage("문자열")).toBe(false);
  });
});

describe("handleSandboxMessage", () => {
  it("capability 밖의 요청은 error로 거절한다", () => {
    const { host, onBanner } = makeHost();
    const responses: unknown[] = [];
    host.handleSandboxMessage(
      { protocol: MAP_SCRIPT_PROTOCOL, kind: "ui.banner", textKo: "hi" },
      new Set([]),
      (message) => responses.push(message),
    );
    expect(onBanner).not.toHaveBeenCalled();
    expect(responses).toHaveLength(1);
    expect((responses[0] as { kind: string }).kind).toBe("error");
  });

  it("허용된 capability는 호스트로 전달된다", () => {
    const { host, onBanner } = makeHost();
    host.handleSandboxMessage(
      { protocol: MAP_SCRIPT_PROTOCOL, kind: "ui.banner", textKo: "안녕" },
      new Set(["ui"]),
      () => undefined,
    );
    expect(onBanner).toHaveBeenCalledWith({ textKo: "안녕", textEn: "안녕" });
  });

  it("state.get은 값을 응답한다", () => {
    const { host } = makeHost();
    host.setState("team.score", 7);
    const responses: unknown[] = [];
    host.handleSandboxMessage(
      { protocol: MAP_SCRIPT_PROTOCOL, kind: "state.get", key: "team.score", requestId: "r1" },
      new Set(["state"]),
      (message) => responses.push(message),
    );
    expect(responses).toEqual([{
      protocol: MAP_SCRIPT_PROTOCOL, kind: "state.value",
      key: "team.score", value: 7, requestId: "r1",
    }]);
  });
});

describe("mapScriptSandboxSrcdoc", () => {
  it("shim + 사용자 스크립트를 담은 srcdoc을 만든다", () => {
    const srcdoc = mapScriptSandboxSrcdoc("TS.ui.banner('hi');");
    expect(srcdoc).toContain("window.TS");
    expect(srcdoc).toContain("TS.ui.banner('hi');");
  });

  it("</script> 탈출을 차단한다", () => {
    expect(mapScriptSandboxSrcdoc("x</script><script>alert(1)")).toBeNull();
    expect(mapScriptSandboxSrcdoc("")).toBeNull();
  });
});

describe("mapScriptShimSource", () => {
  it("TS 네임스페이스를 정의한다", () => {
    const shim = mapScriptShimSource();
    expect(shim).toContain("window.TS=");
    expect(shim).toContain("onEnterZone");
    expect(shim).toContain("onLeaveZone");
    expect(shim).toContain("banner");
    expect(shim).toContain("modal");
    expect(shim).toContain("state");
    expect(shim).toContain("event");
    expect(shim).toContain(MAP_SCRIPT_PROTOCOL);
    // shim은 eval 금지 API를 직접 호출하지 않는다.
    expect(shim).not.toContain("XMLHttpRequest");
    expect(shim).not.toContain("localStorage");
  });
});

describe("createMapScriptSandboxIframe", () => {
  it("sandbox=allow-scripts만 부여한다", () => {
    const iframe = createMapScriptSandboxIframe(document, "<html></html>");
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("srcdoc")).toBe("<html></html>");
  });
});
