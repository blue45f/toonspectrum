/**
 * CommandRegistry: the DOM shell and the canvas HUD share one registry so a
 * command id behaves identically whether it is triggered from a menu, a
 * shortcut, the command palette or an on-canvas radial HUD.
 * (design ref: V11 §2, E26 hybrid rule.)
 *
 * The command contract is `StudioCommand` (design ref: V5 §15.4). The older
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

export {
  createEditorClient,
  createEditorSnapshotStore,
  EDITOR_DISPATCH_OPTIONS_SERVICE_KEY,
  EDITOR_REQUEST_SERVICE_KEY,
} from "./editor-client";
export type {
  CommandDurableState,
  CommandReceipt,
  CommandReceiptStatus,
  DispatchAbortSignal,
  DispatchOptions,
  EditorClient,
  EditorClientOptions,
  EditorCommandOutcomeHints,
  EditorCommandRequest,
  EditorCommandSource,
  EditorSnapshotStore,
  TileRegion,
} from "./editor-client";

export { createEditorClientRuntime } from "./editor-client-runtime";
export type {
  EditorClientRuntime,
  EditorClientRuntimeOptions,
  EditorClientRuntimeUpdate,
} from "./editor-client-runtime";
