/**
 * 맵 스크립팅 API "TS" (T3).
 *
 * WorkAdventure의 WA.room/WA.ui/WA.state/WA.event 아이디어를 차용한
 * toonstudio 자체 구현이다. WA 코드는 Modified AGPL + Commons Clause(비상업)라
 * 코드를 직접 가져오지 않고 인터페이스 아이디어만 참고했다.
 *
 * - TS.room.onEnterZone/onLeaveZone: 구역 진입·퇴장 콜백.
 * - TS.ui.banner/modal: 배너·모달 표시 (호스트의 UI 핸들러로 전달).
 * - TS.state: 공유 변수 (get/set/subscribe, 키 살균).
 * - TS.event: 브로드캐스트 버스 (send/on).
 *
 * 외부 스크립트는 `sandbox="allow-scripts"` iframe에서 실행하고 postMessage로만
 * 호스트와 통신한다 (WA 보안 모델 차용). 프로토콜: "ts-map-script/v1".
 *
 * 1차 범위: 구역 진입/퇴장 + 배너/모달. state/event도 함께 제공한다.
 */

export const MAP_SCRIPT_PROTOCOL = "ts-map-script/v1" as const;

/** 스크립트에 허용할 capability. */
export type MapScriptCapability = "room" | "ui" | "state" | "event";

const ZONE_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,127}$/iu;
const STATE_KEY_PATTERN = /^[a-z0-9][a-z0-9:._-]{0,63}$/iu;
const EVENT_NAME_PATTERN = /^[a-z0-9][a-z0-9:._-]{0,63}$/iu;
const MAX_TEXT_LENGTH = 500;
const MAX_PAYLOAD_JSON_LENGTH = 8192;

function cleanZoneId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return ZONE_ID_PATTERN.test(text) ? text : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= MAX_TEXT_LENGTH ? text : null;
}

function cleanKey(value: unknown, pattern: RegExp): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return pattern.test(text) ? text : null;
}

