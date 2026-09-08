import { compareCodeUnitStrings } from "@/shared/lib/compare-code-unit-strings";

import type {
  StudioCharacterBible,
  StudioCharacterBibleEntry,
  StudioCharacterBibleField,
} from "../studio-character-bible";

export const STUDIO_CHARACTER_BIBLE_V2 = 2 as const;

export const STUDIO_CHARACTER_LOCK_MODES = [
  "hard",
  "soft",
  "scene-override",
  "episode-variant",
  "canon-change",
] as const;

export type StudioCharacterLockMode =
  (typeof STUDIO_CHARACTER_LOCK_MODES)[number];

export const STUDIO_CHARACTER_REFERENCE_ROLES = [
  "front",
  "left",
  "right",
  "back",
  "expression",
  "pose",
  "hand",
  "outfit",
  "color",
] as const;

export type StudioCharacterReferenceRole =
  (typeof STUDIO_CHARACTER_REFERENCE_ROLES)[number];

export type StudioCharacterVersionStatus =
  | "draft"
  | "approved"
  | "superseded";

export type StudioCharacterStatus = "draft" | "approved" | "retired";

export interface StudioCharacterReferenceV2 {
  readonly id: string;
  readonly role: StudioCharacterReferenceRole;
  readonly assetRevisionId: string;
  readonly label: string;
}

export interface StudioCharacterPaletteItemV2 {
  readonly id: string;
  readonly label: string;
  /** Optional because a migrated free-form colour description must not be invented as a hex value. */
  readonly value: string | null;
  readonly sourceText: string;
}

export interface StudioCharacterAppearanceV2 {
  readonly summary: string;
  readonly face: string;
  readonly hair: string;
  readonly body: string;
  readonly relativeHeight: number | null;
  readonly distinctiveFeatures: readonly string[];
}

export interface StudioCharacterVersionV2 {
  readonly id: string;
  readonly characterId: string;
  readonly label: string;
  readonly status: StudioCharacterVersionStatus;
  readonly effectiveFromEpisodeNo: number | null;
  readonly effectiveToEpisodeNo: number | null;
  readonly appearance: StudioCharacterAppearanceV2;
  readonly defaultCostume: string;
  readonly palette: readonly StudioCharacterPaletteItemV2[];
  readonly voice: string;
  readonly goal: string;
  readonly props: readonly string[];
  readonly locks: Readonly<Partial<Record<StudioCharacterBibleField, StudioCharacterLockMode>>>;
  readonly references: readonly StudioCharacterReferenceV2[];
  readonly createdAt: string;
  readonly changeReason: string;
}

export type StudioCharacterVariantKind =
  | "outfit"
  | "age"
  | "injury"
  | "transformation"
  | "temporary";

export interface StudioCharacterVariantOverridesV2 {
  readonly appearance?: Partial<StudioCharacterAppearanceV2>;
  readonly costume?: string;
  readonly palette?: readonly StudioCharacterPaletteItemV2[];
  readonly props?: readonly string[];
  readonly promptNotes?: string;
}

export interface StudioCharacterVariantV2 {
  readonly id: string;
  readonly characterId: string;
  readonly baseVersionId: string;
  readonly label: string;
  readonly kind: StudioCharacterVariantKind;
  readonly overrides: StudioCharacterVariantOverridesV2;
  readonly applicableWorkIds: readonly string[];
  readonly applicableSceneIds: readonly string[];
  readonly createdAt: string;
}

export interface StudioCharacterRelationshipV2 {
  readonly id: string;
  readonly targetCharacterId: string | null;
  readonly description: string;
}

export interface StudioCharacterV2 {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly role: string;
  readonly canonicalVersionId: string;
  readonly versions: readonly StudioCharacterVersionV2[];
  readonly variants: readonly StudioCharacterVariantV2[];
  readonly relationships: readonly StudioCharacterRelationshipV2[];
  readonly tags: readonly string[];
  readonly status: StudioCharacterStatus;
}

export interface StudioCharacterBibleV2 {
  readonly version: typeof STUDIO_CHARACTER_BIBLE_V2;
  readonly characters: readonly StudioCharacterV2[];
}

export type StudioCharacterBibleV2IssueCode =
  | "duplicate-character-id"
  | "duplicate-version-id"
  | "duplicate-variant-id"
  | "canonical-version-missing"
  | "canonical-version-not-approved"
  | "version-character-mismatch"
  | "variant-character-mismatch"
  | "variant-base-version-missing"
  | "invalid-version-range"
  | "invalid-reference"
  | "invalid-lock-mode"
  | "duplicate-reference-id"
  | "duplicate-palette-id"
  | "invalid-timestamp";

