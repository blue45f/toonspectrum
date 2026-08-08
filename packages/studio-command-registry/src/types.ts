/**
 * StudioCommand — V5 §15.4 command contract.
 *
 * The DOM shell, the canvas HUD, the shortcut router and the command palette all
 * describe a command with this one shape, so a command behaves identically no
 * matter which surface triggered it.
 *
 * `CommandDefinition` (the pre-§15.4 shape) stays supported: the registry widens
 * it into a `RegisteredCommand` on registration, so existing call sites keep
 * compiling while new call sites can declare the full contract.
 */

/** Namespaced command id, e.g. `view.zoom-in`. Enforced by `COMMAND_ID_PATTERN`. */
export type CommandId = string;

/** BCP-47 tag. `und` marks a label whose language was never declared. */
export type LocaleTag = "ko" | "en" | "und" | (string & {});

export interface LocalizedLabel {
  locale: LocaleTag;
  label: string;
  /** One-line explanation shown in palettes and tooltips. */
  description?: string;
}

/**
 * Terminology dictionaries we translate from. `toonstudio` is our own wording,
 * recorded as an alias so a rename never orphans muscle memory.
 */
export type TerminologyVendor =
  | "toonstudio"
  | "csp"
  | "photoshop"
  | "krita"
  | "procreate";

export const TERMINOLOGY_VENDORS: readonly TerminologyVendor[] = [
  "toonstudio",
  "csp",
  "photoshop",
  "krita",
  "procreate",
];

export interface TerminologyAlias {
  vendor: TerminologyVendor;
  /** Vendor-facing wording, e.g. "Paint Bucket". */
  term: string;
  locale?: LocaleTag;
  /** Why the mapping is approximate, when it is. */
  note?: string;
}

export type AvailabilityState = "enabled" | "disabled" | "hidden";

export interface Availability {
  state: AvailabilityState;
  /** Shown verbatim in disabled menu rows and tooltips. */
  reason?: string;
  /** Help node that explains how to satisfy the requirement. */
  helpNodeId?: string;
}

export type CommandPreviewKind =
  | "text"
  | "swatch"
  | "thumbnail"
  | "diff"
  | "overlay";

export interface CommandPreview {
  kind: CommandPreviewKind;
  summary: string;
  detail?: string;
  /** Opaque host payload (bitmap handle, patch descriptor …). Never inspected here. */
  payload?: unknown;
}

export type CommandResultStatus = "ok" | "noop" | "cancelled" | "error";

export interface UndoEntry {
  label: string;
  undo: () => void | Promise<void>;
  redo?: () => void | Promise<void>;
}

export interface CommandResult {
  status: CommandResultStatus;
  message?: string;
  /** Undo entry captured by this run; hosts push it onto their history stack. */
  undo?: UndoEntry;
  payload?: unknown;
}

export type UndoFactory = (
  context: CommandContext,
) => UndoEntry | Promise<UndoEntry>;

export interface Permission {
  id: string;
  /** Optional narrowing, e.g. a document or workspace id. */
  scope?: string;
}

export interface CommandContext {
  /** Workspace profile id, e.g. "comic", "animation", "paint". */
  workspace: string;
  /** Host-provided service lookup (command bus, planner, selection …). */
  services: ReadonlyMap<string, unknown>;
  /** Locale used to pick a `LocalizedLabel`. Falls back to the registry default. */
  locale?: LocaleTag;
  /** Permission ids the current actor holds. Absent means "unknown → deny gated commands". */
  grantedPermissions?: readonly string[];
  /** Free-form host flags consulted by `availability`. */
  flags?: Readonly<Record<string, boolean>>;
}

/** V5 §15.4. */
export interface StudioCommand {
  id: CommandId;
  labels: readonly LocalizedLabel[];
  aliases: readonly TerminologyAlias[];
  availability(context: CommandContext): Availability;
  preview?(context: CommandContext): CommandPreview;
  execute(context: CommandContext): Promise<CommandResult>;
  undo?: UndoFactory;
  helpNodeId: string;
  permissions?: readonly Permission[];
  /** Grouping key for menus and the palette. Defaults to the id namespace. */
  category?: string;
  /** Extra palette search terms beyond labels and aliases. */
  keywords?: readonly string[];
  /** Display chord, e.g. "⌘S". Routing lives in the host; this is documentation. */
  shortcut?: string;
}

/** Pre-§15.4 shape. Still accepted by `CommandRegistry.register`. */
export interface CommandDefinition {
  id: string;
  title: string;
  category: string;
  keywords?: string[];
  shortcut?: string;
  /** Enablement predicate; absent means always enabled. */
  when?: (context: CommandContext) => boolean;
  run: (context: CommandContext) => void | Promise<void>;
}

/**
 * What the registry stores: a `StudioCommand` plus the legacy accessors, so both
 * generations of call site read the same record.
 */
export interface RegisteredCommand extends StudioCommand {
  /** Primary label text (registry default locale, else the first label). */
  title: string;
  category: string;
  keywords: readonly string[];
  labels: readonly LocalizedLabel[];
  aliases: readonly TerminologyAlias[];
}

export function isStudioCommand(
  input: CommandDefinition | StudioCommand,
): input is StudioCommand {
  return typeof (input as StudioCommand).execute === "function";
}
