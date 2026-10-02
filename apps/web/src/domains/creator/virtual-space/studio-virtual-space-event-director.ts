/**
 * 가상 스튜디오 이벤트 디렉터 (Track C).
 *
 * 캔버스(B 트랙)가 매 프레임 호출하는 계약 API:
 *   const director = createStudioVirtualSpaceEventDirector();
 *   director.update(input);            // 매 프레임(또는 이동 시) 입력 공급
 *   const events = director.consumeUiEvents(); // 렌더링할 UI 이벤트 수거
 *
 * 근접 트리거·NPC 인사·동료 접근·타운 이벤트·앰비언트 이벤트를 하나의
 * 디렉터가 모아 UI 이벤트(role: banner/toast/highlight/dialogue)로 낸다.
 * 순수 로직 + 클로저 상태만 두며 DOM·렌더링에는 닿지 않는다.
 * - 모든 사용자 문구는 ko/en 쌍.
 * - text는 평문(스크린리더 role="status"로 읽기 적합)이며 reduced-motion을
 *   요구하는 애니메이션 힌트를 포함하지 않는다.
 * - interactables 입력은 X키 오브젝트 레지스트리
 *   (studio-virtual-space-interactable-objects.ts)와 오피스 가구 레지스트리
 *   (studio-virtual-space-office-interactables.ts) 중 B 트랙이 화면에 표시하는
 *   레이어의 레지스트리에서 공급한다. 디렉터는 id로 라벨을 조회한다.
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  STUDIO_AMBIENT_EVENT_BUCKET_MS,
  studioAmbientHappeningsForBucket,
  studioAmbientPhaseNote,
  studioAmbientUpcomingEventBanner,
} from "./studio-virtual-space-ambient-life";
import {
  STUDIO_INTERACTABLE_OBJECT_REGISTRY,
  studioInteractableRegistryById,
} from "./studio-virtual-space-interactable-objects";
import { STUDIO_OFFICE_OBJECT_REGISTRY } from "./studio-virtual-space-office-interactables";
import {
  STUDIO_MINI_GAME_TRIGGER_ZONES,
  studioMiniGameInviteText,
  type StudioMiniGameTriggerZone,
} from "./studio-virtual-space-mini-games";
import { STUDIO_TOWN_MINI_GAMES } from "./studio-virtual-space-town-program";
import { STUDIO_NPC_GREET_RADIUS } from "./studio-virtual-space-npc";
import { studioNpcDialogueFor } from "./studio-virtual-space-npc-dialogue-context";

// ── 계약 API ────────────────────────────────────────────────────────────────

/** 디렉터가 내보내는 UI 이벤트. */
export interface StudioVirtualSpaceEventUi {
  /** 중복 제거 키. */
  readonly id: string;
  readonly role: "banner" | "toast" | "highlight" | "dialogue";
  readonly textKo: string;
  readonly textEn: string;
  /** 대상 NPC/오브젝트/동료 id (있을 때). */
  readonly targetId?: string;
  readonly at: number;
}

/** 디렉터 입력 (B 트랙이 매 프레임 공급). */
export interface StudioVirtualSpaceEventDirectorInput {
  readonly now: number;
  readonly self: {
    readonly id: string;
    readonly position: StudioVirtualSpacePoint;
    readonly speed: number;
  };
  readonly peers: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly position: StudioVirtualSpacePoint;
  }>;
  readonly npcs: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly position: StudioVirtualSpacePoint;
  }>;
  readonly interactables: ReadonlyArray<{
    readonly id: string;
    readonly kind: string;
    readonly position: StudioVirtualSpacePoint;
    readonly radius: number;
    /** 월드 manifest 상호작용처럼 레지스트리에 없는 대상은 자기 라벨을 함께 넘긴다. */
    readonly labelKo?: string;
    readonly labelEn?: string;
  }>;
  readonly dayPhase: "dawn" | "day" | "dusk" | "night";
}

// ── 상수 ────────────────────────────────────────────────────────────────────

