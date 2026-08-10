import { z } from "zod";

import { animationGraphIRSchema } from "./animation";
import { colorIRSchema, paintIRSchema } from "./color";
import {
  comicBalloonIRSchema,
  comicGraphIRSchema,
  comicPageIRSchema,
  comicPanelIRSchema,
} from "./comic";
import { effectGraphIRSchema } from "./effect";
import { pathIRSchema } from "./path";
import { sceneIRSchema, sceneNodeIRSchema } from "./scene";

/**
 * CommandIR + CommandJournal — the append-only history layer (V11 §10.5).
 *
 * Every mutation of the project travels as a CommandIR through the CommandBus.
 * Journal entries are individually CRC-guarded; snapshots use a two-slot (A/B)
 * scheme so a crash during snapshot write can never lose both anchors.
 *
 * Graph commands (comic/animation/effects) use whole-value replacement
 * semantics in v1: `set-page` replaces one ComicPageIR wholesale, `set-graph`
 * replaces the entire animation/effect graph. This is a design decision, not a
 * gap — partial-edit commands (move one balloon, retime one exposure) are the
 * planned v2 surface and will be added as new discriminants, so today's
 * journals stay replayable forever.
 *
 * v2 (V12 §14.1 만화 제작 Transaction) adds the comic partial-edit commands
 * below as *new* discriminants only — the v1 members are byte-frozen, so every
 * existing journal parses and replays unchanged. Each partial edit targets one
 * page by id, applies a minimal structural change and is re-validated through
 * validateComicGraph before it may consume a journal seq.
 */

export const commandIRSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("scene/init"), scene: sceneIRSchema }),
  z.object({
    type: z.literal("scene/add-node"),
    node: sceneNodeIRSchema,
    index: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("scene/update-node"),
    id: z.string().min(1),
    patch: z
      .object({
        opacity: z.number().min(0).max(1).optional(),
        paint: paintIRSchema.optional(),
        strokeWidth: z.number().positive().optional(),
      })
      .refine((patch) => Object.keys(patch).length > 0, {
        message: "empty patch",
      }),
  }),
  z.object({ type: z.literal("scene/remove-node"), id: z.string().min(1) }),
  z.object({ type: z.literal("scene/set-background"), color: colorIRSchema }),
  /** Upserts one page (matched by page.id) into the comic graph. */
  z.object({ type: z.literal("comic/set-page"), page: comicPageIRSchema }),
  /** Drops the whole comic layer (explicit, journaled — never implicit). */
  z.object({ type: z.literal("comic/clear") }),
  /**
   * Translates one balloon (shape + tail) by (x, y) in page space. The linked
   * scene text node is untouched — text placement derives from balloon layout.
   */
  z.object({
    type: z.literal("comic/move-balloon"),
    pageId: z.string().min(1),
    balloonId: z.string().min(1),
    x: z.number(),
    y: z.number(),
  }),
  /** Links (or unlinks with null) a balloon to a scene text node. */
  z.object({
    type: z.literal("comic/set-balloon-text-node"),
    pageId: z.string().min(1),
    balloonId: z.string().min(1),
    textNodeId: z.string().min(1).nullable(),
  }),
  /** Replaces one panel's boundary shape (move/resize as a wholesale path). */
  z.object({
    type: z.literal("comic/move-panel"),
    pageId: z.string().min(1),
    panelId: z.string().min(1),
    shape: pathIRSchema,
  }),
  /**
   * Re-assigns panel reading order. `readingOrder` lists the page's panel ids
   * in their new 0..n-1 reading positions and must be an exact permutation.
   */
  z.object({
    type: z.literal("comic/reorder-panels"),
    pageId: z.string().min(1),
    readingOrder: z.array(z.string().min(1)).min(1),
  }),
  /** Appends one panel; readingOrder contiguity is enforced by validation. */
  z.object({
    type: z.literal("comic/add-panel"),
    pageId: z.string().min(1),
    panel: comicPanelIRSchema,
  }),
  /**
   * Removes one panel. Referential integrity is refuse-based: if any balloon,
   * tone or effect line still references the panel the command is rejected
   * with the offending ids (V12 §14.1 specifies the transaction chain but no
   * cascade for panel removal, so dependents must be removed explicitly —
   * consistent with the "no silent loss" journal principle).
   */
  z.object({
    type: z.literal("comic/remove-panel"),
    pageId: z.string().min(1),
    panelId: z.string().min(1),
  }),
  /** Appends one balloon; panel/character refs and order are validated. */
  z.object({
    type: z.literal("comic/add-balloon"),
    pageId: z.string().min(1),
    balloon: comicBalloonIRSchema,
  }),
  /**
   * Removes one balloon and compacts the per-panel balloon reading order. Any
   * linked scene text node stays in the scene layer — dropping scene content
   * must always be an explicit, journaled scene command.
   */
  z.object({
    type: z.literal("comic/remove-balloon"),
    pageId: z.string().min(1),
    balloonId: z.string().min(1),
  }),
  /** Replaces the entire animation graph (X-sheet, camera, audio). */
  z.object({ type: z.literal("animation/set-graph"), graph: animationGraphIRSchema }),
  z.object({ type: z.literal("animation/clear") }),
  /** Replaces the entire effect DAG. */
  z.object({ type: z.literal("effects/set-graph"), graph: effectGraphIRSchema }),
  z.object({ type: z.literal("effects/clear") }),
]);
export type CommandIR = z.infer<typeof commandIRSchema>;

