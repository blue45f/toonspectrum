import {
  EMPTY_CREATOR_CONTINUITY,
  type CreatorContinuityState,
  type CreatorLaunchGoal,
  type CreatorLaunchPace,
} from "./creator-continuity-model";
import {
  clearCreatorPlanInState,
  clearCreatorRecentInState,
  addCreatorDestinationInState,
  setCreatorLaunchPlanInState,
} from "./creator-continuity-reducer";
import {
  parseCreatorContinuity,
  serializeCreatorContinuity,
} from "./creator-continuity-codec";

export const CREATOR_CONTINUITY_STORAGE_KEY = "toonstudio:creator-continuity:v1";
export const CREATOR_CONTINUITY_EVENT = "toonstudio:creator-continuity";

export interface CreatorContinuityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

let initialized = false;
let activeStorage: CreatorContinuityStorage | null = null;
let currentSnapshot: CreatorContinuityState = EMPTY_CREATOR_CONTINUITY;
const listeners = new Set<() => void>();

function browserStorage(): CreatorContinuityStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readCreatorContinuity(
  storage: CreatorContinuityStorage | null = browserStorage(),
  now = Date.now(),
): CreatorContinuityState {
  if (!storage) return EMPTY_CREATOR_CONTINUITY;
  try {
    return parseCreatorContinuity(storage.getItem(CREATOR_CONTINUITY_STORAGE_KEY), now);
  } catch {
    return EMPTY_CREATOR_CONTINUITY;
  }
}

function persist(state: CreatorContinuityState): void {
  if (!activeStorage) return;
  try {
    activeStorage.setItem(
      CREATOR_CONTINUITY_STORAGE_KEY,
      serializeCreatorContinuity(state),
    );
  } catch {
    // Private mode and quota errors must never block navigation.
  }
}

function publish(next: CreatorContinuityState): CreatorContinuityState {
  currentSnapshot = next;
  for (const listener of listeners) listener();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CREATOR_CONTINUITY_EVENT, { detail: next }));
  }
  return next;
}

export function initializeCreatorContinuity(
  storage: CreatorContinuityStorage | null = browserStorage(),
): void {
  if (initialized) return;
  initialized = true;
  activeStorage = storage;
  currentSnapshot = readCreatorContinuity(activeStorage);
  if (typeof window === "undefined") return;
  window.addEventListener("storage", (event) => {
    if (event.key !== CREATOR_CONTINUITY_STORAGE_KEY) return;
    publish(parseCreatorContinuity(event.newValue));
  });
}

export function getCreatorContinuitySnapshot(): CreatorContinuityState {
  initializeCreatorContinuity();
  return currentSnapshot;
}

export function getCreatorContinuityServerSnapshot(): CreatorContinuityState {
  return EMPTY_CREATOR_CONTINUITY;
}

export function subscribeCreatorContinuity(listener: () => void): () => void {
  initializeCreatorContinuity();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recordCreatorDestination(
  pathname: string,
  search = "",
  now = Date.now(),
): CreatorContinuityState {
  initializeCreatorContinuity();
  const next = addCreatorDestinationInState(currentSnapshot, pathname, search, now);
  if (next === currentSnapshot) return currentSnapshot;
  persist(next);
  return publish(next);
}

export function saveCreatorLaunchPlan(
  goal: CreatorLaunchGoal,
  pace: CreatorLaunchPace,
  now = Date.now(),
): CreatorContinuityState {
  initializeCreatorContinuity();
  const next = setCreatorLaunchPlanInState(currentSnapshot, goal, pace, now);
  persist(next);
  return publish(next);
}

export function clearCreatorRecentDestinations(): CreatorContinuityState {
  initializeCreatorContinuity();
  const next = clearCreatorRecentInState(currentSnapshot);
  persist(next);
  return publish(next);
}

export function clearCreatorLaunchPlan(): CreatorContinuityState {
  initializeCreatorContinuity();
  const next = clearCreatorPlanInState(currentSnapshot);
  persist(next);
  return publish(next);
}
