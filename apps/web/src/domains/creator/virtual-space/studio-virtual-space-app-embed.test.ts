import { describe, expect, it } from "vitest";
import {
  STUDIO_APP_BRIDGE_REQUEST,
  STUDIO_APP_BRIDGE_RESPONSE,
  CLOSED_STUDIO_APP_EMBED_PRESENCE,
  createStudioAppBridgeResponse,
  findStudioBuiltinApp,
  parseStudioAppBridgeMessage,
  resolveStudioAppEmbedSandbox,
  resolveStudioAppEmbedTarget,
  shouldHandleStudioAppBridgeMessage,
  stepStudioAppEmbedPresence,
  studioAppEmbedTargetOrigin,
} from "./studio-virtual-space-app-embed";
import {
  createTileEffect,
  type StudioTileEffectDefinition,
  type StudioTileEffectOf,
} from "./studio-virtual-space-tile-effects";

const TILE = { width: 16, height: 16 };

function appEffect(input: Parameters<typeof createTileEffect>[0]): StudioTileEffectOf<"app"> {
  const result = createTileEffect(input);
  if (!result.ok) throw new Error(`생성 실패: ${JSON.stringify(result.errors)}`);
  if (result.effect.kind !== "app") throw new Error("app 이펙트가 아닙니다");
  return result.effect;
}

describe("findStudioBuiltinApp", () => {
  it("toonstudio://timer는 내장 타이머로 해석된다", () => {
    expect(findStudioBuiltinApp("toonstudio://timer")?.id).toBe("timer");
  });

  it("모르는 내장 앱 주소와 일반 URL은 내장 앱이 아니다", () => {
    expect(findStudioBuiltinApp("toonstudio://poll")).toBeNull();
    expect(findStudioBuiltinApp("https://example.com/app")).toBeNull();
    expect(findStudioBuiltinApp("toonstudio://")).toBeNull();
  });
});

describe("resolveStudioAppEmbedTarget", () => {
  it("내장 앱 URL은 builtin 대상으로 해석된다", () => {
    const effect = appEffect({ kind: "app", tileX: 0, tileY: 0, url: "toonstudio://timer" });
    const target = resolveStudioAppEmbedTarget(effect);
    expect(target).toEqual({ type: "builtin", appId: "timer", titleKo: "집중 타이머", titleEn: "Focus timer" });
  });

  it("http(s) URL은 iframe 대상이 되고 allowApi가 그대로 실린다", () => {
    const effect = appEffect({ kind: "app", tileX: 0, tileY: 0, url: "https://example.com/tool", allowApi: true });
    expect(resolveStudioAppEmbedTarget(effect)).toEqual({ type: "iframe", src: "https://example.com/tool", allowApi: true });
  });

  it("allowApi는 기본값 false다", () => {
    const effect = appEffect({ kind: "app", tileX: 0, tileY: 0, url: "https://example.com/tool" });
    expect(effect.allowApi).toBe(false);
    expect(resolveStudioAppEmbedTarget(effect)).toEqual({ type: "iframe", src: "https://example.com/tool", allowApi: false });
  });

  it("해석할 수 없는 주소는 null이라 패널이 열리지 않는다", () => {
    const effect = appEffect({ kind: "app", tileX: 0, tileY: 0, url: "toonstudio://timer" });
    const ghost = { ...effect, url: "toonstudio://unknown-app" };
    expect(resolveStudioAppEmbedTarget(ghost)).toBeNull();
  });
});

describe("iframe 샌드박스 정책", () => {
  it("allowApi 여부와 무관하게 allow-same-origin을 절대 열지 않는다", () => {
    expect(resolveStudioAppEmbedSandbox(false)).toBe("allow-scripts");
    expect(resolveStudioAppEmbedSandbox(true)).toBe("allow-scripts");
    expect(resolveStudioAppEmbedSandbox(true)).not.toContain("allow-same-origin");
  });

  it("targetOrigin은 src의 오리진만 뽑는다", () => {
    expect(studioAppEmbedTargetOrigin("https://example.com/tool?x=1")).toBe("https://example.com");
    expect(studioAppEmbedTargetOrigin("javascript:alert(1)")).toBeNull();
    expect(studioAppEmbedTargetOrigin("not a url")).toBeNull();
  });
});

