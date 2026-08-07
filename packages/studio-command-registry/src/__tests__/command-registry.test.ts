import { describe, expect, it } from "vitest";

import { CommandRegistry, CommandRegistryError } from "../index";

import type { CommandContext } from "../index";

const context: CommandContext = {
  workspace: "comic",
  services: new Map(),
};

describe("CommandRegistry", () => {
  it("registers namespaced commands and rejects duplicates/bad ids", () => {
    const registry = new CommandRegistry();
    registry.register({
      id: "scene.add-stroke",
      title: "Add Stroke",
      category: "scene",
      run: () => undefined,
    });
    expect(() =>
      registry.register({
        id: "scene.add-stroke",
        title: "Duplicate",
        category: "scene",
        run: () => undefined,
      }),
    ).toThrow(CommandRegistryError);
    expect(() =>
      registry.register({
        id: "NotNamespaced",
        title: "Bad",
        category: "scene",
        run: () => undefined,
      }),
    ).toThrow(CommandRegistryError);
  });

  it("filters by enablement and searches by keyword", async () => {
    const registry = new CommandRegistry();
    let ran = 0;
    registry.register({
      id: "comic.panel.create",
      title: "컷 만들기",
      category: "comic",
      keywords: ["panel", "cut"],
      when: (ctx) => ctx.workspace === "comic",
      run: () => {
        ran += 1;
      },
    });
    registry.register({
      id: "animation.onion-skin.toggle",
      title: "어니언 스킨",
      category: "animation",
      when: (ctx) => ctx.workspace === "animation",
      run: () => undefined,
    });

    expect(registry.list(context).map((c) => c.id)).toEqual(["comic.panel.create"]);
    expect(registry.search(context, "cut").map((c) => c.id)).toEqual([
      "comic.panel.create",
    ]);
    await registry.execute("comic.panel.create", context);
    expect(ran).toBe(1);
    await expect(
      registry.execute("animation.onion-skin.toggle", context),
    ).rejects.toThrow(CommandRegistryError);
  });

  it("unregister disposer removes the command", () => {
    const registry = new CommandRegistry();
    const dispose = registry.register({
      id: "tmp.command",
      title: "Temp",
      category: "tmp",
      run: () => undefined,
    });
    dispose();
    expect(registry.get("tmp.command")).toBeNull();
  });
});
