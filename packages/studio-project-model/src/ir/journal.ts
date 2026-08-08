import { z } from "zod";

import { animationGraphIRSchema } from "./animation";
import { colorIRSchema, paintIRSchema } from "./color";
import { comicGraphIRSchema, comicPageIRSchema } from "./comic";
import { effectGraphIRSchema } from "./effect";
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
