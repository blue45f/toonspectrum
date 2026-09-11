export const STUDIO_CONTINUITY_CATEGORIES = [
  "costume",
  "appearance",
  "injury",
  "prop",
  "knowledge",
  "location",
] as const;

export type StudioContinuityCategory =
  (typeof STUDIO_CONTINUITY_CATEGORIES)[number];
export type StudioContinuitySeverity = "warning" | "error";
export type StudioContinuityStatus = "pass" | "warning" | "blocked";

export interface StudioStoryCharacter {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly defaultCostumeId: string | null;
  readonly defaultAppearanceId: string | null;
}

export interface StudioStoryLocation {
  readonly id: string;
  readonly name: string;
}

export interface StudioStoryFact {
  readonly id: string;
  readonly label: string;
  readonly characterIds: readonly string[];
  readonly locationId: string | null;
}

export interface StudioStoryBible {
  readonly projectId: string;
  readonly characters: readonly StudioStoryCharacter[];
  readonly locations: readonly StudioStoryLocation[];
  readonly facts: readonly StudioStoryFact[];
}

export interface StudioStoryBibleIssue {
  readonly code: string;
  readonly severity: StudioContinuitySeverity;
  readonly message: string;
  readonly affectedIds: readonly string[];
}

export interface StudioCharacterContinuityState {
  readonly sceneId: string;
  readonly sequence: number;
  readonly characterId: string;
  readonly costumeId: string | null;
  readonly appearanceId: string | null;
  readonly injuryIds: readonly string[];
  readonly propIds: readonly string[];
  readonly knownFactIds: readonly string[];
  readonly locationId: string | null;
}

export interface StudioContinuityTransition {
  readonly characterId: string;
  readonly fromSceneId: string;
  readonly toSceneId: string;
  readonly allowedCategories: readonly StudioContinuityCategory[];
  readonly note: string;
}

export interface StudioContinuityIssue {
  readonly code: string;
  readonly category: StudioContinuityCategory;
  readonly severity: StudioContinuitySeverity;
  readonly characterId: string;
  readonly fromSceneId: string;
  readonly toSceneId: string;
  readonly affectedIds: readonly string[];
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface StudioContinuityReport {
  readonly status: StudioContinuityStatus;
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly issues: readonly StudioContinuityIssue[];
}

function clean(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  }
  return [...duplicates].sort();
}

function bibleIssue(
  code: string,
  severity: StudioContinuitySeverity,
  message: string,
  affectedIds: readonly string[],
): StudioStoryBibleIssue {
  return Object.freeze({
    code,
    severity,
    message,
    affectedIds: Object.freeze([...affectedIds]),
  });
}

export function validateStudioStoryBible(
  bible: StudioStoryBible,
): readonly StudioStoryBibleIssue[] {
  const issues: StudioStoryBibleIssue[] = [];
  if (!bible.projectId.trim()) {
    issues.push(bibleIssue("project-id", "error", "Project id is required.", []));
  }

  const characterIds = bible.characters.map((character) => character.id);
  const locationIds = bible.locations.map((location) => location.id);
  const factIds = bible.facts.map((fact) => fact.id);
  for (const [code, ids] of [
    ["character-id-duplicate", duplicateValues(characterIds)],
    ["location-id-duplicate", duplicateValues(locationIds)],
    ["fact-id-duplicate", duplicateValues(factIds)],
  ] as const) {
    if (ids.length > 0) {
      issues.push(bibleIssue(code, "error", "Story bible ids must be unique.", ids));
    }
  }

  const names = new Map<string, string>();
  for (const character of bible.characters) {
    if (!character.id.trim() || !character.name.trim()) {
      issues.push(bibleIssue(
        "character-required",
        "error",
        "Each character requires an id and name.",
        [character.id],
      ));
    }
    for (const candidate of [character.name, ...character.aliases]) {
      const token = clean(candidate);
      if (!token) continue;
      const owner = names.get(token);
      if (owner && owner !== character.id) {
        issues.push(bibleIssue(
          "character-name-conflict",
          "warning",
          `Character name or alias '${candidate}' is shared by multiple characters.`,
          [owner, character.id],
        ));
      } else {
        names.set(token, character.id);
      }
    }
  }

  const knownCharacters = new Set(characterIds);
  const knownLocations = new Set(locationIds);
  for (const location of bible.locations) {
    if (!location.id.trim() || !location.name.trim()) {
      issues.push(bibleIssue(
        "location-required",
        "error",
        "Each location requires an id and name.",
        [location.id],
      ));
    }
  }
  for (const fact of bible.facts) {
    if (!fact.id.trim() || !fact.label.trim()) {
      issues.push(bibleIssue(
        "fact-required",
        "error",
        "Each continuity fact requires an id and label.",
        [fact.id],
      ));
    }
    const unknownCharacters = fact.characterIds.filter((id) => !knownCharacters.has(id));
    if (unknownCharacters.length > 0) {
      issues.push(bibleIssue(
        "fact-character-reference",
        "error",
        "A fact references an unknown character.",
        unknownCharacters,
      ));
    }
    if (fact.locationId && !knownLocations.has(fact.locationId)) {
      issues.push(bibleIssue(
        "fact-location-reference",
        "error",
        "A fact references an unknown location.",
        [fact.locationId],
      ));
    }
  }

  return Object.freeze(issues);
}

