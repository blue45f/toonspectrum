import { z } from "zod";

import { colorIRSchema, paintIRSchema } from "./color";
import { sceneIRSchema, sceneNodeIRSchema } from "./scene";

/**
 * CommandIR + CommandJournal — the append-only history layer (V11 §10.5).
 *
 * Every mutation of the project travels as a CommandIR through the CommandBus.
 * Journal entries are individually CRC-guarded; snapshots use a two-slot (A/B)
 * scheme so a crash during snapshot write can never lose both anchors.
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
]);
export type CommandIR = z.infer<typeof commandIRSchema>;

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

export const snapshotIRSchema = z.object({
  slot: snapshotSlotSchema,
  seq: z.number().int().nonnegative(),
  /** fnv1a64Hex(canonicalJson(scene)) — verified on recovery. */
  digest: z.string().length(16),
  scene: sceneIRSchema,
  /** crc32 of canonicalJson({ slot, seq, digest, scene }). */
  crc: z.number().int().nonnegative(),
});
export type SnapshotIR = z.infer<typeof snapshotIRSchema>;