/** Scene-layer subset of CommandIR (the pre-graph command surface). */
export type SceneCommandIR = Extract<CommandIR, { type: `scene/${string}` }>;

export function isSceneCommand(command: CommandIR): command is SceneCommandIR {
  return command.type.startsWith("scene/");
}

/** Comic partial-edit subset (the V12 §14.1 v2 surface; excludes set-page/clear). */
export type ComicPartialCommandIR = Extract<
  CommandIR,
  {
    type:
      | "comic/move-balloon"
      | "comic/set-balloon-text-node"
      | "comic/move-panel"
      | "comic/reorder-panels"
      | "comic/add-panel"
      | "comic/remove-panel"
      | "comic/add-balloon"
      | "comic/remove-balloon";
  }
>;

export function isComicPartialCommand(
  command: CommandIR,
): command is ComicPartialCommandIR {
  return (
    command.type.startsWith("comic/") &&
    command.type !== "comic/set-page" &&
    command.type !== "comic/clear"
  );
}

export const journalEntryIRSchema = z.object({
  seq: z.number().int().positive(),
  tMs: z.number().nonnegative(),
  command: commandIRSchema,
  /** crc32 of canonicalJson({ seq, tMs, command }). */
  crc: z.number().int().nonnegative(),
});
export type JournalEntryIR = z.infer<typeof journalEntryIRSchema>;

export const snapshotSlotSchema = z.enum(["A", "B"]);
export type SnapshotSlot = z.infer<typeof snapshotSlotSchema>;

/**
 * Snapshot format versioning:
 * - v1 (no `version` field): `{ slot, seq, digest, scene, crc }` — scene only.
 * - v2 (`version: 2`): adds `projectDigest` plus the comic/animation/effects
 *   graphs. All v2 fields are optional in the schema so v1 files parse as-is;
 *   recovery migrates a v1 snapshot by null-filling the graph layers.
 *
 * The CRC covers exactly the fields present in the stored body (canonicalJson
 * drops absent keys), so v1 snapshots keep verifying against their original
 * CRC and v2 snapshots are covered end to end.
 */
export const PROJECT_SNAPSHOT_VERSION = 2 as const;

export const snapshotIRSchema = z.object({
  slot: snapshotSlotSchema,
  seq: z.number().int().nonnegative(),
  /** fnv1a64Hex(canonicalJson(scene)) — verified on recovery. */
  digest: z.string().length(16),
  scene: sceneIRSchema,
  /** Present from snapshot format v2 onward. */
  version: z.literal(PROJECT_SNAPSHOT_VERSION).optional(),
  /** projectDigest(state) — verified on recovery when present. */
  projectDigest: z.string().length(16).optional(),
  comic: comicGraphIRSchema.nullable().optional(),
  animation: animationGraphIRSchema.nullable().optional(),
  effects: effectGraphIRSchema.nullable().optional(),
  /** crc32 of canonicalJson over every non-crc field present in the body. */
  crc: z.number().int().nonnegative(),
});
export type SnapshotIR = z.infer<typeof snapshotIRSchema>;
