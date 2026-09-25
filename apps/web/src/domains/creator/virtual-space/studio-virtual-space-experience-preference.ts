export const STUDIO_VIRTUAL_EXPERIENCE_STORAGE_KEY = "toonspectrum:virtual-space-experience:v1";

export const STUDIO_VIRTUAL_CONTROL_MODES = ["fixed", "floating", "tap"] as const;
export const STUDIO_VIRTUAL_HANDEDNESS = ["right", "left"] as const;
export const STUDIO_VIRTUAL_QUALITY_PRESETS = ["auto", "ultra", "high", "balanced", "battery", "accessibility"] as const;
export const STUDIO_VIRTUAL_CAMERA_MODES = ["follow", "steady", "cinematic"] as const;
export const STUDIO_VIRTUAL_NAMEPLATE_MODES = ["auto", "full", "compact", "dot"] as const;
export const STUDIO_VIRTUAL_DIALOGUE_SCALES = ["normal", "large", "xlarge"] as const;
export const STUDIO_VIRTUAL_START_LOCATIONS = ["last", "desk", "lobby"] as const;
export const STUDIO_VIRTUAL_EFFECT_LEVELS = ["low", "balanced", "high"] as const;

export type StudioVirtualControlMode = typeof STUDIO_VIRTUAL_CONTROL_MODES[number];
export type StudioVirtualHandedness = typeof STUDIO_VIRTUAL_HANDEDNESS[number];
export type StudioVirtualQualityPreset = typeof STUDIO_VIRTUAL_QUALITY_PRESETS[number];
export type StudioVirtualCameraMode = typeof STUDIO_VIRTUAL_CAMERA_MODES[number];
export type StudioVirtualNameplateMode = typeof STUDIO_VIRTUAL_NAMEPLATE_MODES[number];
export type StudioVirtualDialogueScale = typeof STUDIO_VIRTUAL_DIALOGUE_SCALES[number];
export type StudioVirtualStartLocation = typeof STUDIO_VIRTUAL_START_LOCATIONS[number];
export type StudioVirtualEffectLevel = typeof STUDIO_VIRTUAL_EFFECT_LEVELS[number];

export interface StudioVirtualExperiencePreference {
  readonly version: 1;
  readonly controlMode: StudioVirtualControlMode;
  readonly handedness: StudioVirtualHandedness;
  readonly qualityPreset: StudioVirtualQualityPreset;
  readonly cameraMode: StudioVirtualCameraMode;
  readonly nameplateMode: StudioVirtualNameplateMode;
  readonly dialogueScale: StudioVirtualDialogueScale;
  readonly startLocation: StudioVirtualStartLocation;
  readonly effectLevel: StudioVirtualEffectLevel;
  readonly ttsEnabled: boolean;
  readonly interactionRings: boolean;
}

export const DEFAULT_STUDIO_VIRTUAL_EXPERIENCE: StudioVirtualExperiencePreference = Object.freeze({
  version: 1,
  controlMode: "fixed",
  handedness: "right",
  qualityPreset: "auto",
  cameraMode: "follow",
  nameplateMode: "auto",
  dialogueScale: "large",
  startLocation: "last",
  effectLevel: "balanced",
  ttsEnabled: false,
  interactionRings: true,
});

function oneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function parseStudioVirtualExperiencePreference(value: unknown): StudioVirtualExperiencePreference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1
    || !oneOf(STUDIO_VIRTUAL_CONTROL_MODES, candidate.controlMode)
    || !oneOf(STUDIO_VIRTUAL_HANDEDNESS, candidate.handedness)
    || !oneOf(STUDIO_VIRTUAL_QUALITY_PRESETS, candidate.qualityPreset)
    || !oneOf(STUDIO_VIRTUAL_CAMERA_MODES, candidate.cameraMode)
    || !oneOf(STUDIO_VIRTUAL_NAMEPLATE_MODES, candidate.nameplateMode)
    || !oneOf(STUDIO_VIRTUAL_DIALOGUE_SCALES, candidate.dialogueScale)
    || !oneOf(STUDIO_VIRTUAL_START_LOCATIONS, candidate.startLocation)
    || !oneOf(STUDIO_VIRTUAL_EFFECT_LEVELS, candidate.effectLevel)
    || typeof candidate.ttsEnabled !== "boolean"
    || typeof candidate.interactionRings !== "boolean") return null;
  return Object.freeze({
    version: 1,
    controlMode: candidate.controlMode,
    handedness: candidate.handedness,
    qualityPreset: candidate.qualityPreset,
    cameraMode: candidate.cameraMode,
    nameplateMode: candidate.nameplateMode,
    dialogueScale: candidate.dialogueScale,
    startLocation: candidate.startLocation,
    effectLevel: candidate.effectLevel,
    ttsEnabled: candidate.ttsEnabled,
    interactionRings: candidate.interactionRings,
  });
}

export function readStudioVirtualExperiencePreference(): StudioVirtualExperiencePreference {
  if (typeof window === "undefined") return DEFAULT_STUDIO_VIRTUAL_EXPERIENCE;
  try {
    const raw = window.localStorage.getItem(STUDIO_VIRTUAL_EXPERIENCE_STORAGE_KEY);
    return raw ? parseStudioVirtualExperiencePreference(JSON.parse(raw)) ?? DEFAULT_STUDIO_VIRTUAL_EXPERIENCE
      : DEFAULT_STUDIO_VIRTUAL_EXPERIENCE;
  } catch {
    return DEFAULT_STUDIO_VIRTUAL_EXPERIENCE;
  }
}

export function writeStudioVirtualExperiencePreference(value: StudioVirtualExperiencePreference): boolean {
  const parsed = parseStudioVirtualExperiencePreference(value);
  if (!parsed || typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STUDIO_VIRTUAL_EXPERIENCE_STORAGE_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}

export function patchStudioVirtualExperiencePreference(
  current: StudioVirtualExperiencePreference,
  patch: Partial<Omit<StudioVirtualExperiencePreference, "version">>,
): StudioVirtualExperiencePreference {
  return parseStudioVirtualExperiencePreference({ ...current, ...patch, version: 1 }) ?? current;
}
