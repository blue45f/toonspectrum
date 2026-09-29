import type { StudioVirtualOperationsSnapshot } from "./use-studio-virtual-space-operations";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualRewardId } from "./studio-virtual-space-rewards";
import type { StudioVirtualDecorationState, StudioVirtualDecorType } from "./studio-virtual-space-customization";
import { placeStudioVirtualDecorationGroup, type StudioDecorationLayoutResult } from "./studio-virtual-space-decoration-layout";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { studioSemanticWorldInterestKey } from "./studio-virtual-space-semantic-world";

export type StudioTownQuestKind = "onboarding" | "production" | "review" | "social" | "exploration" | "customization";
export interface StudioTownQuest {
  readonly id: string;
  readonly kind: StudioTownQuestKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly roomId: string;
  readonly progress: number;
  readonly target: number;
  readonly reward: string;
  readonly rewardId: StudioVirtualRewardId;
}

export type StudioTownEventKind = "standup" | "review-hour" | "live-drawing" | "gallery-opening" | "release-ceremony";
export interface StudioTownEvent {
  readonly id: string;
  readonly kind: StudioTownEventKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly roomId: string;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly spotlight: boolean;
}

export type StudioTownMiniGameId = "panel-order" | "palette-match" | "pose-guess" | "hidden-assets" | "perspective-grid" | "deadline-relay";
export interface StudioTownMiniGame {
  readonly id: StudioTownMiniGameId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly roomId: string;
  readonly durationSeconds: number;
  readonly players: readonly [number, number];
  readonly reward: string;
  readonly rewardId: StudioVirtualRewardId;
}

export interface StudioTownBlueprint {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly roomId: string;
  readonly decor: readonly { readonly type: StudioVirtualDecorType; readonly offsetX: number; readonly offsetY: number; readonly scale?: number }[];
}

export interface StudioTownDeskPod {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly roomId: string;
  readonly point: StudioVirtualSpacePoint;
  readonly roles: readonly string[];
}

export const STUDIO_TOWN_MINI_GAMES: readonly StudioTownMiniGame[] = Object.freeze([
  { id: "panel-order", labelKo: "컷 순서 재구성", labelEn: "Panel order", descriptionKo: "흩어진 컷을 이야기 흐름에 맞게 정렬해요.", descriptionEn: "Reorder shuffled panels into a coherent scene.", roomId: "storyboard", durationSeconds: 75, players: [1, 6], reward: "Storyboard badge", rewardId: "storyboard-badge" },
  { id: "palette-match", labelKo: "팔레트 매칭", labelEn: "Palette match", descriptionKo: "레퍼런스 장면과 가장 가까운 색 조합을 찾아요.", descriptionEn: "Match the closest palette to the reference scene.", roomId: "drawing", durationSeconds: 60, players: [1, 8], reward: "Color swatch", rewardId: "color-swatch" },
  { id: "pose-guess", labelKo: "포즈 맞히기", labelEn: "Pose guess", descriptionKo: "짧게 표시되는 실루엣의 감정을 맞혀요.", descriptionEn: "Guess the emotion from a brief silhouette.", roomId: "live", durationSeconds: 45, players: [2, 12], reward: "Expression emote", rewardId: "expression-emote" },
  { id: "hidden-assets", labelKo: "숨은 소재 찾기", labelEn: "Hidden assets", descriptionKo: "아카이브에 숨은 제작 소재를 찾아요.", descriptionEn: "Find hidden production assets in the archive.", roomId: "assets", durationSeconds: 90, players: [1, 8], reward: "Archivist pin", rewardId: "archivist-pin" },
  { id: "perspective-grid", labelKo: "원근 그리드", labelEn: "Perspective grid", descriptionKo: "건물과 소품을 올바른 소실점에 배치해요.", descriptionEn: "Place props against the correct vanishing points.", roomId: "drawing", durationSeconds: 90, players: [1, 4], reward: "Architect frame", rewardId: "architect-frame" },
  { id: "deadline-relay", labelKo: "마감 릴레이", labelEn: "Deadline relay", descriptionKo: "팀이 역할을 나눠 제작 체크포인트를 통과해요.", descriptionEn: "Pass production checkpoints as a coordinated team.", roomId: "production", durationSeconds: 180, players: [2, 12], reward: "Team banner", rewardId: "team-banner" },
]);