function continuityIssue(
  code: string,
  category: StudioContinuityCategory,
  severity: StudioContinuitySeverity,
  previous: StudioCharacterContinuityState,
  current: StudioCharacterContinuityState,
  affectedIds: readonly string[],
  messageKo: string,
  messageEn: string,
): StudioContinuityIssue {
  return Object.freeze({
    code,
    category,
    severity,
    characterId: current.characterId,
    fromSceneId: previous.sceneId,
    toSceneId: current.sceneId,
    affectedIds: Object.freeze([...affectedIds]),
    messageKo,
    messageEn,
  });
}

function removed(previous: readonly string[], current: readonly string[]): string[] {
  const currentSet = new Set(current);
  return previous.filter((id) => !currentSet.has(id));
}

function transitionKey(
  characterId: string,
  fromSceneId: string,
  toSceneId: string,
): string {
  return `${characterId}\u0000${fromSceneId}\u0000${toSceneId}`;
}

export function analyzeStudioStoryContinuity(
  bible: StudioStoryBible,
  states: readonly StudioCharacterContinuityState[],
  transitions: readonly StudioContinuityTransition[] = [],
): StudioContinuityReport {
  const bibleIssues = validateStudioStoryBible(bible);
  if (bibleIssues.some((issue) => issue.severity === "error")) {
    throw new Error("A valid story bible is required before continuity analysis.");
  }

  const knownCharacters = new Set(bible.characters.map((character) => character.id));
  const knownFacts = new Set(bible.facts.map((fact) => fact.id));
  const knownLocations = new Set(bible.locations.map((location) => location.id));
  const seenAppearances = new Set<string>();
  const byCharacter = new Map<string, StudioCharacterContinuityState[]>();

  for (const state of states) {
    if (
      !state.sceneId.trim()
      || !knownCharacters.has(state.characterId)
      || !Number.isSafeInteger(state.sequence)
      || state.sequence < 0
      || state.knownFactIds.some((id) => !knownFacts.has(id))
      || (state.locationId !== null && !knownLocations.has(state.locationId))
    ) {
      throw new Error("Continuity states must reference valid story bible entities.");
    }
    const appearanceKey = `${state.sceneId}\u0000${state.characterId}`;
    if (seenAppearances.has(appearanceKey)) {
      throw new Error("A character can have only one continuity state per scene.");
    }
    seenAppearances.add(appearanceKey);
    byCharacter.set(state.characterId, [
      ...(byCharacter.get(state.characterId) ?? []),
      state,
    ]);
  }

  const allowed = new Map<string, ReadonlySet<StudioContinuityCategory>>();
  for (const transition of transitions) {
    const key = transitionKey(
      transition.characterId,
      transition.fromSceneId,
      transition.toSceneId,
    );
    allowed.set(key, new Set(transition.allowedCategories));
  }

  const issues: StudioContinuityIssue[] = [];
  for (const appearances of byCharacter.values()) {
    appearances.sort((left, right) => left.sequence - right.sequence);
    for (let index = 1; index < appearances.length; index += 1) {
      const previous = appearances[index - 1];
      const current = appearances[index];
      if (!previous || !current) continue;
      const categories = allowed.get(transitionKey(
        current.characterId,
        previous.sceneId,
        current.sceneId,
      )) ?? new Set<StudioContinuityCategory>();

      if (previous.costumeId !== current.costumeId && !categories.has("costume")) {
        issues.push(continuityIssue(
          "costume-change",
          "costume",
          "warning",
          previous,
          current,
          [previous.costumeId, current.costumeId].filter((id): id is string => id !== null),
          "의상 변경 근거가 등록되지 않았습니다.",
          "The costume changed without a registered transition.",
        ));
      }
      if (previous.appearanceId !== current.appearanceId && !categories.has("appearance")) {
        issues.push(continuityIssue(
          "appearance-change",
          "appearance",
          "warning",
          previous,
          current,
          [previous.appearanceId, current.appearanceId].filter((id): id is string => id !== null),
          "외형 변경 근거가 등록되지 않았습니다.",
          "The appearance changed without a registered transition.",
        ));
      }
      const healedInjuries = removed(previous.injuryIds, current.injuryIds);
      if (healedInjuries.length > 0 && !categories.has("injury")) {
        issues.push(continuityIssue(
          "injury-disappeared",
          "injury",
          "error",
          previous,
          current,
          healedInjuries,
          "이전 장면의 부상이 설명 없이 사라졌습니다.",
          "An injury disappeared without an explained transition.",
        ));
      }
      const missingProps = removed(previous.propIds, current.propIds);
      if (missingProps.length > 0 && !categories.has("prop")) {
        issues.push(continuityIssue(
          "prop-disappeared",
          "prop",
          "warning",
          previous,
          current,
          missingProps,
          "인물이 들고 있던 소품이 설명 없이 사라졌습니다.",
          "A carried prop disappeared without an explained transition.",
        ));
      }
      const forgottenFacts = removed(previous.knownFactIds, current.knownFactIds);
      if (forgottenFacts.length > 0 && !categories.has("knowledge")) {
        issues.push(continuityIssue(
          "knowledge-regression",
          "knowledge",
          "error",
          previous,
          current,
          forgottenFacts,
          "인물이 이미 알고 있던 정보를 잊은 상태로 바뀌었습니다.",
          "The character regressed to not knowing an established fact.",
        ));
      }
      if (previous.locationId !== current.locationId && !categories.has("location")) {
        issues.push(continuityIssue(
          "location-change",
          "location",
          "warning",
          previous,
          current,
          [previous.locationId, current.locationId].filter((id): id is string => id !== null),
          "장소 이동 근거가 등록되지 않았습니다.",
          "The location changed without a registered transition.",
        ));
      }
    }
  }

  const blockingCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  return Object.freeze({
    status: blockingCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "pass",
    blockingCount,
    warningCount,
    issues: Object.freeze(issues),
  });
}
