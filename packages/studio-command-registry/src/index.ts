/**
 * CommandRegistry (V11 §2, E26 hybrid rule): the DOM shell and the canvas HUD
 * share one registry so a command behaves identically whether triggered from a
 * menu, a shortcut, the command palette or an on-canvas radial HUD.
 */

export interface CommandContext {
  /** Workspace profile id, e.g. "comic", "animation", "paint". */
  workspace: string;
  /** Host-provided service lookup (command bus, planner, selection …). */
  services: ReadonlyMap<string, unknown>;
}

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

export class CommandRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandRegistryError";
  }
}

export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();

  register(definition: CommandDefinition): () => void {
    if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(definition.id)) {
      throw new CommandRegistryError(
        `command id must be namespaced (a.b.c): ${definition.id}`,
      );
    }
    if (this.commands.has(definition.id)) {
      throw new CommandRegistryError(`command already registered: ${definition.id}`);
    }
    this.commands.set(definition.id, definition);
    return () => this.commands.delete(definition.id);
  }

  get(id: string): CommandDefinition | null {
    return this.commands.get(id) ?? null;
  }

  /** Commands enabled in the given context, sorted by category then title. */
  list(context: CommandContext): CommandDefinition[] {
    return [...this.commands.values()]
      .filter((command) => command.when?.(context) ?? true)
      .sort((a, b) =>
        a.category === b.category
          ? a.title.localeCompare(b.title)
          : a.category.localeCompare(b.category),
      );
  }

  /** Simple palette search over id, title and keywords. */
  search(context: CommandContext, query: string): CommandDefinition[] {
    const needle = query.trim().toLowerCase();
    if (needle === "") return this.list(context);
    return this.list(context).filter((command) => {
      const haystack = [command.id, command.title, ...(command.keywords ?? [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  async execute(id: string, context: CommandContext): Promise<void> {
    const command = this.commands.get(id);
    if (!command) throw new CommandRegistryError(`unknown command: ${id}`);
    if (command.when && !command.when(context)) {
      throw new CommandRegistryError(`command disabled in this context: ${id}`);
    }
    await command.run(context);
  }
}
