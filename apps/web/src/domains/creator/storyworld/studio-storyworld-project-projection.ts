import type { StoryworldProject } from "./studio-storyworld-causality";
import type {
  StudioCharacterContinuityState,
  StudioContinuityTransition,
  StudioStoryBible,
} from "../studio-story-bible";

export interface StudioStoryworldProjectProjection {
  readonly bible: StudioStoryBible;
  readonly states: readonly StudioCharacterContinuityState[];
  readonly transitions: readonly StudioContinuityTransition[];
}

/**
 * Projects the richer Storyworld authoring model into the project-level readiness model.
 * Storyworld remains the authoring authority; this projection is intentionally lossier and exists
 * only so continuity/readiness/export checks observe the latest saved narrative state.
 */
export function projectStoryworldToStudioProjectStory(
  project: StoryworldProject,
  projectId: string,
): StudioStoryworldProjectProjection {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) throw new Error("Storyworld project projection requires a project id.");
  const characterIds = new Set(project.characters.map((character) => character.id));
  const scenes = [...project.scenes]
    .filter((scene) => !scene.disabled)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const locationIds = [...new Set(
    scenes.map((scene) => scene.locationId?.trim()).filter((value): value is string => Boolean(value)),
  )].sort();
  const locationSet = new Set(locationIds);

  const bible: StudioStoryBible = Object.freeze({
    projectId: normalizedProjectId,
    characters: Object.freeze(project.characters.map((character) => Object.freeze({
      id: character.id,
      name: character.name,
      aliases: Object.freeze([]),
      defaultCostumeId: null,
      defaultAppearanceId: null,
    }))),
    locations: Object.freeze(locationIds.map((id) => Object.freeze({ id, name: id }))),
    facts: Object.freeze(project.facts.map((fact) => Object.freeze({
      id: fact.id,
      label: fact.label,
      characterIds: Object.freeze(characterIds.has(fact.subjectId) ? [fact.subjectId] : []),
      locationId: locationSet.has(fact.subjectId) ? fact.subjectId : null,
    }))),
  });

  const knownFacts = new Map<string, Set<string>>();
  for (const character of project.characters) {
    knownFacts.set(character.id, new Set(character.initialFactIds ?? []));
  }
  const states: StudioCharacterContinuityState[] = [];
  const previousState = new Map<string, StudioCharacterContinuityState>();
  const transitions: StudioContinuityTransition[] = [];

  for (const scene of scenes) {
    for (const reveal of scene.reveals ?? []) {
      for (const audience of reveal.audiences) {
        if (audience !== "reader" && characterIds.has(audience)) {
          knownFacts.get(audience)?.add(reveal.factId);
        }
      }
    }
    for (const participantId of scene.participantIds ?? []) {
      if (!characterIds.has(participantId)) continue;
      const state: StudioCharacterContinuityState = Object.freeze({
        sceneId: scene.id,
        sequence: scene.order,
        characterId: participantId,
        costumeId: null,
        appearanceId: null,
        injuryIds: Object.freeze([]),
        propIds: Object.freeze([]),
        knownFactIds: Object.freeze([...(knownFacts.get(participantId) ?? [])].sort()),
        locationId: scene.locationId?.trim() || null,
      });
      const previous = previousState.get(participantId);
      if (previous) {
        transitions.push(Object.freeze({
          characterId: participantId,
          fromSceneId: previous.sceneId,
          toSceneId: state.sceneId,
          allowedCategories: Object.freeze(
            previous.locationId !== state.locationId ? ["location" as const] : [],
          ),
          note: previous.locationId !== state.locationId
            ? "Storyworld scene location transition"
            : "Storyworld consecutive scene transition",
        }));
      }
      previousState.set(participantId, state);
      states.push(state);
    }
  }

  return Object.freeze({
    bible,
    states: Object.freeze(states),
    transitions: Object.freeze(transitions),
  });
}