export const STUDIO_TOWN_BLUEPRINTS: readonly StudioTownBlueprint[] = Object.freeze([
  { id: "meeting-four", labelKo: "4인 회의실", labelEn: "Four-person meeting", roomId: "meeting", decor: [
    { type: "rug", offsetX: 0, offsetY: 8, scale: .9 }, { type: "sofa", offsetX: -60, offsetY: 0, scale: .78 },
    { type: "bench", offsetX: 42, offsetY: 0, scale: .78 }, { type: "lamp", offsetX: 0, offsetY: -44, scale: .8 },
  ] },
  { id: "review-theater", labelKo: "리뷰 극장", labelEn: "Review theater", roomId: "review", decor: [
    { type: "review-board", offsetX: 0, offsetY: -60, scale: .9 }, { type: "bench", offsetX: -48, offsetY: 16 },
    { type: "bench", offsetX: 48, offsetY: 16 }, { type: "banner", offsetX: 0, offsetY: 54, scale: .82 },
  ] },
  { id: "drawing-pod", labelKo: "작화 데스크 팟", labelEn: "Drawing desk pod", roomId: "drawing", decor: [
    { type: "drawing-desk", offsetX: 0, offsetY: 0 }, { type: "bookshelf", offsetX: -64, offsetY: -30, scale: .75 },
    { type: "lamp", offsetX: 48, offsetY: -30, scale: .75 }, { type: "pet", offsetX: 48, offsetY: 34, scale: .7 },
  ] },
  { id: "gallery-booth", labelKo: "전시 부스", labelEn: "Gallery booth", roomId: "live", decor: [
    { type: "banner", offsetX: 0, offsetY: -42 }, { type: "flower-bed", offsetX: -45, offsetY: 24, scale: .8 },
    { type: "flower-bed", offsetX: 45, offsetY: 24, scale: .8 }, { type: "sign", offsetX: 0, offsetY: 42, scale: .8 },
  ] },
  { id: "event-stage", labelKo: "이벤트 무대", labelEn: "Event stage", roomId: "live", decor: [
    { type: "rug", offsetX: 0, offsetY: 0, scale: 1.15 }, { type: "banner", offsetX: -58, offsetY: -28 },
    { type: "banner", offsetX: 58, offsetY: -28 }, { type: "lamp", offsetX: -70, offsetY: 32 }, { type: "lamp", offsetX: 70, offsetY: 32 },
  ] },
]);

export const STUDIO_TOWN_DESK_PODS: readonly StudioTownDeskPod[] = Object.freeze([
  { id: "story-crew", labelKo: "스토리 크루", labelEn: "Story crew", roomId: "writers", point: { x: 180, y: 430 }, roles: ["writer", "editor", "producer"] },
  { id: "art-crew", labelKo: "아트 크루", labelEn: "Art crew", roomId: "drawing", point: { x: 500, y: 430 }, roles: ["artist", "background", "color"] },
  { id: "review-crew", labelKo: "검수 크루", labelEn: "Review crew", roomId: "review", point: { x: 820, y: 430 }, roles: ["editor", "reviewer", "producer"] },
  { id: "release-crew", labelKo: "출고 크루", labelEn: "Release crew", roomId: "release", point: { x: 1130, y: 195 }, roles: ["producer", "qc", "publisher"] },
]);

export function studioTownDeskPodForActor(actorId: string, role?: string | null): StudioTownDeskPod {
  const normalizedRole = role?.trim().toLowerCase() ?? "";
  const roleMatches = normalizedRole
    ? STUDIO_TOWN_DESK_PODS.filter((pod) => pod.roles.includes(normalizedRole))
    : [];
  const candidates = roleMatches.length ? roleMatches : STUDIO_TOWN_DESK_PODS;
  let hash = 2166136261;
  for (const char of actorId.normalize("NFC")) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return candidates[hash % candidates.length] ?? STUDIO_TOWN_DESK_PODS[0]!;
}

function roomExists(manifest: Pick<StudioVirtualSpaceWorldManifest, "rooms">, id: string): boolean {
  return manifest.rooms.some((room) => room.id === id);
}

