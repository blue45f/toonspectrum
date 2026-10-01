/**
 * 펫 동반 시스템 (Track 4 · 펫 동반)
 *
 * 입양 가능한 펫 3종(고양이·강아지·여우). 펫은 주인을 따라다니는
 * follow AI로 움직이며, 주인이 가만히 있으면 앉았다가 잠든다.
 * 주인이 빨리 달리면 신나서 주변을 맴돈다(play).
 *
 * 순수 로직 모듈. 렌더링·스프라이트는
 * `studio-virtual-space-animal-sprites.ts`가 담당한다.
 */

import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/** 입양 가능한 펫 종류. */
export type StudioPetSpecies = "cat" | "dog" | "fox";

export interface StudioPetSpeciesMeta {
  readonly species: StudioPetSpecies;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /** 성격 한 줄. */
  readonly traitKo: string;
  readonly traitEn: string;
}

function meta(def: StudioPetSpeciesMeta): StudioPetSpeciesMeta {
  return Object.freeze(def);
}

/** 펫 3종 메타. */
export const STUDIO_PET_SPECIES_META: readonly StudioPetSpeciesMeta[] = Object.freeze([
  meta({ species: "cat", labelKo: "고양이", labelEn: "Cat",
    descriptionKo: "새침하지만 주인을 잘 따르는 고양이예요.", descriptionEn: "A proud but loyal cat.",
    traitKo: "도도함", traitEn: "Proud" }),
  meta({ species: "dog", labelKo: "강아지", labelEn: "Dog",
    descriptionKo: "언제나 신나게 뛰어다니는 강아지예요.", descriptionEn: "An always excited puppy.",
    traitKo: "활발함", traitEn: "Playful" }),
  meta({ species: "fox", labelKo: "여우", labelEn: "Fox",
    descriptionKo: "호기심 많은 숲속 여우예요.", descriptionEn: "A curious forest fox.",
    traitKo: "호기심", traitEn: "Curious" }),
]);

const META_BY_SPECIES = new Map<StudioPetSpecies, StudioPetSpeciesMeta>(
  STUDIO_PET_SPECIES_META.map((item) => [item.species, item]),
);

/** 펫 종류 메타 조회. */
export function studioPetSpeciesMeta(species: string): StudioPetSpeciesMeta | null {
  return META_BY_SPECIES.get(species as StudioPetSpecies) ?? null;
}

/** 펫 행동 모드. */
export type StudioPetMode = "follow" | "sit" | "sleep" | "play";

export const STUDIO_PET_MODES: readonly StudioPetMode[] = Object.freeze(["follow", "sit", "sleep", "play"]);

export interface StudioPetState {
  readonly id: string;
  readonly species: StudioPetSpecies;
  readonly name: string;
  readonly position: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
  readonly mode: StudioPetMode;
  readonly modeEnteredAtMs: number;
  /** 주인 주변을 맴도는 기준 각도 (라디안, 펫마다 결정적). */
  readonly orbitAngle: number;
  readonly moving: boolean;
}

export interface StudioPetInput {
  readonly ownerPoint: StudioVirtualSpacePoint;
  /** 주인의 현재 속도 (px/s). */
  readonly ownerSpeed: number;
  readonly deltaSeconds: number;
  readonly nowMs: number;
}

/** 따라가기를 멈추는 거리 (px). */
export const STUDIO_PET_SIT_RADIUS = 52;
/** 앉은 뒤 잠드는 시간 (ms). */
export const STUDIO_PET_SLEEP_AFTER_MS = 25_000;
/** play 모드 진입 주인 속도 (px/s). */
export const STUDIO_PET_PLAY_OWNER_SPEED = 200;
/** 펫 최대 속도 (px/s). 주인보다 빨라 뒤처지지 않는다. */
export const STUDIO_PET_MAX_SPEED = 320;
/** 주인 이름 기본값. */
export const STUDIO_PET_DEFAULT_NAMES: Readonly<Record<StudioPetSpecies, { readonly ko: string; readonly en: string }>> = Object.freeze({
  cat: { ko: "나비", en: "Nabi" },
  dog: { ko: "콩이", en: "Kong" },
  fox: { ko: "여우별", en: "Foxstar" },
});