/** 환영 배너 트리거: 로비 스폰 지점. */
const WELCOME_TRIGGER = Object.freeze({
  center: { x: 780, y: 900 },
  radius: 220,
});

/** 미니게임 초대 쿨다운 (ms). */
const MINI_GAME_INVITE_COOLDOWN_MS = 5 * 60_000;
/** 오브젝트 하이라이트 쿨다운 (ms). */
const INTERACTABLE_HIGHLIGHT_COOLDOWN_MS = 15_000;
/** NPC 인사 쿨다운 (ms). */
const NPC_GREET_COOLDOWN_MS = 90_000;
/** 동료 접근 토스트 쿨다운 (ms). */
const PEER_TOAST_COOLDOWN_MS = 120_000;
/** 동료 접근 감지 반경 (px). */
const PEER_NEAR_RADIUS = 150;

const PHASE_HOUR: Record<StudioVirtualSpaceEventDirectorInput["dayPhase"], number> = {
  dawn: 6,
  day: 12,
  dusk: 18,
  night: 22,
};

// ── 라벨 조회 ───────────────────────────────────────────────────────────────

const KIND_LABELS: Record<string, { readonly ko: string; readonly en: string }> = {
  chair: { ko: "의자", en: "Chair" },
  door: { ko: "문", en: "Door" },
  "meeting-door": { ko: "회의실 문", en: "Meeting room door" },
  bulletin: { ko: "게시판", en: "Bulletin board" },
  "bulletin-board": { ko: "공지 게시판", en: "Notice board" },
  "light-switch": { ko: "조명 스위치", en: "Light switch" },
  "coffee-machine": { ko: "커피 머신", en: "Coffee machine" },
  whiteboard: { ko: "화이트보드", en: "Whiteboard" },
  desk: { ko: "책상", en: "Desk" },
  cafeteria: { ko: "카페테리아", en: "Cafeteria" },
  youtube: { ko: "영상", en: "Video" },
  document: { ko: "문서", en: "Document" },
  storyboard: { ko: "스토리보드", en: "Storyboard" },
  reference: { ko: "레퍼런스", en: "Reference" },
};

const OFFICE_REGISTRY_BY_ID = new Map(
  STUDIO_OFFICE_OBJECT_REGISTRY.map((entry) => [entry.id, entry]),
);

/** 오브젝트 라벨: 입력에 실린 라벨 → 레지스트리 → kind 기반 폴백 순. */
function interactableLabel(
  id: string,
  kind: string,
  own?: { readonly labelKo?: string; readonly labelEn?: string },
): { readonly ko: string; readonly en: string } {
  if (own?.labelKo && own.labelEn) return { ko: own.labelKo, en: own.labelEn };
  const fromInteract = studioInteractableRegistryById(id);
  if (fromInteract) return { ko: fromInteract.labelKo, en: fromInteract.labelEn };
  const fromOffice = OFFICE_REGISTRY_BY_ID.get(id);
  if (fromOffice) return { ko: fromOffice.labelKo, en: fromOffice.labelEn };
  return KIND_LABELS[kind] ?? { ko: kind, en: kind };
}