export interface StudioCharacterBibleV2Issue {
  readonly code: StudioCharacterBibleV2IssueCode;
  readonly characterId: string;
  readonly entityId?: string;
  readonly message: string;
}

export interface StudioResolvedCharacterContextV2 {
  readonly characterId: string;
  readonly characterVersionId: string;
  readonly variantIds: readonly string[];
  readonly name: string;
  readonly role: string;
  readonly appearance: StudioCharacterAppearanceV2;
  readonly costume: string;
  readonly palette: readonly StudioCharacterPaletteItemV2[];
  readonly voice: string;
  readonly goal: string;
  readonly props: readonly string[];
  readonly locks: Readonly<Partial<Record<StudioCharacterBibleField, StudioCharacterLockMode>>>;
  readonly references: readonly StudioCharacterReferenceV2[];
  readonly promptNotes: readonly string[];
}

export interface StudioCharacterPromptReceiptV2 {
  readonly characterId: string;
  readonly characterVersionId: string;
  readonly variantIds: readonly string[];
  readonly hardLockedFields: readonly StudioCharacterBibleField[];
  readonly contextDigestInput: string;
}

const LOCK_MODE_SET = new Set<string>(STUDIO_CHARACTER_LOCK_MODES);
const REFERENCE_ROLE_SET = new Set<string>(STUDIO_CHARACTER_REFERENCE_ROLES);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const MAX_ID_LENGTH = 240;

function validId(value: string): boolean {
  return value.length > 0 && value.length <= MAX_ID_LENGTH && SAFE_ID.test(value);
}

