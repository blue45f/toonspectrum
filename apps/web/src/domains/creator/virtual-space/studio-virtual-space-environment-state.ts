import type { StudioVirtualEnvironmentEffect } from "./studio-virtual-space-engine-bridge";

export interface StudioEnvironmentObjectState {
  readonly waterfallEnergy: number;
  readonly fountainWishes: number;
  readonly portalCharge: number;
  readonly treeBloom: number;
  readonly catAffinity: number;
  readonly lanternEnergy: number;
  readonly updatedAt: number;
}

export const DEFAULT_STUDIO_ENVIRONMENT_STATE: StudioEnvironmentObjectState = Object.freeze({
  waterfallEnergy: 0,
  fountainWishes: 0,
  portalCharge: 0,
  treeBloom: 0,
  catAffinity: 0,
  lanternEnergy: 0,
  updatedAt: 0,
});

function clamp(value: number, max = 10): number {
  return Math.max(0, Math.min(max, Math.round(value * 100) / 100));
}

export function stepStudioEnvironmentState(
  state: StudioEnvironmentObjectState,
  effect: StudioVirtualEnvironmentEffect,
  now: number,
): StudioEnvironmentObjectState {
  const next = {
    ...state,
    waterfallEnergy: effect === "waterfall-splash" ? clamp(state.waterfallEnergy + 2.4) : state.waterfallEnergy,
    fountainWishes: effect === "wish" ? clamp(state.fountainWishes + 1, 99) : state.fountainWishes,
    portalCharge: effect === "gong" || effect === "spotlight" ? clamp(state.portalCharge + 2.2) : state.portalCharge,
    treeBloom: effect === "petals" ? clamp(state.treeBloom + 2.6) : state.treeBloom,
    catAffinity: effect === "pet" ? clamp(state.catAffinity + 1, 20) : state.catAffinity,
    lanternEnergy: effect === "lanterns" || effect === "photo" ? clamp(state.lanternEnergy + 2) : state.lanternEnergy,
    updatedAt: now,
  };
  return Object.freeze(next);
}

export function decayStudioEnvironmentState(
  state: StudioEnvironmentObjectState,
  now: number,
): StudioEnvironmentObjectState {
  if (!state.updatedAt || now <= state.updatedAt) return state;
  const elapsedSeconds = Math.min(60, (now - state.updatedAt) / 1000);
  const decay = elapsedSeconds * .18;
  const next = {
    ...state,
    waterfallEnergy: clamp(state.waterfallEnergy - decay),
    portalCharge: clamp(state.portalCharge - decay * .75),
    treeBloom: clamp(state.treeBloom - decay * .55),
    lanternEnergy: clamp(state.lanternEnergy - decay),
    updatedAt: now,
  };
  return Object.freeze(next);
}

export function studioEnvironmentFlowMultiplier(state: StudioEnvironmentObjectState): number {
  return 1 + state.waterfallEnergy * .08;
}