function distance(a: StudioVirtualSpacePoint, b: StudioVirtualSpacePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ── 디렉터 ──────────────────────────────────────────────────────────────────

/**
 * 월드별 트리거 배치. 기본값은 기본 오피스 월드(1280×960) 좌표다.
 * 캠퍼스처럼 좌표계가 다른 월드는 그 월드의 로비 스폰·오락실 위치를 넘긴다.
 */
export interface StudioVirtualSpaceEventDirectorOptions {
  /** 환영 배너 트리거. null이면 환영 배너를 내지 않는다. */
  readonly welcome?: { readonly center: StudioVirtualSpacePoint; readonly radius: number } | null;
  readonly miniGameZones?: readonly StudioMiniGameTriggerZone[];
}

const NO_UI_EVENTS: readonly StudioVirtualSpaceEventUi[] = Object.freeze([]);

/**
 * 이벤트 디렉터를 생성한다.
 * update()는 상태를 갱신하고 UI 이벤트를 큐에 쌓으며,
 * consumeUiEvents()는 쌓인 이벤트를 꺼내 큐를 비운다. 큐가 비었으면 같은 빈 배열을 돌려준다(매 프레임 할당 없음).
 */
export function createStudioVirtualSpaceEventDirector(options: StudioVirtualSpaceEventDirectorOptions = {}): {
  update(input: StudioVirtualSpaceEventDirectorInput): void;
  consumeUiEvents(): readonly StudioVirtualSpaceEventUi[];
} {
  const queue: StudioVirtualSpaceEventUi[] = [];
  const welcomeTrigger = options.welcome === undefined ? WELCOME_TRIGGER : options.welcome;
  const miniGameZones = options.miniGameZones ?? STUDIO_MINI_GAME_TRIGGER_ZONES;

  let welcomed = false;
  const miniGameLastInvite = new Map<string, number>();
  const highlightLastFire = new Map<string, number>();
  const npcLastGreet = new Map<string, number>();
  const peerLastToast = new Map<string, number>();
  const nearbyPeers = new Set<string>();
  const nearbyNpcs = new Set<string>();
  const seenTownEvents = new Set<string>();
  const seenAmbientBuckets = new Set<number>();
  let lastPhase: StudioVirtualSpaceEventDirectorInput["dayPhase"] | null = null;

  const emit = (event: StudioVirtualSpaceEventUi): void => {
    queue.push(event);
  };

  const update = (input: StudioVirtualSpaceEventDirectorInput): void => {
    const { now, self } = input;

    // 1) 환영 배너 (once)
    if (!welcomed && welcomeTrigger && distance(self.position, welcomeTrigger.center) <= welcomeTrigger.radius) {
      welcomed = true;
      emit({
        id: "welcome",
        role: "banner",
        textKo: "툰스튜디오 가상 오피스에 오신 걸 환영해요! 🎉",
        textEn: "Welcome to the ToonStudio virtual office! 🎉",
        at: now,
      });
    }

    // 2) 미니게임 존 트리거 → 초대 토스트
    for (const zone of miniGameZones) {
      if (distance(self.position, zone.center) > zone.radius) continue;
      const last = miniGameLastInvite.get(zone.id) ?? Number.NEGATIVE_INFINITY;
      if (now - last < MINI_GAME_INVITE_COOLDOWN_MS) continue;
      miniGameLastInvite.set(zone.id, now);
      const game = STUDIO_TOWN_MINI_GAMES.find((entry) => entry.id === zone.id);
      const invite = game ? studioMiniGameInviteText(game) : null;
      emit({
        id: `minigame:${zone.id}:${Math.floor(now / MINI_GAME_INVITE_COOLDOWN_MS)}`,
        role: "toast",
        textKo: invite?.ko ?? "미니게임을 시작할까요? 🎮",
        textEn: invite?.en ?? "Want to play a mini-game? 🎮",
        targetId: zone.id,
        at: now,
      });
    }

    // 3) 인터랙터블 근접 → 하이라이트 (진입 감지, 15초 쿨다운)
    for (const object of input.interactables) {
      const inside = distance(self.position, object.position) <= object.radius;
      const wasTracked = highlightLastFire.has(`inside:${object.id}`);
      if (inside && !wasTracked) {
        const last = highlightLastFire.get(object.id) ?? Number.NEGATIVE_INFINITY;
        if (now - last >= INTERACTABLE_HIGHLIGHT_COOLDOWN_MS) {
          highlightLastFire.set(object.id, now);
          const label = interactableLabel(object.id, object.kind, object);
          emit({
            id: `highlight:${object.id}:${now}`,
            role: "highlight",
            textKo: `[X] ${label.ko}`,
            textEn: `[X] ${label.en}`,
            targetId: object.id,
            at: now,
          });
        }
      }
      if (inside) highlightLastFire.set(`inside:${object.id}`, now);
      else highlightLastFire.delete(`inside:${object.id}`);
    }

    // 4) NPC 근접 → 다이얼로그 (인사 반경, 90초 쿨다운)
    const hour = PHASE_HOUR[input.dayPhase];
    for (const npc of input.npcs) {
      const inside = distance(self.position, npc.position) <= STUDIO_NPC_GREET_RADIUS;
      const wasNear = nearbyNpcs.has(npc.id);
      if (inside && !wasNear) {
        const last = npcLastGreet.get(npc.id) ?? Number.NEGATIVE_INFINITY;
        if (now - last >= NPC_GREET_COOLDOWN_MS) {
          npcLastGreet.set(npc.id, now);
          const line = studioNpcDialogueFor({ roomKind: null, hour, weather: null, seed: npc.id.length });
          emit({
            id: `dialogue:${npc.id}:${now}`,
            role: "dialogue",
            textKo: `${npc.name}: ${line.ko}`,
            textEn: `${npc.name}: ${line.en}`,
            targetId: npc.id,
            at: now,
          });
        }
      }
      if (inside) nearbyNpcs.add(npc.id);
      else nearbyNpcs.delete(npc.id);
    }

    // 5) 동료 근접 → 토스트 (신규 진입, 120초 쿨다운)
    for (const peer of input.peers) {
      if (peer.id === self.id) continue;
      const inside = distance(self.position, peer.position) <= PEER_NEAR_RADIUS;
      const wasNear = nearbyPeers.has(peer.id);
      if (inside && !wasNear) {
        const last = peerLastToast.get(peer.id) ?? Number.NEGATIVE_INFINITY;
        if (now - last >= PEER_TOAST_COOLDOWN_MS) {
          peerLastToast.set(peer.id, now);
          emit({
            id: `peer:${peer.id}:${now}`,
            role: "toast",
            textKo: `${peer.name}님이 근처에 있어요 👋`,
            textEn: `${peer.name} is nearby 👋`,
            targetId: peer.id,
            at: now,
          });
        }
      }
      if (inside) nearbyPeers.add(peer.id);
      else nearbyPeers.delete(peer.id);
    }

    // 6) 타운 이벤트 진행/임박 → 배너/토스트 (이벤트당 1회)
    const townBanner = studioAmbientUpcomingEventBanner(now);
    if (townBanner && !seenTownEvents.has(townBanner.event.id)) {
      seenTownEvents.add(townBanner.event.id);
      emit({
        id: `town:${townBanner.event.id}`,
        role: townBanner.kind,
        textKo: townBanner.textKo,
        textEn: townBanner.textEn,
        targetId: townBanner.event.id,
        at: now,
      });
    }

    // 7) 앰비언트 해프닝 → 토스트 (버킷당 1회)
    const bucket = Math.floor(now / STUDIO_AMBIENT_EVENT_BUCKET_MS);
    if (!seenAmbientBuckets.has(bucket)) {
      seenAmbientBuckets.add(bucket);
      const happening = studioAmbientHappeningsForBucket(now);
      if (happening) {
        emit({
          id: `ambient:${bucket}`,
          role: "toast",
          textKo: happening.textKo,
          textEn: happening.textEn,
          at: now,
        });
      }
    }

    // 8) 시간대 변경 → 토스트
    if (lastPhase !== null && lastPhase !== input.dayPhase) {
      const note = studioAmbientPhaseNote(input.dayPhase);
      emit({
        id: `phase:${input.dayPhase}:${now}`,
        role: "toast",
        textKo: note.ko,
        textEn: note.en,
        at: now,
      });
    }
    lastPhase = input.dayPhase;
  };

  const consumeUiEvents = (): readonly StudioVirtualSpaceEventUi[] => {
    if (queue.length === 0) return NO_UI_EVENTS;
    const events = Object.freeze(queue.slice());
    queue.length = 0;
    return events;
  };

  return { update, consumeUiEvents };
}

/** 레지스트리에 등록된 X키 오브젝트 목록 (B 트랙 공급용). */
export const STUDIO_EVENT_DIRECTOR_INTERACTABLES: readonly {
  readonly id: string;
  readonly kind: string;
  readonly position: StudioVirtualSpacePoint;
  readonly radius: number;
}[] = STUDIO_INTERACTABLE_OBJECT_REGISTRY;