function validTimestamp(value: string): boolean {
  if (!Number.isFinite(Date.parse(value))) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function cleanList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = value.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function migratedVersionId(characterId: string): string {
  return `${characterId}:canon:1`;
}

function migratedPalette(
  character: StudioCharacterBibleEntry,
): StudioCharacterPaletteItemV2[] {
  return character.colors.map((sourceText, index) => ({
    id: `${character.id}:palette:${index + 1}`,
    label: sourceText,
    value: null,
    sourceText,
  }));
}

function migratedLocks(
  fields: readonly StudioCharacterBibleField[],
): Readonly<Partial<Record<StudioCharacterBibleField, StudioCharacterLockMode>>> {
  return Object.fromEntries(fields.map((field) => [field, "hard"])) as Readonly<
    Partial<Record<StudioCharacterBibleField, StudioCharacterLockMode>>
  >;
}

/**
 * Losslessly lifts the existing v1 character records into versioned v2 records.
 *
 * It deliberately does not invent reference images, relationship targets, colour values, episode
 * ranges, aliases, tags, or character facts that do not exist in the v1 source.
 */
export function migrateStudioCharacterBibleV1ToV2(
  bible: StudioCharacterBible,
  options: {
    readonly createdAt: string;
    readonly changeReason?: string;
  },
): StudioCharacterBibleV2 {
  if (!validTimestamp(options.createdAt)) {
    throw new Error("Character Bible migration requires a canonical UTC timestamp.");
  }
  const characters = bible.characters.map((character): StudioCharacterV2 => {
    const versionId = migratedVersionId(character.id);
    return {
      id: character.id,
      name: character.name,
      aliases: [],
      role: character.role,
      canonicalVersionId: versionId,
      versions: [{
        id: versionId,
        characterId: character.id,
        label: "v1 가져오기",
        status: "approved",
        effectiveFromEpisodeNo: null,
        effectiveToEpisodeNo: null,
        appearance: {
          summary: character.appearance,
          face: "",
          hair: "",
          body: "",
          relativeHeight: null,
          distinctiveFeatures: [],
        },
        defaultCostume: character.costume,
        palette: migratedPalette(character),
        voice: character.voice,
        goal: character.goal,
        props: [...character.props],
        locks: migratedLocks(character.lockedFields),
        references: [],
        createdAt: options.createdAt,
        changeReason: options.changeReason?.trim() || "v1 캐릭터 바이블에서 무손실 승격",
      }],
      variants: [],
      relationships: character.relationships.map((description, index) => ({
        id: `${character.id}:relationship:${index + 1}`,
        targetCharacterId: null,
        description,
      })),
      tags: [],
      status: "approved",
    };
  });
  return { version: STUDIO_CHARACTER_BIBLE_V2, characters };
}

function rangeContains(
  version: StudioCharacterVersionV2,
  episodeNo: number | null,
): boolean {
  if (episodeNo === null) return true;
  if (
    version.effectiveFromEpisodeNo !== null
    && episodeNo < version.effectiveFromEpisodeNo
  ) {
    return false;
  }
  if (
    version.effectiveToEpisodeNo !== null
    && episodeNo > version.effectiveToEpisodeNo
  ) {
    return false;
  }
  return true;
}

function mergeAppearance(
  base: StudioCharacterAppearanceV2,
  patch: Partial<StudioCharacterAppearanceV2> | undefined,
): StudioCharacterAppearanceV2 {
  if (!patch) return base;
  return {
    summary: patch.summary ?? base.summary,
    face: patch.face ?? base.face,
    hair: patch.hair ?? base.hair,
    body: patch.body ?? base.body,
    relativeHeight: patch.relativeHeight ?? base.relativeHeight,
    distinctiveFeatures: patch.distinctiveFeatures ?? base.distinctiveFeatures,
  };
}

function applicableVariant(
  variant: StudioCharacterVariantV2,
  workId: string | null,
  sceneId: string | null,
): boolean {
  const workMatches = variant.applicableWorkIds.length === 0
    || (workId !== null && variant.applicableWorkIds.includes(workId));
  const sceneMatches = variant.applicableSceneIds.length === 0
    || (sceneId !== null && variant.applicableSceneIds.includes(sceneId));
  return workMatches && sceneMatches;
}

export function resolveStudioCharacterContextV2(
  bible: StudioCharacterBibleV2,
  input: {
    readonly characterId: string;
    readonly episodeNo?: number | null;
    readonly workId?: string | null;
    readonly sceneId?: string | null;
    readonly variantIds?: readonly string[];
  },
): StudioResolvedCharacterContextV2 {
  const character = bible.characters.find((item) => item.id === input.characterId);
  if (!character) throw new Error(`Unknown Studio character: ${input.characterId}`);

  const episodeNo = input.episodeNo ?? null;
  const canonical = character.versions.find((version) =>
    version.id === character.canonicalVersionId
  );
  const version = episodeNo === null
    ? canonical
    : character.versions.filter((candidate) =>
        candidate.status === "approved" && rangeContains(candidate, episodeNo)
      ).at(-1) ?? canonical;
  if (!version) throw new Error(`Character ${character.id} has no resolvable version.`);

  const requestedVariantIds = cleanList(input.variantIds ?? []);
  const variants = requestedVariantIds.map((variantId) => {
    const variant = character.variants.find((item) => item.id === variantId);
    if (!variant) throw new Error(`Unknown character variant: ${variantId}`);
    if (variant.baseVersionId !== version.id) {
      throw new Error(`Variant ${variant.id} does not belong to version ${version.id}.`);
    }
    if (!applicableVariant(variant, input.workId ?? null, input.sceneId ?? null)) {
      throw new Error(`Variant ${variant.id} is outside its declared scope.`);
    }
    return variant;
  });

  let appearance = version.appearance;
  let costume = version.defaultCostume;
  let palette = version.palette;
  let props = version.props;
  const promptNotes: string[] = [];
  for (const variant of variants) {
    appearance = mergeAppearance(appearance, variant.overrides.appearance);
    costume = variant.overrides.costume ?? costume;
    palette = variant.overrides.palette ?? palette;
    props = variant.overrides.props ?? props;
    if (variant.overrides.promptNotes?.trim()) {
      promptNotes.push(variant.overrides.promptNotes.trim());
    }
  }

  return {
    characterId: character.id,
    characterVersionId: version.id,
    variantIds: variants.map((variant) => variant.id),
    name: character.name,
    role: character.role,
    appearance,
    costume,
    palette,
    voice: version.voice,
    goal: version.goal,
    props,
    locks: version.locks,
    references: version.references,
    promptNotes,
  };
}

export function createStudioCharacterPromptReceiptV2(
  context: StudioResolvedCharacterContextV2,
): StudioCharacterPromptReceiptV2 {
  const hardLockedFields = Object.entries(context.locks)
    .filter(([, mode]) => mode === "hard")
    .map(([field]) => field as StudioCharacterBibleField)
    .sort(compareCodeUnitStrings);
  return {
    characterId: context.characterId,
    characterVersionId: context.characterVersionId,
    variantIds: [...context.variantIds],
    hardLockedFields,
    contextDigestInput: JSON.stringify({
      characterId: context.characterId,
      characterVersionId: context.characterVersionId,
      variantIds: context.variantIds,
      appearance: context.appearance,
      costume: context.costume,
      palette: context.palette,
      props: context.props,
      locks: context.locks,
      references: context.references,
      promptNotes: context.promptNotes,
    }),
  };
}

export function validateStudioCharacterBibleV2(
  bible: StudioCharacterBibleV2,
): readonly StudioCharacterBibleV2Issue[] {
  const issues: StudioCharacterBibleV2Issue[] = [];
  const characterIds = new Set<string>();
  const globalVersionIds = new Set<string>();
  const globalVariantIds = new Set<string>();

  for (const character of bible.characters) {
    if (characterIds.has(character.id)) {
      issues.push({
        code: "duplicate-character-id",
        characterId: character.id,
        message: `Duplicate character ID: ${character.id}`,
      });
    }
    characterIds.add(character.id);

    const versionIds = new Set<string>();
    for (const version of character.versions) {
      if (versionIds.has(version.id) || globalVersionIds.has(version.id)) {
        issues.push({
          code: "duplicate-version-id",
          characterId: character.id,
          entityId: version.id,
          message: `Duplicate character version ID: ${version.id}`,
        });
      }
      versionIds.add(version.id);
      globalVersionIds.add(version.id);
      if (version.characterId !== character.id) {
        issues.push({
          code: "version-character-mismatch",
          characterId: character.id,
          entityId: version.id,
          message: `Version ${version.id} belongs to ${version.characterId}.`,
        });
      }
      if (
        version.effectiveFromEpisodeNo !== null
        && version.effectiveToEpisodeNo !== null
        && version.effectiveFromEpisodeNo > version.effectiveToEpisodeNo
      ) {
        issues.push({
          code: "invalid-version-range",
          characterId: character.id,
          entityId: version.id,
          message: `Version ${version.id} has an inverted episode range.`,
        });
      }
      if (!validTimestamp(version.createdAt)) {
        issues.push({
          code: "invalid-timestamp",
          characterId: character.id,
          entityId: version.id,
          message: `Version ${version.id} has an invalid timestamp.`,
        });
      }
      const referenceIds = new Set<string>();
      for (const reference of version.references) {
        if (
          !validId(reference.id)
          || !validId(reference.assetRevisionId)
          || !REFERENCE_ROLE_SET.has(reference.role)
        ) {
          issues.push({
            code: "invalid-reference",
            characterId: character.id,
            entityId: reference.id,
            message: `Version ${version.id} contains an invalid reference.`,
          });
        }
        if (referenceIds.has(reference.id)) {
          issues.push({
            code: "duplicate-reference-id",
            characterId: character.id,
            entityId: reference.id,
            message: `Duplicate reference ID: ${reference.id}`,
          });
        }
        referenceIds.add(reference.id);
      }
      const paletteIds = new Set<string>();
      for (const paletteItem of version.palette) {
        if (paletteIds.has(paletteItem.id)) {
          issues.push({
            code: "duplicate-palette-id",
            characterId: character.id,
            entityId: paletteItem.id,
            message: `Duplicate palette ID: ${paletteItem.id}`,
          });
        }
        paletteIds.add(paletteItem.id);
      }
      for (const [field, mode] of Object.entries(version.locks)) {
        if (!LOCK_MODE_SET.has(mode ?? "")) {
          issues.push({
            code: "invalid-lock-mode",
            characterId: character.id,
            entityId: `${version.id}:${field}`,
            message: `Invalid lock mode for ${field}.`,
          });
        }
      }
    }

    const canonical = character.versions.find((version) =>
      version.id === character.canonicalVersionId
    );
    if (!canonical) {
      issues.push({
        code: "canonical-version-missing",
        characterId: character.id,
        entityId: character.canonicalVersionId,
        message: `Canonical version is missing for ${character.id}.`,
      });
    } else if (canonical.status !== "approved") {
      issues.push({
        code: "canonical-version-not-approved",
        characterId: character.id,
        entityId: canonical.id,
        message: `Canonical version ${canonical.id} is not approved.`,
      });
    }

    const variantIds = new Set<string>();
    for (const variant of character.variants) {
      if (variantIds.has(variant.id) || globalVariantIds.has(variant.id)) {
        issues.push({
          code: "duplicate-variant-id",
          characterId: character.id,
          entityId: variant.id,
          message: `Duplicate character variant ID: ${variant.id}`,
        });
      }
      variantIds.add(variant.id);
      globalVariantIds.add(variant.id);
      if (variant.characterId !== character.id) {
        issues.push({
          code: "variant-character-mismatch",
          characterId: character.id,
          entityId: variant.id,
          message: `Variant ${variant.id} belongs to ${variant.characterId}.`,
        });
      }
      if (!versionIds.has(variant.baseVersionId)) {
        issues.push({
          code: "variant-base-version-missing",
          characterId: character.id,
          entityId: variant.id,
          message: `Variant ${variant.id} references a missing base version.`,
        });
      }
      if (!validTimestamp(variant.createdAt)) {
        issues.push({
          code: "invalid-timestamp",
          characterId: character.id,
          entityId: variant.id,
          message: `Variant ${variant.id} has an invalid timestamp.`,
        });
      }
    }
  }

  return issues;
}
