/**
 * CommandRegistry (V11 §2, E26 hybrid rule): the DOM shell and the canvas HUD
 * share one registry so a command behaves identically whether triggered from a
 * menu, a shortcut, the command palette or an on-canvas radial HUD.
 *
 * The command contract is V5 §15.4 (`StudioCommand`). The pre-§15.4
 * `CommandDefinition` shape is still accepted so existing call sites migrate
 * one at a time instead of in a single flag day.
 */

export {
  CommandRegistry,
  CommandRegistryError,
  COMMAND_ID_PATTERN,
  defaultHelpNodeId,
} from "./registry";
export type { CommandRegistryOptions } from "./registry";

export {
  TerminologyIndex,
  normalizeTerminologyTerm,
} from "./terminology";
export type {
  TerminologyMatch,
  TerminologyResolveOptions,
} from "./terminology";

export { isStudioCommand, TERMINOLOGY_VENDORS } from "./types";
export type {
  Availability,
  AvailabilityState,
  CommandContext,
  CommandDefinition,
  CommandId,
  CommandPreview,
  CommandPreviewKind,
  CommandResult,
  CommandResultStatus,
  LocaleTag,
  LocalizedLabel,
  Permission,
  RegisteredCommand,
  StudioCommand,
  TerminologyAlias,
  TerminologyVendor,
  UndoEntry,
  UndoFactory,
} from "./types";

export { alwaysAvailable, availableWhen } from "./availability";