export function studioTownQuests(
  operations: StudioVirtualOperationsSnapshot,
  manifest: Pick<StudioVirtualSpaceWorldManifest, "rooms">,
  customizationCount = 0,
): readonly StudioTownQuest[] {
  const reviewCount = operations.inbox.filter((item) => /review|검수/iu.test(`${item.status} ${item.taskTitle}`)).length;
  const dueCount = operations.inbox.filter((item) => /due|today|마감/iu.test(`${item.status} ${item.taskTitle}`)).length;
  const meetingCount = operations.calendar.length;
  const quests: StudioTownQuest[] = [
    { id: "welcome-route", kind: "onboarding", labelKo: "오늘의 동선 확인", labelEn: "Check today's route", descriptionKo: "로비의 Today Board에서 다음 작업을 확인해요.", descriptionEn: "Check your next action on the Lobby Today Board.", roomId: "lobby", progress: operations.phase === "ready" ? 1 : 0, target: 1, reward: "Navigator badge", rewardId: "navigator-badge" },
    { id: "review-round", kind: "review", labelKo: "검수 라운드", labelEn: "Review round", descriptionKo: "대기 중인 검수본을 Review Theater에서 확인해요.", descriptionEn: "Inspect pending review snapshots in the Review Theater.", roomId: "review", progress: reviewCount ? 0 : 1, target: 1, reward: "Review sparkle", rewardId: "review-sparkle" },
    { id: "deadline-control", kind: "production", labelKo: "마감 점검", labelEn: "Deadline check", descriptionKo: "Production Control에서 마감과 병목을 확인해요.", descriptionEn: "Check deadlines and bottlenecks in Production Control.", roomId: "production", progress: dueCount ? 0 : 1, target: 1, reward: "Producer title", rewardId: "producer-title" },
    { id: "meeting-ready", kind: "social", labelKo: "회의 준비", labelEn: "Prepare a meeting", descriptionKo: "예정된 회의의 공간과 참가자를 확인해요.", descriptionEn: "Confirm the room and participants for an upcoming meeting.", roomId: "meeting", progress: meetingCount ? 0 : 1, target: 1, reward: "Team emote", rewardId: "team-emote" },
    { id: "district-tour", kind: "exploration", labelKo: "마을 지구 탐방", labelEn: "Explore the districts", descriptionKo: "서로 다른 제작 지구 세 곳을 방문해요.", descriptionEn: "Visit three distinct production districts.", roomId: "live", progress: 0, target: 3, reward: "Explorer frame", rewardId: "explorer-frame" },
    { id: "decorate-home", kind: "customization", labelKo: "내 공간 꾸미기", labelEn: "Customize your space", descriptionKo: "안전한 내장 오브젝트를 세 개 배치해요.", descriptionEn: "Place three safe bundled objects.", roomId: "lounge", progress: Math.min(3, customizationCount), target: 3, reward: "Decorator pin", rewardId: "decorator-pin" },
  ];
  return Object.freeze(quests.filter((quest) => roomExists(manifest, quest.roomId)));
}

const STUDIO_TOWN_TIME_ZONE_OFFSET_MS = 9 * 60 * 60 * 1000;

function studioTownLocalDate(now: number): Date {
  return new Date(now + STUDIO_TOWN_TIME_ZONE_OFFSET_MS);
}

function todayAt(now: number, hour: number, minute = 0): number {
  const local = studioTownLocalDate(now);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, minute)
    - STUDIO_TOWN_TIME_ZONE_OFFSET_MS;
}

function studioTownDateKey(epochMs: number): string {
  return studioTownLocalDate(epochMs).toISOString().slice(0, 10);
}

export function studioTownEvents(now = Date.now()): readonly StudioTownEvent[] {
  const definitions = [
    ["standup", "데일리 스탠드업", "Daily stand-up", "teams", 10, 0, 25, false],
    ["review-hour", "공동 검수 시간", "Review hour", "review", 14, 0, 50, false],
    ["live-drawing", "라이브 드로잉", "Live drawing", "live", 16, 0, 60, true],
    ["gallery-opening", "갤러리 오프닝", "Gallery opening", "live", 17, 30, 45, true],
    ["release-ceremony", "출고 세리머니", "Release ceremony", "release", 18, 30, 35, true],
  ] as const;
  return Object.freeze(definitions.map(([kind, labelKo, labelEn, roomId, hour, minute, duration, spotlight]) => {
    let startsAt = todayAt(now, hour, minute);
    if (startsAt + duration * 60_000 < now - 30 * 60_000) startsAt += 24 * 60 * 60_000;
    return Object.freeze({ id: `${kind}:${studioTownDateKey(startsAt)}`, kind, labelKo, labelEn, roomId, startsAt, endsAt: startsAt + duration * 60_000, spotlight });
  }));
}

