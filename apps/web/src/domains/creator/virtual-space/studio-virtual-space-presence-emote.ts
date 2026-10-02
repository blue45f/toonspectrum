/**
 * 프레즌스 이모트(main Track A의 StudioEmoteKind)를 우리 이모트 런타임에 합친다.
 *
 * main 클라이언트는 프레즌스 state.emote로 춤·수면 같은 지속 이모트를 보낸다. 우리 캔버스는 리액션(StudioSpaceEmoteId)을
 * StudioEmoteRuntime으로 재생하므로, 같은 뜻의 리액션으로 바꿔 머리 위 말풍선·몸동작을 재생하고 렌더 힌트(bobOffset·파티클)를 더한다.
 * - 팔 포즈(armPose)는 프레임 시트 방식과 맞지 않아 쓰지 않는다(main 캔버스와 같다).
 * - 파티클 색은 이모트별 픽셀 아트 색이다(UI 색이 아니므로 CSS 토큰을 쓰지 않는다).
 */
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import {
  studioEmoteDefinition,
  studioEmoteRenderHint,
  type StudioEmoteKind,
  type StudioEmoteParticle,
} from "./studio-virtual-space-emotes";

const PRESENCE_REACTIONS: Readonly<Record<StudioEmoteKind, StudioSpaceEmoteId | null>> = Object.freeze({
  wave: "wave",
  dance: "dance",
  clap: "clap",
  cheer: "party",
  laugh: "laugh",
  bow: "wave",
  think: "think",
  // 앉기는 몸 자세(sit)로만 보여 주고 말풍선을 띄우지 않는다.
  sit: null,
  sleep: "sleep",
  celebrate: "party",
});

/** 프레즌스 이모트 → 머리 위에서 재생할 리액션. 모르는 값이나 앉기는 null. */
export function studioPresenceEmoteReaction(kind: string | null | undefined): StudioSpaceEmoteId | null {
  if (!kind) return null;
  return studioEmoteDefinition(kind as StudioEmoteKind) ? PRESENCE_REACTIONS[kind as StudioEmoteKind] : null;
}

/** 지속 이모트 동안 몸을 띄우거나 낮추는 y 오프셋(px, 음수 = 위). 모르는 값은 0. */
export function studioPresenceEmoteBob(kind: string | null | undefined): number {
  if (!kind || !studioEmoteDefinition(kind as StudioEmoteKind)) return 0;
  return studioEmoteRenderHint(kind as StudioEmoteKind).bobOffset ?? 0;
}

/** 이모트 시작 때 머리 위로 터뜨리는 파티클 색. */
export const STUDIO_EMOTE_PRESENCE_PARTICLE_COLORS: Readonly<Record<StudioEmoteParticle, number>> = Object.freeze({
  confetti: 0xf472b6,
  music: 0x93c5fd,
  zzz: 0xc4b5fd,
  sweat: 0x7dd3fc,
  sparkle: 0xfde68a,
  hearts: 0xf9a8d4,
});

/** 시작 파티클 색. 파티클이 없는 이모트면 null. */
export function studioPresenceEmoteParticleColor(kind: string | null | undefined): number | null {
  if (!kind || !studioEmoteDefinition(kind as StudioEmoteKind)) return null;
  const particle = studioEmoteRenderHint(kind as StudioEmoteKind).particle;
  return particle ? STUDIO_EMOTE_PRESENCE_PARTICLE_COLORS[particle] : null;
}

/** 지속 이모트의 진행형 라벨 ("춤추는 중"). 이름표 인디케이터용. */
const EMOTE_INDICATOR_LABELS: Readonly<Record<StudioEmoteKind, readonly [string, string]>> = Object.freeze({
  wave: ["손 흔드는 중", "Waving"],
  dance: ["춤추는 중", "Dancing"],
  clap: ["박수 치는 중", "Clapping"],
  cheer: ["환호하는 중", "Cheering"],
  laugh: ["웃는 중", "Laughing"],
  bow: ["인사하는 중", "Bowing"],
  think: ["생각 중", "Thinking"],
  sit: ["앉아 있음", "Sitting"],
  sleep: ["자는 중", "Sleeping"],
  celebrate: ["축하하는 중", "Celebrating"],
});

/**
 * 프레즌스 이모트 → 이름표 인디케이터. 다른 플레이어가 "지금 뭘 하는 중인지" 읽는 용도.
 * 제스처 글리프는 이모트 정의를 재사용하고, 모르는 값이면 null.
 */
export function studioPresenceEmoteIndicator(
  kind: string | null | undefined,
): { readonly glyph: string; readonly labelKo: string; readonly labelEn: string } | null {
  if (!kind) return null;
  const definition = studioEmoteDefinition(kind as StudioEmoteKind);
  if (!definition) return null;
  const [labelKo, labelEn] = EMOTE_INDICATOR_LABELS[definition.kind];
  return { glyph: definition.icon, labelKo, labelEn };
}
