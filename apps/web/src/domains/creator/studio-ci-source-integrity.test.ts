import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { STUDIO_GENERATED_CITY_BG_SCENES } from "./studio-generated-2d-backgrounds-city";
import { STUDIO_GENERATED_INTERIOR_BG_SCENES } from "./studio-generated-2d-backgrounds-genre";
import { STUDIO_GENERATED_GENRE_BG_SCENES } from "./studio-generated-2d-backgrounds-interiors";
import { STUDIO_GENERATED_BG_SCENES } from "./studio-generated-2d-backgrounds";

/**
 * Guards the exact source-integrity regressions that previously broke every PR build:
 * a staged-but-unassembled panel module and swapped generated-background exports.
 */
describe("Studio CI source integrity", () => {
  it("ships the AI comic director as a real module instead of one-shot source fragments", async () => {
    const module = await import("./ai/StudioAiComicDirectorPanel");

    expect(module.StudioAiComicDirectorPanel).toBeTypeOf("function");
    expect(existsSync(resolve(process.cwd(), ".ai-director-parts"))).toBe(false);
    expect(
      existsSync(resolve(process.cwd(), ".github/workflows/assemble-ai-comic-director.yml")),
    ).toBe(false);
  });

  it("aggregates every generated background category in stable catalog order", () => {
    const expected = [
      ...STUDIO_GENERATED_CITY_BG_SCENES,
      ...STUDIO_GENERATED_GENRE_BG_SCENES,
      ...STUDIO_GENERATED_INTERIOR_BG_SCENES,
    ];

    expect(STUDIO_GENERATED_BG_SCENES.map((scene) => scene.id)).toEqual(
      expected.map((scene) => scene.id),
    );
    expect(new Set(STUDIO_GENERATED_BG_SCENES.map((scene) => scene.id)).size).toBe(
      STUDIO_GENERATED_BG_SCENES.length,
    );
    expect(Object.isFrozen(STUDIO_GENERATED_BG_SCENES)).toBe(true);
  });
});