/** state 값 살균: JSON 직렬화 가능한 원시값·배열·객체만 허용 (8KB 이하). */
function cleanStateValue(value: unknown): unknown | undefined {
  if (value === null) return null;
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") {
    if (type === "number" && !Number.isFinite(value)) return undefined;
    return value;
  }
  if (Array.isArray(value) || (type === "object" && Object.getPrototypeOf(value) === Object.prototype)) {
    try {
      const json = JSON.stringify(value);
      if (json.length > MAX_PAYLOAD_JSON_LENGTH) return undefined;
      return JSON.parse(json) as unknown;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** iframe → host 메시지. */
export type MapScriptIncomingKind =
  | "room.onEnterZone" | "room.onLeaveZone"
  | "ui.banner" | "ui.modal"
  | "state.get" | "state.set" | "state.subscribe" | "state.unsubscribe"
  | "event.send" | "event.on" | "event.off";

export interface MapScriptIncomingMessage {
  readonly protocol: typeof MAP_SCRIPT_PROTOCOL;
  readonly kind: MapScriptIncomingKind;
  readonly zoneId?: unknown;
  readonly textKo?: unknown;
  readonly textEn?: unknown;
  readonly titleKo?: unknown;
  readonly titleEn?: unknown;
  readonly bodyKo?: unknown;
  readonly bodyEn?: unknown;
  readonly key?: unknown;
  readonly value?: unknown;
  readonly name?: unknown;
  readonly payload?: unknown;
  readonly requestId?: unknown;
}

const INCOMING_KINDS: readonly string[] = [
  "room.onEnterZone", "room.onLeaveZone",
  "ui.banner", "ui.modal",
  "state.get", "state.set", "state.subscribe", "state.unsubscribe",
  "event.send", "event.on", "event.off",
];

/** 수신 메시지 형태 검증 (프로토콜·kind allowlist). */
export function isMapScriptIncomingMessage(value: unknown): value is MapScriptIncomingMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return message["protocol"] === MAP_SCRIPT_PROTOCOL
    && typeof message["kind"] === "string"
    && (INCOMING_KINDS as readonly string[]).includes(message["kind"]);
}

/** host → iframe 메시지. */
export type MapScriptOutgoingMessage =
  | { readonly protocol: typeof MAP_SCRIPT_PROTOCOL; readonly kind: "zone.enter"; readonly zoneId: string }
  | { readonly protocol: typeof MAP_SCRIPT_PROTOCOL; readonly kind: "zone.leave"; readonly zoneId: string }
  | { readonly protocol: typeof MAP_SCRIPT_PROTOCOL; readonly kind: "state.value"; readonly key: string; readonly value: unknown; readonly requestId: string | null }
  | { readonly protocol: typeof MAP_SCRIPT_PROTOCOL; readonly kind: "state.changed"; readonly key: string; readonly value: unknown }
  | { readonly protocol: typeof MAP_SCRIPT_PROTOCOL; readonly kind: "event.message"; readonly name: string; readonly payload: unknown }
  | { readonly protocol: typeof MAP_SCRIPT_PROTOCOL; readonly kind: "error"; readonly message: string; readonly requestId: string | null };

export interface MapScriptModal {
  readonly titleKo: string;
  readonly titleEn: string;
  readonly bodyKo: string;
  readonly bodyEn: string;
}

export interface MapScriptUiHandlers {
  readonly onBanner: (banner: { readonly textKo: string; readonly textEn: string }) => void;
  readonly onModal: (modal: MapScriptModal) => void;
}

type Unsubscribe = () => void;

function addToSetMap<K, V>(map: Map<K, Set<V>>, key: K, value: V): Unsubscribe {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
  return () => {
    const current = map.get(key);
    if (!current) return;
    current.delete(value);
    if (current.size === 0) map.delete(key);
  };
}

/**
 * 맵 스크립트 호스트. 인페이지 스크립트와 샌드박스 iframe이 공유하는
 * 레지스트리·상태·이벤트 버스를 소유한다.
 */
export class MapScriptHost {
  private readonly enterCallbacks = new Map<string, Set<() => void>>();
  private readonly leaveCallbacks = new Map<string, Set<() => void>>();
  private readonly state = new Map<string, unknown>();
  private readonly stateSubscribers = new Map<string, Set<(value: unknown) => void>>();
  private readonly eventListeners = new Map<string, Set<(payload: unknown) => void>>();
  private readonly sandboxPorts = new Set<(message: MapScriptOutgoingMessage) => void>();

  constructor(private readonly ui: MapScriptUiHandlers) {}

  // -- TS.room -------------------------------------------------------------

  /** 구역 진입 콜백 등록. 반환 함수로 해제. */
  onEnterZone(zoneId: string, callback: () => void): Unsubscribe {
    const clean = cleanZoneId(zoneId);
    if (!clean || typeof callback !== "function") return () => undefined;
    return addToSetMap(this.enterCallbacks, clean, callback);
  }

  /** 구역 퇴장 콜백 등록. */
  onLeaveZone(zoneId: string, callback: () => void): Unsubscribe {
    const clean = cleanZoneId(zoneId);
    if (!clean || typeof callback !== "function") return () => undefined;
    return addToSetMap(this.leaveCallbacks, clean, callback);
  }

  /** 구역 진입 디스패치 — PlaceModeDirector의 mode-entered나 position 펌프에서 호출. */
  dispatchZoneEnter(zoneId: string): void {
    const clean = cleanZoneId(zoneId);
    if (!clean) return;
    this.enterCallbacks.get(clean)?.forEach((callback) => {
      try { callback(); } catch { /* 스크립트 오류는 호스트를 깨지 않는다. */ }
    });
    this.sendToSandboxes({ protocol: MAP_SCRIPT_PROTOCOL, kind: "zone.enter", zoneId: clean });
  }

  /** 구역 퇴장 디스패치. */
  dispatchZoneLeave(zoneId: string): void {
    const clean = cleanZoneId(zoneId);
    if (!clean) return;
    this.leaveCallbacks.get(clean)?.forEach((callback) => {
      try { callback(); } catch { /* 스크립트 오류는 호스트를 깨지 않는다. */ }
    });
    this.sendToSandboxes({ protocol: MAP_SCRIPT_PROTOCOL, kind: "zone.leave", zoneId: clean });
  }

  // -- TS.ui ---------------------------------------------------------------

  /** 배너 표시 (호스트 UI 핸들러로 전달). */
  banner(textKo: string, textEn?: string): void {
    const ko = cleanText(textKo);
    if (!ko) return;
    const en = cleanText(textEn) ?? ko;
    this.ui.onBanner({ textKo: ko, textEn: en });
  }

  /** 모달 표시 (호스트 UI 핸들러로 전달). */
  modal(input: { readonly titleKo: string; readonly titleEn?: string; readonly bodyKo: string; readonly bodyEn?: string }): void {
    const titleKo = cleanText(input.titleKo);
    const bodyKo = cleanText(input.bodyKo);
    if (!titleKo || !bodyKo) return;
    this.ui.onModal({
      titleKo,
      titleEn: cleanText(input.titleEn) ?? titleKo,
      bodyKo,
      bodyEn: cleanText(input.bodyEn) ?? bodyKo,
    });
  }

  // -- TS.state --------------------------------------------------------------

  /** 공유 변수 읽기. */
  getState(key: string): unknown {
    const clean = cleanKey(key, STATE_KEY_PATTERN);
    return clean ? (this.state.get(clean) ?? null) : null;
  }

  /** 공유 변수 쓰기. 구독자에게 변경을 알린다. */
  setState(key: string, value: unknown): boolean {
    const clean = cleanKey(key, STATE_KEY_PATTERN);
    const cleaned = cleanStateValue(value);
    if (!clean || cleaned === undefined) return false;
    this.state.set(clean, cleaned);
    this.stateSubscribers.get(clean)?.forEach((callback) => {
      try { callback(cleaned); } catch { /* 무시 */ }
    });
    this.sendToSandboxes({ protocol: MAP_SCRIPT_PROTOCOL, kind: "state.changed", key: clean, value: cleaned });
    return true;
  }

  /** 공유 변수 구독. */
  subscribeState(key: string, callback: (value: unknown) => void): Unsubscribe {
    const clean = cleanKey(key, STATE_KEY_PATTERN);
    if (!clean || typeof callback !== "function") return () => undefined;
    return addToSetMap(this.stateSubscribers, clean, callback);
  }

  // -- TS.event --------------------------------------------------------------

  /** 브로드캐스트 발신. */
  sendEvent(name: string, payload: unknown = null): boolean {
    const clean = cleanKey(name, EVENT_NAME_PATTERN);
    const cleaned = cleanStateValue(payload);
    if (!clean || cleaned === undefined) return false;
    this.eventListeners.get(clean)?.forEach((callback) => {
      try { callback(cleaned); } catch { /* 무시 */ }
    });
    this.sendToSandboxes({ protocol: MAP_SCRIPT_PROTOCOL, kind: "event.message", name: clean, payload: cleaned });
    return true;
  }

  /** 브로드캐스트 수신 등록. */
  onEvent(name: string, callback: (payload: unknown) => void): Unsubscribe {
    const clean = cleanKey(name, EVENT_NAME_PATTERN);
    if (!clean || typeof callback !== "function") return () => undefined;
    return addToSetMap(this.eventListeners, clean, callback);
  }

  // -- 샌드박스 연결 ----------------------------------------------------------

  /**
   * 샌드박스 iframe의 postMessage 수신 포트를 등록한다.
   * 호출자는 message 이벤트에서 source가 해당 iframe의 contentWindow인지
   * 확인한 뒤 이 포트로 메시지를 전달해야 한다.
   */
  attachSandboxPort(port: (message: MapScriptOutgoingMessage) => void): Unsubscribe {
    this.sandboxPorts.add(port);
    return () => { this.sandboxPorts.delete(port); };
  }

  private sendToSandboxes(message: MapScriptOutgoingMessage): void {
    this.sandboxPorts.forEach((port) => {
      try { port(message); } catch { /* 무시 */ }
    });
  }

  /**
   * 샌드박스에서 온 메시지를 처리한다. capability allowlist를 벗어난 요청은
   * error 응답으로 거절한다.
   */
  handleSandboxMessage(
    message: MapScriptIncomingMessage,
    capabilities: ReadonlySet<MapScriptCapability>,
    respond: (message: MapScriptOutgoingMessage) => void,
  ): void {
    const need = (capability: MapScriptCapability): boolean => {
      if (capabilities.has(capability)) return true;
      respond({ protocol: MAP_SCRIPT_PROTOCOL, kind: "error", message: `capability '${capability}' is not allowed`, requestId: requestIdOf(message) });
      return false;
    };
    switch (message.kind) {
      case "room.onEnterZone":
      case "room.onLeaveZone": {
        if (!need("room")) return;
        if (!cleanZoneId(message.zoneId)) {
          respond({ protocol: MAP_SCRIPT_PROTOCOL, kind: "error", message: "invalid zoneId", requestId: requestIdOf(message) });
        }
        // 구독은 shim 쪽 레지스트리에 둔다. 호스트는 zone.enter/leave를 전체
        // 샌드박스에 브로드캐스트하고 shim이 zoneId로 필터링한다.
        return;
      }
      case "ui.banner": {
        if (!need("ui")) return;
        this.banner(String(message.textKo ?? ""), message.textEn === undefined ? undefined : String(message.textEn));
        return;
      }
      case "ui.modal": {
        if (!need("ui")) return;
        this.modal({
          titleKo: String(message.titleKo ?? ""),
          titleEn: message.titleEn === undefined ? undefined : String(message.titleEn),
          bodyKo: String(message.bodyKo ?? ""),
          bodyEn: message.bodyEn === undefined ? undefined : String(message.bodyEn),
        });
        return;
      }
      case "state.get": {
        if (!need("state")) return;
        const key = cleanKey(message.key, STATE_KEY_PATTERN);
        respond({
          protocol: MAP_SCRIPT_PROTOCOL, kind: "state.value",
          key: key ?? "", value: key ? this.getState(key) : null,
          requestId: requestIdOf(message),
        });
        return;
      }
      case "state.set": {
        if (!need("state")) return;
        const key = cleanKey(message.key, STATE_KEY_PATTERN);
        const ok = key ? this.setState(key, message.value) : false;
        if (!ok) {
          respond({ protocol: MAP_SCRIPT_PROTOCOL, kind: "error", message: "invalid state key/value", requestId: requestIdOf(message) });
        }
        return;
      }
      case "state.subscribe": {
        if (!need("state")) return;
        // 구독 변경은 state.changed 아웃고잉으로 전달된다.
        return;
      }
      case "state.unsubscribe":
        return;
      case "event.send": {
        if (!need("event")) return;
        const ok = this.sendEvent(String(message.name ?? ""), message.payload);
        if (!ok) {
          respond({ protocol: MAP_SCRIPT_PROTOCOL, kind: "error", message: "invalid event name/payload", requestId: requestIdOf(message) });
        }
        return;
      }
      case "event.on":
      case "event.off": {
        if (!need("event")) return;
        return;
      }
    }
  }
}

function requestIdOf(message: MapScriptIncomingMessage): string | null {
  return typeof message.requestId === "string" && message.requestId.length <= 64 ? message.requestId : null;
}

/**
 * iframe 안에서 실행되는 TS shim 소스.
 * parent.postMessage로만 호스트와 통신하며, DOM·네트워크·스토리지에 직접 닿지 않는다.
 * (iframe 자체가 sandbox="allow-scripts"라 allow-same-origin이 없어 opaque origin이다.)
 */
export function mapScriptShimSource(): string {
  return `(function(){
"use strict";
var PROTOCOL=${JSON.stringify(MAP_SCRIPT_PROTOCOL)};
var zoneEnterHandlers={};
var zoneLeaveHandlers={};
var eventHandlers={};
var stateHandlers={};
var pendingState={};
var seq=0;
function post(message){
  message.protocol=PROTOCOL;
  parent.postMessage(message,"*");
}
function addHandler(bucket, key, cb){
  if(typeof cb!=="function") return function(){};
  var list=bucket[key]||(bucket[key]=[]);
  list.push(cb);
  return function(){
    var items=bucket[key]||[];
    var index=items.indexOf(cb);
    if(index>=0) items.splice(index,1);
  };
}
window.addEventListener("message",function(event){
  var data=event.data;
  if(!data||data.protocol!==PROTOCOL) return;
  var run=function(list){ for(var i=0;i<list.length;i++){ try{ list[i](); }catch(e){} } };
  if(data.kind==="zone.enter") run(zoneEnterHandlers[data.zoneId]||[]);
  else if(data.kind==="zone.leave") run(zoneLeaveHandlers[data.zoneId]||[]);
  else if(data.kind==="state.value"){
    var pending=pendingState[data.requestId];
    if(pending){ delete pendingState[data.requestId]; pending(data.value); }
  }
  else if(data.kind==="state.changed") run((stateHandlers[data.key]||[]).map(function(cb){ return function(){ cb(data.value); }; }));
  else if(data.kind==="event.message") run((eventHandlers[data.name]||[]).map(function(cb){ return function(){ cb(data.payload); }; }));
});
function cleanText(value){
  if(typeof value!=="string") return "";
  return value.slice(0,500);
}
window.TS={
  room:{
    onEnterZone:function(zoneId,cb){
      post({kind:"room.onEnterZone",zoneId:String(zoneId)});
      return addHandler(zoneEnterHandlers,String(zoneId),cb);
    },
    onLeaveZone:function(zoneId,cb){
      post({kind:"room.onLeaveZone",zoneId:String(zoneId)});
      return addHandler(zoneLeaveHandlers,String(zoneId),cb);
    }
  },
  ui:{
    banner:function(textKo,textEn){ post({kind:"ui.banner",textKo:cleanText(textKo),textEn:cleanText(textEn)}); },
    modal:function(options){
      options=options||{};
      post({kind:"ui.modal",titleKo:cleanText(options.titleKo),titleEn:cleanText(options.titleEn),bodyKo:cleanText(options.bodyKo),bodyEn:cleanText(options.bodyEn)});
    }
  },
  state:{
    get:function(key){
      return new Promise(function(resolve){
        var requestId="s"+(++seq);
        pendingState[requestId]=resolve;
        post({kind:"state.get",key:String(key),requestId:requestId});
      });
    },
    set:function(key,value){ post({kind:"state.set",key:String(key),value:value}); },
    subscribe:function(key,cb){
      post({kind:"state.subscribe",key:String(key)});
      return addHandler(stateHandlers,String(key),cb);
    }
  },
  event:{
    send:function(name,payload){ post({kind:"event.send",name:String(name),payload:payload===undefined?null:payload}); },
    on:function(name,cb){
      post({kind:"event.on",name:String(name)});
      return addHandler(eventHandlers,String(name),cb);
    }
  }
};
})();`;
}

/**
 * 샌드박스 iframe용 srcdoc을 만든다. 사용자 스크립트에 `</script>`가 들어 있으면
 * 탈출로 간주해 null을 반환한다.
 */
export function mapScriptSandboxSrcdoc(userScript: string): string | null {
  if (typeof userScript !== "string" || userScript.length === 0 || userScript.length > 65536) return null;
  if (/<\/script/i.test(userScript)) return null;
  const shim = mapScriptShimSource().replace(/<\/script/gi, "<\\/script");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>${shim}</script><script>${userScript}</script></body></html>`;
}

/**
 * 샌드박스 iframe 엘리먼트를 만든다. `sandbox="allow-scripts"`만 부여해
 * allow-same-origin을 빼앗는다 (opaque origin + postMessage 격리).
 */
export function createMapScriptSandboxIframe(
  doc: Document,
  srcdoc: string,
): HTMLIFrameElement {
  const iframe = doc.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("srcdoc", srcdoc);
  iframe.setAttribute("title", "map script sandbox");
  iframe.style.display = "none";
  return iframe;
}