export function studioTownActiveEvent(now = Date.now()): StudioTownEvent | null {
  return studioTownEvents(now).find((event) => now >= event.startsAt && now <= event.endsAt) ?? null;
}

// ── Spotlight broadcast session ─────────────────────────────────────────────
// 주간 회의·신작 발표회용 발표자 우선 방송 모드의 로컬 상태 머신이다.
// 순수 함수만 두며 DOM·미디어 파이프라인에는 닿지 않는다.
// 실제 P2P 송출 우선 적용은 studio-p2p-huddle-controller의 후속 작업에서
// studioSpotlightSendPriority() 값을 소비하는 방식으로 연결한다.

export interface StudioSpotlightAudienceMember {
  readonly id: string;
  readonly displayNameKo: string;
  readonly displayNameEn: string;
}

export interface StudioSpotlightHandRaise {
  readonly memberId: string;
  readonly raisedAt: number;
}

/** 낮을수록 송출 우선순위가 높다. 0: 발표자, 1: 지목된 발언자, 2: 청중. */
export type StudioSpotlightSendPriority = 0 | 1 | 2;

export interface StudioSpotlightSession {
  readonly eventId: string;
  readonly presenterId: string;
  readonly startedAt: number;
  readonly audience: readonly StudioSpotlightAudienceMember[];
  readonly mutedBySpotlight: readonly string[];
  readonly handQueue: readonly StudioSpotlightHandRaise[];
  readonly activeSpeakerId: string | null;
  readonly fullscreenShare: boolean;
}

export interface StudioSpotlightAudienceView {
  readonly member: StudioSpotlightAudienceMember;
  readonly isPresenter: boolean;
  readonly muted: boolean;
  readonly handPosition: number | null;
  readonly isActiveSpeaker: boolean;
  readonly sendPriority: StudioSpotlightSendPriority;
}

/** 방송 시작: 청중 전원을 스포트라이트 자동 음소거 대상으로 등록한다. */
export function createStudioSpotlightSession(
  eventId: string,
  presenterId: string,
  audience: readonly StudioSpotlightAudienceMember[],
  now = Date.now(),
): StudioSpotlightSession {
  return Object.freeze({
    eventId,
    presenterId,
    startedAt: now,
    audience: Object.freeze([...audience]),
    mutedBySpotlight: Object.freeze(audience.map((member) => member.id)),
    handQueue: Object.freeze([] as StudioSpotlightHandRaise[]),
    activeSpeakerId: null,
    fullscreenShare: false,
  });
}

/** 발표자 재지정. 새 발표자가 손들기 큐·발언자였다면 해당 상태에서 제외한다. */
export function studioSpotlightSetPresenter(session: StudioSpotlightSession, presenterId: string): StudioSpotlightSession {
  if (session.presenterId === presenterId) return session;
  return Object.freeze({
    ...session,
    presenterId,
    handQueue: Object.freeze(session.handQueue.filter((raise) => raise.memberId !== presenterId)),
    activeSpeakerId: session.activeSpeakerId === presenterId ? null : session.activeSpeakerId,
  });
}

/** 손들기: FIFO 큐에 추가. 중복·발표자·발언 중·알 수 없는 참가자는 무시한다. */
export function studioSpotlightRaiseHand(
  session: StudioSpotlightSession,
  memberId: string,
  now = Date.now(),
): StudioSpotlightSession {
  if (memberId === session.presenterId) return session;
  if (session.activeSpeakerId === memberId) return session;
  if (!session.audience.some((member) => member.id === memberId)) return session;
  if (session.handQueue.some((raise) => raise.memberId === memberId)) return session;
  return Object.freeze({
    ...session,
    handQueue: Object.freeze([...session.handQueue, Object.freeze({ memberId, raisedAt: now })]),
  });
}

