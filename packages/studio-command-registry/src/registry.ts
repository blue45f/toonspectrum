/**
 * CommandRegistry (V11 §2, E26 hybrid rule; contract from V5 §15.4): the DOM
 * shell and the canvas HUD share one registry so a command behaves identically
 * whether triggered from a menu, a shortcut, the command palette or an
 * on-canvas radial HUD.
 */

import { TerminologyIndex } from "./terminology";
import { isStudioCommand } from "./types";

import type {
  TerminologyMatch,
  TerminologyResolveOptions,
} from "./terminology";
import type {
  Availability,
  CommandContext,
  CommandDefinition,
  CommandId,
  CommandPreview,
  CommandResult,
  LocaleTag,
  RegisteredCommand,
  StudioCommand,
} from "./types";

export const COMMAND_ID_PATTERN = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;

export class CommandRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandRegistryError";
  }
}

export interface CommandRegistryOptions {
  /**
   * Locale used to pick `title` from `labels` and to tag labels synthesized from
   * a legacy `CommandDefinition.title`.
   */
  defaultLocale?: LocaleTag;
}

/** Derived help node for commands that do not declare one: `help/<id>`. */
export function defaultHelpNodeId(id: CommandId): string {
  return `help/${id.replace(/\./gu, "/")}`;
}

function pickTitle(
  labels: RegisteredCommand["labels"],
  locale: LocaleTag,
): string {
  return (
    labels.find((label) => label.locale === locale)?.label ??
    labels[0]?.label ??
    ""
  );
}

export class CommandRegistry {
  private readonly commands = new Map<CommandId, RegisteredCommand>();
  private readonly terminology = new TerminologyIndex();
  private readonly defaultLocale: LocaleTag;

  constructor(options: CommandRegistryOptions = {}) {
    this.defaultLocale = options.defaultLocale ?? "ko";
  }

  register(input: CommandDefinition | StudioCommand): () => void {
    const command = this.normalize(input);
    if (!COMMAND_ID_PATTERN.test(command.id)) {
      throw new CommandRegistryError(
        `command id must be namespaced (a.b.c): ${command.id}`,
      );
    }
    if (this.commands.has(command.id)) {
      throw new CommandRegistryError(
        `command already registered: ${command.id}`,
      );
    }
    this.commands.set(command.id, command);
    this.terminology.add(command.id, command.aliases);
    return () => {
      this.commands.delete(command.id);
      this.terminology.remove(command.id);
    };
  }

  get(id: CommandId): RegisteredCommand | null {
    return this.commands.get(id) ?? null;
  }

  get size(): number {
    return this.commands.size;
  }

  ids(): CommandId[] {
    return [...this.commands.keys()];
  }

  /** Commands enabled in the given context, sorted by category then title. */
  list(context: CommandContext): RegisteredCommand[] {
    return [...this.commands.values()]
      .filter(
        (command) => this.resolveAvailability(command, context).state === "enabled",
      )
      .sort((a, b) =>
        a.category === b.category
          ? a.title.localeCompare(b.title)
          : a.category.localeCompare(b.category),
      );
  }

  /** Palette search over id, every label, keywords and terminology aliases. */
  search(context: CommandContext, query: string): RegisteredCommand[] {
    const needle = query.trim().toLowerCase();
    if (needle === "") return this.list(context);
    return this.list(context).filter((command) => {
      const haystack = [
        command.id,
        ...command.labels.flatMap((label) => [
          label.label,
          label.description ?? "",
        ]),
        ...command.keywords,
        ...command.aliases.map((alias) => alias.term),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  /**
   * "CSP wording → our command". Returns registered commands, deduplicated and
   * ordered by first match, so a Help search can render them directly.
   */
  resolveTerminology(
    term: string,
    options: TerminologyResolveOptions = {},
  ): RegisteredCommand[] {
    const seen = new Set<CommandId>();
    const resolved: RegisteredCommand[] = [];
    for (const match of this.terminology.resolve(term, options)) {
      if (seen.has(match.commandId)) continue;
      seen.add(match.commandId);
      const command = this.commands.get(match.commandId);
      if (command) resolved.push(command);
    }
    return resolved;
  }

  /** Raw alias hits, including which dictionary and wording matched. */
  matchTerminology(
    term: string,
    options: TerminologyResolveOptions = {},
  ): TerminologyMatch[] {
    return this.terminology.resolve(term, options);
  }

  /** Aliases claimed by more than one command. */
  ambiguousTerminology(): { term: string; commandIds: CommandId[] }[] {
    return this.terminology.ambiguousTerms();
  }

  availabilityOf(id: CommandId, context: CommandContext): Availability {
    const command = this.commands.get(id);
    if (!command) throw new CommandRegistryError(`unknown command: ${id}`);
    return this.resolveAvailability(command, context);
  }

  previewOf(id: CommandId, context: CommandContext): CommandPreview | null {
    const command = this.commands.get(id);
    if (!command) throw new CommandRegistryError(`unknown command: ${id}`);
    if (!command.preview) return null;
    if (this.resolveAvailability(command, context).state !== "enabled") {
      return null;
    }
    return command.preview(context);
  }

  async execute(id: CommandId, context: CommandContext): Promise<CommandResult> {
    const command = this.commands.get(id);
    if (!command) throw new CommandRegistryError(`unknown command: ${id}`);
    const availability = this.resolveAvailability(command, context);
    if (availability.state !== "enabled") {
      throw new CommandRegistryError(
        availability.reason
          ? `command disabled in this context: ${id} (${availability.reason})`
          : `command disabled in this context: ${id}`,
      );
    }
    const result = await command.execute(context);
    if (result.undo || !command.undo) return result;
    return { ...result, undo: await command.undo(context) };
  }

  /** Permissions gate first, then the command's own predicate. */
  private resolveAvailability(
    command: RegisteredCommand,
    context: CommandContext,
  ): Availability {
    const missing = (command.permissions ?? []).filter(
      (permission) =>
        !(context.grantedPermissions ?? []).includes(permission.id),
    );
    if (missing.length > 0) {
      return {
        state: "disabled",
        reason: `missing permission: ${missing.map((p) => p.id).join(", ")}`,
        helpNodeId: command.helpNodeId,
      };
    }
    return command.availability(context);
  }

  private normalize(
    input: CommandDefinition | StudioCommand,
  ): RegisteredCommand {
    const category = input.category ?? input.id.split(".")[0] ?? "";
    if (isStudioCommand(input)) {
      const labels = [...input.labels];
      return {
        ...input,
        labels,
        aliases: [...input.aliases],
        category,
        keywords: [...(input.keywords ?? [])],
        title: pickTitle(labels, this.defaultLocale),
        helpNodeId: input.helpNodeId || defaultHelpNodeId(input.id),
      };
    }
    const legacy = input;
    const labels = [{ locale: this.defaultLocale, label: legacy.title }];
    return {
      id: legacy.id,
      labels,
      aliases: [],
      category,
      keywords: [...(legacy.keywords ?? [])],
      shortcut: legacy.shortcut,
      title: legacy.title,
      helpNodeId: defaultHelpNodeId(legacy.id),
      availability: (context) => ({
        state: (legacy.when?.(context) ?? true) ? "enabled" : "disabled",
      }),
      execute: async (context) => {
        await legacy.run(context);
        return { status: "ok" };
      },
    };
  }
}