function hash01(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

function facingToward(from: StudioVirtualSpacePoint, to: StudioVirtualSpacePoint): StudioVirtualSpaceFacing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}

function withMode(state: StudioPetState, mode: StudioPetMode, nowMs: number): StudioPetState {
  if (state.mode === mode) return state;
  return Object.freeze({ ...state, mode, modeEnteredAtMs: nowMs });
}

/** 펫을 만든다. 이름이 비면 종류별 기본 이름을 쓴다. */
export function createStudioPet(input: {
  readonly id: string;
  readonly species: StudioPetSpecies;
  readonly name?: string;
  readonly start: StudioVirtualSpacePoint;
  readonly nowMs?: number;
}): StudioPetState {
  const now = Number.isFinite(input.nowMs) ? input.nowMs as number : 0;
  const fallback = STUDIO_PET_DEFAULT_NAMES[input.species];
  const name = input.name?.trim() ? input.name.trim().slice(0, 12) : fallback.ko;
  return Object.freeze({
    id: input.id,
    species: input.species,
    name,
    position: Object.freeze({ x: input.start.x, y: input.start.y }),
    facing: "down",
    mode: "follow",
    modeEnteredAtMs: now,
    orbitAngle: hash01(`pet:${input.id}`) * Math.PI * 2,
    moving: false,
  });
}

/**
 * 펫을 한 스텝 전진시킨다.
 * - 주인과의 거리가 앉기 반경을 넘으면 따라간다 (거리가 멀수록 빠르게).
 * - 반경 안에 있고 주인이 가만히 있으면 앉고, 오래 앉으면 잔다.
 * - 주인이 빨리 달리면 주변을 맴돈다.
 */
export function advanceStudioPet(state: StudioPetState, input: StudioPetInput): StudioPetState {
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : 0;
  const dt = Number.isFinite(input.deltaSeconds) ? Math.min(Math.max(input.deltaSeconds, 0), 0.1) : 0;
  const ownerSpeed = Number.isFinite(input.ownerSpeed) ? Math.max(0, input.ownerSpeed) : 0;

  const target = {
    x: input.ownerPoint.x + Math.cos(state.orbitAngle) * 64,
    y: input.ownerPoint.y + Math.sin(state.orbitAngle) * 64,
  };
  const dx = target.x - state.position.x;
  const dy = target.y - state.position.y;
  const distance = Math.hypot(dx, dy);

  if (distance > STUDIO_PET_SIT_RADIUS) {
    // 따라가기: 멀수록 빠르게 (최대 속도 제한).
    const speed = Math.min(STUDIO_PET_MAX_SPEED, 110 + distance * 1.1);
    const step = Math.min(distance - STUDIO_PET_SIT_RADIUS * 0.5, speed * dt);
    const nx = dx / (distance || 1);
    const ny = dy / (distance || 1);
    const position = Object.freeze({ x: state.position.x + nx * step, y: state.position.y + ny * step });
    return Object.freeze({
      ...withMode(state, "follow", nowMs),
      position,
      facing: facingToward(state.position, target),
      moving: step > 0.5,
    });
  }

  if (ownerSpeed >= STUDIO_PET_PLAY_OWNER_SPEED) {
    // 주인이 빨리 달리면 신나서 주변을 맴돈다.
    const angle = state.orbitAngle + dt * 3.2;
    const position = Object.freeze({
      x: input.ownerPoint.x + Math.cos(angle) * 52,
      y: input.ownerPoint.y + Math.sin(angle) * 52,
    });
    return Object.freeze({
      ...withMode(state, "play", nowMs),
      position,
      orbitAngle: angle,
      facing: facingToward(position, input.ownerPoint),
      moving: true,
    });
  }

  if (ownerSpeed < 10) {
    const sitting = withMode(state, "sit", nowMs);
    const next = nowMs - sitting.modeEnteredAtMs >= STUDIO_PET_SLEEP_AFTER_MS
      ? withMode(sitting, "sleep", sitting.modeEnteredAtMs)
      : sitting;
    return Object.freeze({
      ...next,
      facing: facingToward(state.position, input.ownerPoint),
      moving: false,
    });
  }

  return Object.freeze({
    ...withMode(state, "follow", nowMs),
    facing: facingToward(state.position, input.ownerPoint),
    moving: false,
  });
}