/** 손 내리기: 큐에서만 제거한다. */
export function studioSpotlightLowerHand(session: StudioSpotlightSession, memberId: string): StudioSpotlightSession {
  if (!session.handQueue.some((raise) => raise.memberId === memberId)) return session;
  return Object.freeze({
    ...session,
    handQueue: Object.freeze(session.handQueue.filter((raise) => raise.memberId !== memberId)),
  });
}

/**
 * 지목: 손든 청중을 발언자로 지정한다. 큐에서 빠지고 음소거가 해제된다.
 * 한 번에 한 명만 발언할 수 있어 이전 발언자는 다시 자동 음소거된다.
 */
export function studioSpotlightNominateSpeaker(session: StudioSpotlightSession, memberId: string): StudioSpotlightSession {
  if (!session.handQueue.some((raise) => raise.memberId === memberId)) return session;
  return Object.freeze({
    ...session,
    handQueue: Object.freeze(session.handQueue.filter((raise) => raise.memberId !== memberId)),
    activeSpeakerId: memberId,
  });
}

/** 발언 종료: 발언자를 다시 자동 음소거 상태로 되돌린다. */
export function studioSpotlightReleaseSpeaker(session: StudioSpotlightSession): StudioSpotlightSession {
  if (session.activeSpeakerId === null) return session;
  return Object.freeze({ ...session, activeSpeakerId: null });
}

/** 청중 음소거 규칙: 발표자와 지목된 발언자를 제외한 자동 음소거 대상은 음소거. */
export function studioSpotlightIsMuted(session: StudioSpotlightSession, memberId: string): boolean {
  if (memberId === session.presenterId) return false;
  if (memberId === session.activeSpeakerId) return false;
  return session.mutedBySpotlight.includes(memberId);
}

/** 송출 우선순위: 발표자 0 > 지목된 발언자 1 > 청중 2. */
export function studioSpotlightSendPriority(session: StudioSpotlightSession, memberId: string): StudioSpotlightSendPriority {
  if (memberId === session.presenterId) return 0;
  if (memberId === session.activeSpeakerId) return 1;
  return 2;
}

/** 발표자 화면 공유 전체화면 보기 의도 토글. 실제 전체화면 진입은 UI 레이어에서 처리한다. */
export function studioSpotlightSetFullscreenShare(session: StudioSpotlightSession, enabled: boolean): StudioSpotlightSession {
  if (session.fullscreenShare === enabled) return session;
  return Object.freeze({ ...session, fullscreenShare: enabled });
}

/** UI 렌더링용 파생 뷰: 구성원별 발표자/음소거/손들기 순서/우선순위. */
export function studioSpotlightAudienceViews(session: StudioSpotlightSession): readonly StudioSpotlightAudienceView[] {
  return Object.freeze(session.audience.map((member) => {
    const queueIndex = session.handQueue.findIndex((raise) => raise.memberId === member.id);
    return Object.freeze({
      member,
      isPresenter: member.id === session.presenterId,
      muted: studioSpotlightIsMuted(session, member.id),
      handPosition: queueIndex === -1 ? null : queueIndex + 1,
      isActiveSpeaker: member.id === session.activeSpeakerId,
      sendPriority: studioSpotlightSendPriority(session, member.id),
    });
  }));
}

