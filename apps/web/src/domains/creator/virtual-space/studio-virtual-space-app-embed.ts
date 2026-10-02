import type { StudioBilingualCopy } from "./studio-virtual-space-proximity";
import {
  STUDIO_APP_TILE_BUILTIN_URL_PATTERN,
  resolveTileEffectTrigger,
  studioTileEffectContains,
  type StudioTileEffectDefinition,
  type StudioTileEffectOf,
  type StudioTilePixelSize,
  type StudioTileTriggerProbe,
} from "./studio-virtual-space-tile-effects";

/**
 * T4-lite 인월드 앱 임베드 — 순수 로직.
 *
 * 타일(또는 오브젝트)에 붙은 "app" 이펙트의 URL을 근접 패널로 여는 규칙이다.
 * 보안 원칙:
 * - iframe은 항상 `sandbox="allow-scripts"`만 건다. `allow-same-origin`을 함께 걸면
 *   프레임 안의 페이지가 샌드박스를 스스로 벗길 수 있어 절대 병기하지 않는다.
 * - 내부 API 접근은 `allowApi` 플래그가 있을 때만, 그리고 postMessage 브리지로만
 *   허용한다. 브리지는 읽기 전용 컨텍스트(getContext)만 노출한다.
 * - 메시지 검증: 출처 윈도우(iframe.contentWindow)와 스키마를 모두 확인한다.
 *
 * 1차 내장 예시 앱: 집중 타이머 (`toonstudio://timer`, 로직은 app-timer 모듈).
 */

/** iframe 샌드박스 속성. API 허용 여부와 무관하게 동일하다 (API는 postMessage 전용). */
export const STUDIO_APP_EMBED_SANDBOX = "allow-scripts";

/** app 이펙트의 iframe 샌드박스 속성을 돌려준다. allowApi여도 완화하지 않는다. */
export function resolveStudioAppEmbedSandbox(allowApi: boolean): string {
  void allowApi;
  return STUDIO_APP_EMBED_SANDBOX;
}

export type StudioBuiltinAppId = "timer";

export interface StudioBuiltinApp {
  readonly id: StudioBuiltinAppId;
  readonly url: string;
  readonly titleKo: string;
  readonly titleEn: string;
}

/** 내장 앱 목록. 타일 URL이 `toonstudio://<id>`와 일치하면 패널이 내장 앱을 렌더한다. */
export const STUDIO_BUILTIN_APPS: readonly StudioBuiltinApp[] = [
  { id: "timer", url: "toonstudio://timer", titleKo: "집중 타이머", titleEn: "Focus timer" },
];

export function findStudioBuiltinApp(url: string): StudioBuiltinApp | null {
  if (!STUDIO_APP_TILE_BUILTIN_URL_PATTERN.test(url)) return null;
  return STUDIO_BUILTIN_APPS.find((app) => app.url === url) ?? null;
}

export type StudioAppEmbedTarget =
  | {
    readonly type: "builtin";
    readonly appId: StudioBuiltinAppId;
    readonly titleKo: string;
    readonly titleEn: string;
  }
  | {
    readonly type: "iframe";
    readonly src: string;
    /** postMessage 브리지 응답 허용 여부. */
    readonly allowApi: boolean;
  };

/**
 * app 이펙트에서 패널이 열 대상을 해석한다.
 * 내장 앱이면 builtin, http(s)면 iframe, 그 외에는 null(열지 않음).
 */
export function resolveStudioAppEmbedTarget(
  effect: Pick<StudioTileEffectOf<"app">, "url" | "allowApi">,
): StudioAppEmbedTarget | null {
  const builtin = findStudioBuiltinApp(effect.url);
  if (builtin) return { type: "builtin", appId: builtin.id, titleKo: builtin.titleKo, titleEn: builtin.titleEn };
  let parsed: URL | undefined;
  try { parsed = new URL(effect.url); } catch { parsed = undefined; }
  if (parsed && (parsed.protocol === "https:" || parsed.protocol === "http:")) {
    return { type: "iframe", src: effect.url, allowApi: effect.allowApi };
  }
  return null;
}

/** iframe 응답을 보낼 targetOrigin. src에서 오리진만 뽑는다. */
export function studioAppEmbedTargetOrigin(src: string): string | null {
  try {
    const parsed = new URL(src);
    return parsed.origin === "null" ? null : parsed.origin;
  } catch {
    return null;
  }
}

/* ---------------- postMessage 브리지 프로토콜 ---------------- */

export const STUDIO_APP_BRIDGE_READY = "toonstudio.app.ready";
export const STUDIO_APP_BRIDGE_STATE = "toonstudio.app.state";
export const STUDIO_APP_BRIDGE_REQUEST = "toonstudio.app.request";
export const STUDIO_APP_BRIDGE_RESPONSE = "toonstudio.app.response";

/** 브리지가 노출하는 메서드. 읽기 전용 컨텍스트 조회만 둔다. */
export const STUDIO_APP_BRIDGE_METHODS = ["getContext"] as const;
export type StudioAppBridgeMethod = (typeof STUDIO_APP_BRIDGE_METHODS)[number];

