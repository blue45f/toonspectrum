import { describe, expect, it, vi } from "vitest";

import {
  alwaysAvailable,
  availableWhen,
  CommandRegistry,
  CommandRegistryError,
  defaultHelpNodeId,
  normalizeTerminologyTerm,
} from "../index";

import type {
  CommandContext,
  CommandResult,
  StudioCommand,
} from "../index";

const context: CommandContext = {
  workspace: "comic",
  services: new Map(),
};

function command(overrides: Partial<StudioCommand> = {}): StudioCommand {
  return {
    id: "tool.pen",
    labels: [
      { locale: "ko", label: "펜" },
      { locale: "en", label: "Pen" },
    ],
    aliases: [
      { vendor: "csp", term: "펜", locale: "ko" },
      { vendor: "photoshop", term: "Brush Tool", locale: "en" },
      { vendor: "procreate", term: "Paint", locale: "en" },
    ],
    availability: alwaysAvailable,
    execute: async (): Promise<CommandResult> => ({ status: "ok" }),
    helpNodeId: "help/tool/pen",
    ...overrides,
  };
}

describe("StudioCommand (§15.4)", () => {
  it("keeps the full contract on read-back and derives title from the default locale", () => {
    const registry = new CommandRegistry({ defaultLocale: "en" });
    registry.register(command());
    const stored = registry.get("tool.pen");

    expect(stored?.title).toBe("Pen");
    expect(stored?.category).toBe("tool");
    expect(stored?.helpNodeId).toBe("help/tool/pen");
    expect(stored?.labels.map((l) => l.locale)).toEqual(["ko", "en"]);
    expect(stored?.aliases).toHaveLength(3);
  });

  it("derives helpNodeId when the command omits one", () => {
    const registry = new CommandRegistry();
    registry.register(command({ id: "view.zoom-in", helpNodeId: "" }));
    expect(registry.get("view.zoom-in")?.helpNodeId).toBe("help/view/zoom-in");
    expect(defaultHelpNodeId("filter.gaussian-blur")).toBe(
      "help/filter/gaussian-blur",
    );
  });

  it("resolves CSP/Photoshop/Krita/Procreate wording back to our command", () => {
    const registry = new CommandRegistry();
    registry.register(command());
    registry.register(
      command({
        id: "tool.fill",
        labels: [{ locale: "ko", label: "채우기" }],
        aliases: [
          { vendor: "photoshop", term: "Paint Bucket", locale: "en" },
          { vendor: "procreate", term: "ColorDrop", locale: "en" },
        ],
        helpNodeId: "help/tool/fill",
      }),
    );

    expect(registry.resolveTerminology("Paint Bucket").map((c) => c.id)).toEqual([
      "tool.fill",
    ]);
    // Case, spacing and separators fold into the same key.
    expect(registry.resolveTerminology("paint-bucket").map((c) => c.id)).toEqual([
      "tool.fill",
    ]);
    expect(registry.resolveTerminology("brush tool").map((c) => c.id)).toEqual([
      "tool.pen",
    ]);
    // Korean CSP wording resolves without transliteration.
    expect(registry.resolveTerminology("펜").map((c) => c.id)).toEqual([
      "tool.pen",
    ]);
    expect(
      registry.resolveTerminology("Paint", { vendor: "photoshop" }),
    ).toEqual([]);
    expect(
      registry.resolveTerminology("Paint", { vendor: "procreate" }).map((c) => c.id),
    ).toEqual(["tool.pen"]);
    expect(registry.matchTerminology("ColorDrop")[0]).toMatchObject({
      commandId: "tool.fill",
      vendor: "procreate",
    });
  });

  it("fuzzy terminology matches substrings and reports ambiguous terms", () => {
    const registry = new CommandRegistry();
    registry.register(
      command({ aliases: [{ vendor: "csp", term: "선택 범위" }] }),
    );
    registry.register(
      command({
        id: "select.marquee",
        aliases: [{ vendor: "photoshop", term: "선택 범위" }],
        helpNodeId: "help/select/marquee",
      }),
    );

    expect(registry.resolveTerminology("선택", { fuzzy: true }).map((c) => c.id)).toEqual([
      "tool.pen",
      "select.marquee",
    ]);
    expect(registry.ambiguousTerminology()).toEqual([
      { term: normalizeTerminologyTerm("선택 범위"), commandIds: ["tool.pen", "select.marquee"] },
    ]);
  });

  it("unregistering drops the command out of the terminology index too", () => {
    const registry = new CommandRegistry();
    const dispose = registry.register(command());
    expect(registry.resolveTerminology("Brush Tool")).toHaveLength(1);
    dispose();
    expect(registry.resolveTerminology("Brush Tool")).toHaveLength(0);
    expect(registry.get("tool.pen")).toBeNull();
  });

  it("availability is tri-state and carries a reason plus a help node", () => {
    const registry = new CommandRegistry();
    registry.register(
      command({
        availability: availableWhen((ctx) => ctx.flags?.hasSelection === true, {
          reason: "선택 영역이 없습니다.",
          helpNodeId: "help/select/how-to",
        }),
      }),
    );

    expect(registry.availabilityOf("tool.pen", context)).toEqual({
      state: "disabled",
      reason: "선택 영역이 없습니다.",
      helpNodeId: "help/select/how-to",
    });
    expect(
      registry.availabilityOf("tool.pen", { ...context, flags: { hasSelection: true } }),
    ).toEqual({ state: "enabled" });
  });

  it("hidden commands drop out of list() but disabled ones do too (only enabled render)", () => {
    const registry = new CommandRegistry();
    registry.register(command());
    registry.register(
      command({
        id: "tool.eraser",
        availability: () => ({ state: "hidden" }),
        helpNodeId: "help/tool/eraser",
      }),
    );
    expect(registry.list(context).map((c) => c.id)).toEqual(["tool.pen"]);
    expect(registry.ids()).toEqual(["tool.pen", "tool.eraser"]);
    expect(registry.size).toBe(2);
  });

  it("permissions gate execution before the command predicate runs", async () => {
    const registry = new CommandRegistry();
    const availability = vi.fn(alwaysAvailable);
    registry.register(
      command({
        id: "collaboration.approve",
        permissions: [{ id: "review.approve", scope: "doc-1" }],
        availability,
        helpNodeId: "help/collaboration/approve",
      }),
    );

    expect(registry.availabilityOf("collaboration.approve", context)).toEqual({
      state: "disabled",
      reason: "missing permission: review.approve",
      helpNodeId: "help/collaboration/approve",
    });
    expect(availability).not.toHaveBeenCalled();
    await expect(
      registry.execute("collaboration.approve", context),
    ).rejects.toThrow(CommandRegistryError);

    const granted = { ...context, grantedPermissions: ["review.approve"] };
    await expect(
      registry.execute("collaboration.approve", granted),
    ).resolves.toEqual({ status: "ok" });
  });

  it("preview only runs for enabled commands", () => {
    const registry = new CommandRegistry();
    const preview = vi.fn(() => ({ kind: "text" as const, summary: "10% 확대" }));
    registry.register(
      command({
        id: "view.zoom-in",
        preview,
        availability: availableWhen((ctx) => ctx.flags?.canZoom === true),
        helpNodeId: "help/view/zoom-in",
      }),
    );

    expect(registry.previewOf("view.zoom-in", context)).toBeNull();
    expect(preview).not.toHaveBeenCalled();
    expect(
      registry.previewOf("view.zoom-in", { ...context, flags: { canZoom: true } }),
    ).toEqual({ kind: "text", summary: "10% 확대" });
  });

  it("execute attaches an undo entry from the factory when the run did not provide one", async () => {
    const registry = new CommandRegistry();
    const undo = vi.fn();
    registry.register(
      command({
        id: "edit.duplicate",
        undo: () => ({ label: "복제 취소", undo }),
        helpNodeId: "help/edit/duplicate",
      }),
    );
    const result = await registry.execute("edit.duplicate", context);
    expect(result.undo?.label).toBe("복제 취소");
    await result.undo?.undo();
    expect(undo).toHaveBeenCalledOnce();
  });

  it("execute keeps an undo entry the command produced itself", async () => {
    const registry = new CommandRegistry();
    const factory = vi.fn(() => ({ label: "factory", undo: () => undefined }));
    registry.register(
      command({
        id: "edit.paste",
        execute: async () => ({
          status: "ok",
          undo: { label: "붙여넣기 취소", undo: () => undefined },
        }),
        undo: factory,
        helpNodeId: "help/edit/paste",
      }),
    );
    const result = await registry.execute("edit.paste", context);
    expect(result.undo?.label).toBe("붙여넣기 취소");
    expect(factory).not.toHaveBeenCalled();
  });

  it("search covers labels, keywords and vendor aliases", () => {
    const registry = new CommandRegistry();
    registry.register(command({ keywords: ["ink", "brush"] }));
    expect(registry.search(context, "Brush Tool").map((c) => c.id)).toEqual([
      "tool.pen",
    ]);
    expect(registry.search(context, "ink").map((c) => c.id)).toEqual(["tool.pen"]);
    expect(registry.search(context, "펜").map((c) => c.id)).toEqual(["tool.pen"]);
    expect(registry.search(context, "없는명령")).toEqual([]);
  });

  it("unknown ids fail loudly on every accessor", () => {
    const registry = new CommandRegistry();
    expect(() => registry.availabilityOf("nope.missing", context)).toThrow(
      CommandRegistryError,
    );
    expect(() => registry.previewOf("nope.missing", context)).toThrow(
      CommandRegistryError,
    );
  });
});
