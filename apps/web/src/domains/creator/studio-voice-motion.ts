export interface StudioVoiceRights {
  readonly commercialUseAllowed: boolean;
  readonly attributionRequired: boolean;
  readonly attributionText: string | null;
  readonly expiresAt: string | null;
}

export interface StudioCharacterVoiceProfile {
  readonly characterId: string;
  readonly providerId: string;
  readonly voiceId: string;
  readonly locale: string;
  readonly speed: number;
  readonly pitch: number;
  readonly pronunciation: Readonly<Record<string, string>>;
  readonly rights: StudioVoiceRights;
}

export interface StudioDialogueVoiceLine {
  readonly id: string;
  readonly characterId: string;
  readonly locale: string;
  readonly text: string;
  readonly revision: number;
}

export interface StudioVoiceSegment {
  readonly lineId: string;
  readonly characterId: string;
  readonly voiceId: string;
  readonly locale: string;
  readonly sourceRevision: number;
  readonly sourceTextHash: string;
  readonly assetId: string;
  readonly durationMs: number;
}

export interface StudioVoiceRegenerationPlan {
  readonly status: "ready" | "blocked";
  readonly regenerateLineIds: readonly string[];
  readonly reuseLineIds: readonly string[];
  readonly removeSegmentLineIds: readonly string[];
  readonly blockingIssues: readonly {
    readonly code: string;
    readonly lineId: string;
  }[];
  readonly attributionTexts: readonly string[];
}

export interface StudioMotionCue {
  readonly id: string;
  readonly lineId: string | null;
  readonly durationMs: number;
  readonly transitionMs: number;
}

export interface StudioScheduledMotionCue extends StudioMotionCue {
  readonly startMs: number;
  readonly endMs: number;
}

function requireText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function studioVoiceTextHash(text: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function validateStudioVoiceProfile(
  profile: StudioCharacterVoiceProfile,
): readonly string[] {
  const issues: string[] = [];
  if (
    !profile.characterId.trim()
    || !profile.providerId.trim()
    || !profile.voiceId.trim()
    || !profile.locale.trim()
  ) {
    issues.push("profile-required");
  }
  if (!Number.isFinite(profile.speed) || profile.speed < 0.5 || profile.speed > 2) {
    issues.push("speed-range");
  }
  if (!Number.isFinite(profile.pitch) || profile.pitch < -12 || profile.pitch > 12) {
    issues.push("pitch-range");
  }
  if (profile.rights.attributionRequired && !profile.rights.attributionText?.trim()) {
    issues.push("attribution-text");
  }
  if (profile.rights.expiresAt && !validTimestamp(profile.rights.expiresAt)) {
    issues.push("rights-expiry");
  }
  return Object.freeze(issues);
}

export function planStudioVoiceRegeneration(input: {
  readonly profiles: readonly StudioCharacterVoiceProfile[];
  readonly lines: readonly StudioDialogueVoiceLine[];
  readonly existingSegments: readonly StudioVoiceSegment[];
  readonly commercialUse: boolean;
  readonly now: string;
}): StudioVoiceRegenerationPlan {
  if (!validTimestamp(input.now)) throw new Error("A valid planning timestamp is required.");
  const profileByCharacter = new Map<string, StudioCharacterVoiceProfile>();
  for (const profile of input.profiles) {
    if (validateStudioVoiceProfile(profile).length > 0) {
      throw new Error("Voice profiles must be valid before generation planning.");
    }
    if (profileByCharacter.has(profile.characterId)) {
      throw new Error("Each character can have only one active voice profile per plan.");
    }
    profileByCharacter.set(profile.characterId, profile);
  }
  const lineIds = input.lines.map((line) => requireText(line.id, "Dialogue line id"));
  if (new Set(lineIds).size !== lineIds.length) {
    throw new Error("Dialogue line ids must be unique.");
  }
  const segmentByLine = new Map(input.existingSegments.map((segment) => [segment.lineId, segment]));
  const regenerateLineIds: string[] = [];
  const reuseLineIds: string[] = [];
  const blockingIssues: { code: string; lineId: string }[] = [];
  const attributionTexts = new Set<string>();

  for (const line of input.lines) {
    requireText(line.characterId, "Character id");
    requireText(line.locale, "Dialogue locale");
    requireText(line.text, "Dialogue text");
    if (!Number.isSafeInteger(line.revision) || line.revision < 1) {
      throw new Error("Dialogue revisions must be positive integers.");
    }
    const profile = profileByCharacter.get(line.characterId);
    if (!profile || profile.locale.toLowerCase() !== line.locale.toLowerCase()) {
      blockingIssues.push({ code: "voice-profile-missing", lineId: line.id });
      continue;
    }
    if (input.commercialUse && !profile.rights.commercialUseAllowed) {
      blockingIssues.push({ code: "commercial-rights", lineId: line.id });
      continue;
    }
    if (
      profile.rights.expiresAt
      && Date.parse(input.now) > Date.parse(profile.rights.expiresAt)
    ) {
      blockingIssues.push({ code: "voice-rights-expired", lineId: line.id });
      continue;
    }
    if (profile.rights.attributionRequired && profile.rights.attributionText) {
      attributionTexts.add(profile.rights.attributionText);
    }

    const existing = segmentByLine.get(line.id);
    const textHash = studioVoiceTextHash(line.text);
    if (
      existing
      && existing.characterId === line.characterId
      && existing.voiceId === profile.voiceId
      && existing.locale.toLowerCase() === line.locale.toLowerCase()
      && existing.sourceRevision === line.revision
      && existing.sourceTextHash === textHash
    ) {
      reuseLineIds.push(line.id);
    } else {
      regenerateLineIds.push(line.id);
    }
  }

  const currentLineIds = new Set(lineIds);
  const removeSegmentLineIds = input.existingSegments
    .filter((segment) => !currentLineIds.has(segment.lineId))
    .map((segment) => segment.lineId);
  return Object.freeze({
    status: blockingIssues.length > 0 ? "blocked" : "ready",
    regenerateLineIds: Object.freeze(regenerateLineIds),
    reuseLineIds: Object.freeze(reuseLineIds),
    removeSegmentLineIds: Object.freeze(removeSegmentLineIds),
    blockingIssues: Object.freeze(blockingIssues.map((issue) => Object.freeze(issue))),
    attributionTexts: Object.freeze([...attributionTexts]),
  });
}

export function buildStudioMotionSchedule(
  cues: readonly StudioMotionCue[],
): readonly StudioScheduledMotionCue[] {
  const ids = cues.map((cue) => requireText(cue.id, "Motion cue id"));
  if (new Set(ids).size !== ids.length) throw new Error("Motion cue ids must be unique.");
  let cursor = 0;
  const scheduled: StudioScheduledMotionCue[] = [];
  for (const cue of cues) {
    if (
      !Number.isSafeInteger(cue.durationMs)
      || cue.durationMs <= 0
      || !Number.isSafeInteger(cue.transitionMs)
      || cue.transitionMs < 0
      || cue.transitionMs >= cue.durationMs
    ) {
      throw new Error("Motion cue timing is invalid.");
    }
    const startMs = Math.max(0, cursor - cue.transitionMs);
    const endMs = startMs + cue.durationMs;
    scheduled.push(Object.freeze({ ...cue, startMs, endMs }));
    cursor = endMs;
  }
  return Object.freeze(scheduled);
}