describe("postMessage 브리지", () => {
  const fakeWindow = { name: "frame" };
  const otherWindow = { name: "other" };

  it("allowApi가 꺼져 있으면 어떤 메시지도 처리하지 않는다", () => {
    expect(shouldHandleStudioAppBridgeMessage(false, fakeWindow, fakeWindow)).toBe(false);
  });

  it("출처 윈도우가 패널 iframe과 다르면 무시한다", () => {
    expect(shouldHandleStudioAppBridgeMessage(true, otherWindow, fakeWindow)).toBe(false);
    expect(shouldHandleStudioAppBridgeMessage(true, fakeWindow, fakeWindow)).toBe(true);
  });

  it("스키마를 통과한 메시지만 파싱된다", () => {
    expect(parseStudioAppBridgeMessage({ type: "toonstudio.app.ready" })).toEqual({ type: "toonstudio.app.ready" });
    expect(parseStudioAppBridgeMessage({ type: STUDIO_APP_BRIDGE_REQUEST, requestId: "r1", method: "getContext" }))
      .toEqual({ type: STUDIO_APP_BRIDGE_REQUEST, requestId: "r1", method: "getContext" });
    // 허용되지 않은 메서드는 거부한다.
    expect(parseStudioAppBridgeMessage({ type: STUDIO_APP_BRIDGE_REQUEST, requestId: "r1", method: "eval" })).toBeNull();
    expect(parseStudioAppBridgeMessage({ type: "toonstudio.app.request", requestId: "", method: "getContext" })).toBeNull();
    expect(parseStudioAppBridgeMessage(null)).toBeNull();
    expect(parseStudioAppBridgeMessage("toonstudio.app.ready")).toBeNull();
    expect(parseStudioAppBridgeMessage({ type: "unknown" })).toBeNull();
  });

  it("getContext 응답은 읽기 전용 컨텍스트만 담는다", () => {
    const response = createStudioAppBridgeResponse("r1", { app: "toonstudio-virtual-space", locale: "ko", worldId: "world-1" });
    expect(response).toEqual({
      type: STUDIO_APP_BRIDGE_RESPONSE,
      requestId: "r1",
      payload: { app: "toonstudio-virtual-space", locale: "ko", worldId: "world-1" },
    });
  });
});

describe("stepStudioAppEmbedPresence", () => {
  const effect = appEffect({ kind: "app", tileX: 2, tileY: 3, url: "toonstudio://timer" });
  const effects: readonly StudioTileEffectDefinition[] = [effect];
  // 타일 (2,3), 크기 1×1, 타일 16px → x 32..48, y 48..64
  const inside = { x: 40, y: 56 };
  const outside = { x: 8, y: 8 };

  it("앱 타일에 들어오면 패널을 연다", () => {
    const step = stepStudioAppEmbedPresence(CLOSED_STUDIO_APP_EMBED_PRESENCE, effects, inside, TILE);
    expect(step.opened?.id).toBe(effect.id);
    expect(step.presence.openEffectId).toBe(effect.id);
    expect(step.closed).toBe(false);
  });

  it("타일 안에 머무는 동안은 열린 상태를 유지한다", () => {
    const opened = stepStudioAppEmbedPresence(CLOSED_STUDIO_APP_EMBED_PRESENCE, effects, inside, TILE);
    const stayed = stepStudioAppEmbedPresence(opened.presence, effects, { x: 33, y: 49 }, TILE);
    expect(stayed.opened).toBeNull();
    expect(stayed.closed).toBe(false);
    expect(stayed.presence.openEffectId).toBe(effect.id);
  });

  it("타일을 벗어나면 패널을 닫는다", () => {
    const opened = stepStudioAppEmbedPresence(CLOSED_STUDIO_APP_EMBED_PRESENCE, effects, inside, TILE);
    const left = stepStudioAppEmbedPresence(opened.presence, effects, outside, TILE);
    expect(left.closed).toBe(true);
    expect(left.presence.openEffectId).toBeNull();
  });

  it("닫힌 채로 밖에 있으면 아무 일도 일어나지 않는다", () => {
    const step = stepStudioAppEmbedPresence(CLOSED_STUDIO_APP_EMBED_PRESENCE, effects, outside, TILE);
    expect(step).toEqual({ presence: CLOSED_STUDIO_APP_EMBED_PRESENCE, opened: null, closed: false });
  });

  it("이펙트가 삭제되면 열린 패널도 닫힌다", () => {
    const opened = stepStudioAppEmbedPresence(CLOSED_STUDIO_APP_EMBED_PRESENCE, effects, inside, TILE);
    const removed = stepStudioAppEmbedPresence(opened.presence, [], inside, TILE);
    expect(removed.closed).toBe(true);
    expect(removed.presence.openEffectId).toBeNull();
  });
});