export type StudioAppBridgeMessage =
  | { readonly type: typeof STUDIO_APP_BRIDGE_READY }
  | { readonly type: typeof STUDIO_APP_BRIDGE_STATE; readonly state: string }
  | { readonly type: typeof STUDIO_APP_BRIDGE_REQUEST; readonly requestId: string; readonly method: StudioAppBridgeMethod };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 프레임에서 온 메시지를 스키마로 검증한다. 모르는 형태는 null. */
export function parseStudioAppBridgeMessage(data: unknown): StudioAppBridgeMessage | null {
  if (!isRecord(data) || typeof data.type !== "string") return null;
  switch (data.type) {
    case STUDIO_APP_BRIDGE_READY:
      return { type: STUDIO_APP_BRIDGE_READY };
    case STUDIO_APP_BRIDGE_STATE:
      return typeof data.state === "string" && data.state.length <= 64
        ? { type: STUDIO_APP_BRIDGE_STATE, state: data.state }
        : null;
    case STUDIO_APP_BRIDGE_REQUEST:
      return typeof data.requestId === "string" && data.requestId.length > 0 && data.requestId.length <= 64
        && (STUDIO_APP_BRIDGE_METHODS as readonly string[]).includes(String(data.method))
        ? { type: STUDIO_APP_BRIDGE_REQUEST, requestId: data.requestId, method: data.method as StudioAppBridgeMethod }
        : null;
    default:
      return null;
  }
}

export interface StudioAppBridgeContext {
  readonly app: "toonstudio-virtual-space";
  readonly locale: "ko" | "en";
  /** 열려 있는 스페이스(월드) id. */
  readonly worldId: string;
}

/** getContext 요청에 대한 응답 페이로드를 만든다. */
export function createStudioAppBridgeResponse(
  requestId: string,
  context: StudioAppBridgeContext,
): { readonly type: typeof STUDIO_APP_BRIDGE_RESPONSE; readonly requestId: string; readonly payload: StudioAppBridgeContext } {
  return { type: STUDIO_APP_BRIDGE_RESPONSE, requestId, payload: context };
}

/**
 * 프레임 메시지 수신 게이트. allowApi가 꺼져 있거나 출처 윈도우가 다르면 무시한다.
 * @param expectedWindow 패널 iframe의 contentWindow
 */
export function shouldHandleStudioAppBridgeMessage(
  allowApi: boolean,
  eventSource: unknown,
  expectedWindow: unknown,
): boolean {
  if (!allowApi) return false;
  if (!expectedWindow) return false;
  return eventSource === expectedWindow;
}

/** 패널 제목 문구. effect title이 비면 내장 앱 이름으로 대체한다. */
export function studioAppEmbedPanelTitle(
  bt: StudioBilingualCopy,
  effectTitle: string,
  target: StudioAppEmbedTarget,
): string {
  if (effectTitle.trim().length > 0) return effectTitle;
  if (target.type === "builtin") return bt(target.titleKo, target.titleEn);
  return bt("인월드 앱", "In-world app");
}

/* ---------------- 근접 개폐 판정 ---------------- */

export interface StudioAppEmbedPresence {
  /** 열려 있는 app 이펙트 id. 없으면 null. */
  readonly openEffectId: string | null;
}

export const CLOSED_STUDIO_APP_EMBED_PRESENCE: StudioAppEmbedPresence = Object.freeze({ openEffectId: null });

export interface StudioAppEmbedPresenceStep {
  readonly presence: StudioAppEmbedPresence;
  /** 이번 스텝에서 새로 열린 이펙트. 없으면 null. */
  readonly opened: StudioTileEffectOf<"app"> | null;
  /** 이번 스텝에서 닫혔는지. */
  readonly closed: boolean;
}

/**
 * 아바타 탐침 위치로 앱 패널 개폐를 판정한다.
 * - 열린 앱 타일 안에 머무는 동안은 다른 이펙트와 겹쳐도 패널을 유지한다 (깜빡임 방지).
 * - 타일을 벗어나면 닫고, 새 app 타일 위에 있으면 그 앱을 연다.
 */
export function stepStudioAppEmbedPresence(
  presence: StudioAppEmbedPresence,
  effects: readonly StudioTileEffectDefinition[],
  probe: StudioTileTriggerProbe,
  tileSize: StudioTilePixelSize,
): StudioAppEmbedPresenceStep {
  const openEffect = presence.openEffectId
    ? effects.find((effect): effect is StudioTileEffectOf<"app"> => effect.id === presence.openEffectId && effect.kind === "app")
    : null;
  if (openEffect && studioTileEffectContains(openEffect, probe, tileSize)) {
    return { presence, opened: null, closed: false };
  }
  const trigger = resolveTileEffectTrigger(effects, probe, tileSize);
  if (trigger && trigger.kind === "app") {
    return {
      presence: { openEffectId: trigger.effect.id },
      opened: trigger.effect,
      closed: presence.openEffectId !== null && presence.openEffectId !== trigger.effect.id,
    };
  }
  if (presence.openEffectId !== null) {
    return { presence: CLOSED_STUDIO_APP_EMBED_PRESENCE, opened: null, closed: true };
  }
  return { presence, opened: null, closed: false };
}
