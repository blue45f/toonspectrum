import { LEARNING_GOALS, LEARNING_LEVELS, type LearningGoal, type LearningLevel } from "./learning-paths";

export const LEARNING_PROFILE_STORAGE_KEY = "toonstudio:learning-profile:v1";
export const SESSION_MINUTES = [15, 30, 45] as const;
export type SessionMinutes = (typeof SESSION_MINUTES)[number];

export interface LearningProfile {
  version: 1;
  goal: LearningGoal;
  level: LearningLevel;
  sessionMinutes: SessionMinutes;
}

export const DEFAULT_LEARNING_PROFILE: LearningProfile = {
  version: 1,
  goal: "first-episode",
  level: "starter",
  sessionMinutes: 30,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGoal(value: unknown): value is LearningGoal {
  return typeof value === "string" && LEARNING_GOALS.includes(value as LearningGoal);
}

function isLevel(value: unknown): value is LearningLevel {
  return typeof value === "string" && LEARNING_LEVELS.includes(value as LearningLevel);
}

function isSessionMinutes(value: unknown): value is SessionMinutes {
  return typeof value === "number" && SESSION_MINUTES.includes(value as SessionMinutes);
}

export function parseLearningProfile(raw: string | null): LearningProfile {
  if (!raw || raw.length > 10_000) return { ...DEFAULT_LEARNING_PROFILE };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_LEARNING_PROFILE };
  }
  if (!isRecord(value) || value.version !== 1) return { ...DEFAULT_LEARNING_PROFILE };
  return {
    version: 1,
    goal: isGoal(value.goal) ? value.goal : DEFAULT_LEARNING_PROFILE.goal,
    level: isLevel(value.level) ? value.level : DEFAULT_LEARNING_PROFILE.level,
    sessionMinutes: isSessionMinutes(value.sessionMinutes) ? value.sessionMinutes : DEFAULT_LEARNING_PROFILE.sessionMinutes,
  };
}

export function loadLearningProfile(storage: Pick<Storage, "getItem"> | null): LearningProfile {
  if (!storage) return { ...DEFAULT_LEARNING_PROFILE };
  try {
    return parseLearningProfile(storage.getItem(LEARNING_PROFILE_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_LEARNING_PROFILE };
  }
}

export function saveLearningProfile(storage: Pick<Storage, "setItem"> | null, profile: LearningProfile): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LEARNING_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}