/** 펫 모드 라벨. */
export function studioPetModeLabel(mode: StudioPetMode): { readonly ko: string; readonly en: string } {
  switch (mode) {
    case "follow": return { ko: "따라가기", en: "Following" };
    case "sit": return { ko: "앉기", en: "Sitting" };
    case "sleep": return { ko: "낮잠", en: "Napping" };
    case "play": return { ko: "놀기", en: "Playing" };
  }
}

/* ---------------- 입양 ---------------- */

/** 한 공간에 둘 수 있는 펫 수. */
export const STUDIO_PET_ADOPT_LIMIT = 3;

export interface StudioPetAdoption {
  readonly pets: readonly StudioPetState[];
}

export const EMPTY_PET_ADOPTION: StudioPetAdoption = Object.freeze({ pets: Object.freeze([]) });

export type StudioPetAdoptResult =
  | { readonly ok: true; readonly adoption: StudioPetAdoption; readonly pet: StudioPetState }
  | { readonly ok: false; readonly reason: "limit" | "invalid-species" | "invalid-name" };

function validPetName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 12;
}

/** 펫을 입양한다. 한도 초과·잘못된 종류·이름이면 실패 사유를 반환한다. */
export function adoptStudioPet(
  adoption: StudioPetAdoption,
  input: { readonly species: string; readonly name: string; readonly ownerPoint: StudioVirtualSpacePoint; readonly nowMs?: number },
): StudioPetAdoptResult {
  const speciesMeta = studioPetSpeciesMeta(input.species);
  if (!speciesMeta) return { ok: false, reason: "invalid-species" };
  if (!validPetName(input.name)) return { ok: false, reason: "invalid-name" };
  if (adoption.pets.length >= STUDIO_PET_ADOPT_LIMIT) return { ok: false, reason: "limit" };
  const now = Number.isFinite(input.nowMs) ? input.nowMs as number : 0;
  let suffix = adoption.pets.length + 1;
  let id = `pet-${suffix}`;
  while (adoption.pets.some((pet) => pet.id === id)) { suffix += 1; id = `pet-${suffix}`; }
  const pet = createStudioPet({
    id,
    species: speciesMeta.species,
    name: input.name.trim(),
    start: { x: input.ownerPoint.x + 40, y: input.ownerPoint.y + 40 },
    nowMs: now,
  });
  return {
    ok: true,
    pet,
    adoption: Object.freeze({ pets: Object.freeze([...adoption.pets, pet]) }),
  };
}

/** 펫을 떠나보낸다 (없는 id면 그대로). */
export function releaseStudioPet(adoption: StudioPetAdoption, petId: string): StudioPetAdoption {
  if (!adoption.pets.some((pet) => pet.id === petId)) return adoption;
  return Object.freeze({ pets: Object.freeze(adoption.pets.filter((pet) => pet.id !== petId)) });
}

export type StudioPetRenameResult =
  | { readonly ok: true; readonly adoption: StudioPetAdoption }
  | { readonly ok: false; readonly reason: "not-found" | "invalid-name" };

/** 펫 이름을 바꾼다. */
export function renameStudioPet(adoption: StudioPetAdoption, petId: string, name: string): StudioPetRenameResult {
  if (!adoption.pets.some((pet) => pet.id === petId)) return { ok: false, reason: "not-found" };
  if (!validPetName(name)) return { ok: false, reason: "invalid-name" };
  return {
    ok: true,
    adoption: Object.freeze({
      pets: Object.freeze(adoption.pets.map((pet) =>
        pet.id === petId ? Object.freeze({ ...pet, name: name.trim() }) : pet)),
    }),
  };
}

/** id로 펫 조회. */
export function studioPetById(adoption: StudioPetAdoption, petId: string): StudioPetState | null {
  return adoption.pets.find((pet) => pet.id === petId) ?? null;
}