export interface StudioTownCompanionSnapshot {
  readonly dueToday: number;
  readonly reviews: number;
  readonly meetings: number;
  readonly nextEvent: StudioTownEvent | null;
  readonly suggestedRoomId: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export function studioTownCompanionSnapshot(
  operations: StudioVirtualOperationsSnapshot,
  now = Date.now(),
): StudioTownCompanionSnapshot {
  const dueToday = operations.inbox.filter((item) => item.bucket === "dueToday").length;
  const reviews = operations.inbox.filter((item) => item.bucket === "review").length;
  const meetings = operations.calendar.length;
  const nextEvent = [...studioTownEvents(now)].sort((left, right) => left.startsAt - right.startsAt)[0] ?? null;
  const suggestedRoomId = reviews ? "review" : dueToday ? "production" : meetings ? "meeting" : "live";
  return Object.freeze({
    dueToday, reviews, meetings, nextEvent, suggestedRoomId,
    summaryKo: `오늘 마감 ${dueToday}건 · 검수 ${reviews}건 · 일정 ${meetings}건`,
    summaryEn: `${dueToday} due today · ${reviews} reviews · ${meetings} scheduled`,
  });
}

export interface StudioInterestEntity {
  readonly id: string;
  readonly point: StudioVirtualSpacePoint;
  readonly kind: "peer" | "npc" | "effect" | "object";
  readonly important?: boolean;
}

export interface StudioInterestSnapshot {
  readonly activeIds: ReadonlySet<string>;
  readonly dormantIds: ReadonlySet<string>;
  readonly key: string;
}

export function studioTownInterestSnapshot(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "id" | "backgroundAssetKey" | "width" | "height" | "rooms">,
  focus: StudioVirtualSpacePoint,
  entities: readonly StudioInterestEntity[],
  radius = 520,
): StudioInterestSnapshot {
  const key = studioSemanticWorldInterestKey(manifest, focus);
  const active = new Set<string>();
  const dormant = new Set<string>();
  for (const entity of entities) {
    const sameChunk = studioSemanticWorldInterestKey(manifest, entity.point) === key;
    const visible = entity.important || sameChunk || Math.hypot(entity.point.x - focus.x, entity.point.y - focus.y) <= radius;
    (visible ? active : dormant).add(entity.id);
  }
  return Object.freeze({ activeIds: active, dormantIds: dormant, key });
}

export interface StudioRuntimeBudget {
  readonly maxActiveNpcs: number;
  readonly maxParticles: number;
  readonly maxAnimatedDecorations: number;
  readonly updateHz: number;
}

export function studioRuntimeBudget(viewportWidth: number, reducedMotion: boolean, peerCount: number): StudioRuntimeBudget {
  const mobile = viewportWidth < 720;
  const crowded = peerCount >= 16;
  return Object.freeze({
    maxActiveNpcs: reducedMotion ? 2 : mobile ? 4 : crowded ? 5 : 8,
    maxParticles: reducedMotion ? 0 : mobile ? 28 : crowded ? 48 : 96,
    maxAnimatedDecorations: reducedMotion ? 0 : mobile ? 12 : 32,
    updateHz: reducedMotion ? 15 : mobile || crowded ? 30 : 60,
  });
}

export function applyStudioTownBlueprint(
  state: StudioVirtualDecorationState,
  manifest: StudioVirtualSpaceWorldManifest,
  blueprint: StudioTownBlueprint,
  selfPoint?: StudioVirtualSpacePoint,
): StudioDecorationLayoutResult {
  const room = manifest.rooms.find((candidate) => candidate.id === blueprint.roomId)
    ?? (manifest.rooms.length === 1 ? manifest.rooms[0] : undefined);
  if (!room) return { ok: false, reason: "invalid" };
  const center = { x: room.x + room.width / 2, y: room.y + room.height / 2 };
  return placeStudioVirtualDecorationGroup(state, blueprint.decor.map((item) => ({
    type: item.type,
    x: Math.round(center.x + item.offsetX),
    y: Math.round(center.y + item.offsetY),
    rotation: 0 as const,
    scale: item.scale ?? 1,
  })), manifest, selfPoint);
}

export type StudioTownSeason = "spring" | "summer" | "autumn" | "winter";
export interface StudioTownSeasonPresentation {
  readonly season: StudioTownSeason;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly foliageTint: number;
  readonly weatherTint: number;
  readonly ambience: string;
}

export function studioTownSeasonAt(now = Date.now()): StudioTownSeasonPresentation {
  const month = studioTownLocalDate(now).getUTCMonth() + 1;
  if (month >= 3 && month <= 5) return Object.freeze({ season: "spring", labelKo: "벚꽃 창작제", labelEn: "Cherry creator festival", foliageTint: 0xffc3dc, weatherTint: 0xffd9e9, ambience: "petals" });
  if (month >= 6 && month <= 8) return Object.freeze({ season: "summer", labelKo: "해변 작업 캠프", labelEn: "Beach work camp", foliageTint: 0x78d382, weatherTint: 0xb7efff, ambience: "breeze" });
  if (month >= 9 && month <= 11) return Object.freeze({ season: "autumn", labelKo: "스토리 공모제", labelEn: "Story festival", foliageTint: 0xe99555, weatherTint: 0xffd2a2, ambience: "leaves" });
  return Object.freeze({ season: "winter", labelKo: "겨울 빛 축제", labelEn: "Winter light festival", foliageTint: 0xcfe8ff, weatherTint: 0xe9f5ff, ambience: "snow" });
}
