import { describe, expect, it } from "vitest";
import { studioWorldManifestSchema, studioWorldInteractionRuleSchema } from "@toonspectrum/studio-project-model/world-publication";

import { DEFAULT_STUDIO_WORLD_MANIFEST, studioWorldInteractions } from "./studio-virtual-space-world-manifest";
import { evaluateStudioWorldInteraction } from "./studio-world-interaction-rule";
import { parseStudioWorldAuthoringImport, studioWorldManifestToTiledMap } from "./studio-virtual-space-world-authoring";

const target = DEFAULT_STUDIO_WORLD_MANIFEST.interactions.find((item) => item.action === "review")!;
const rule = { id: "safe-rule", interactionId: target.id, trigger: "explicit-use" as const, activities: ["available" as const], action: "review" as const, messageKo: "검토 도구를 엽니다", messageEn: "Open the review tool" };
const world = { ...DEFAULT_STUDIO_WORLD_MANIFEST, interactionRules: [rule] };
describe("explicit registered world actions", () => {
  it("preserves existing unruled actions and never executes a rule during evaluation", () => {
    expect(evaluateStudioWorldInteraction(DEFAULT_STUDIO_WORLD_MANIFEST, target, "available")).toEqual({ kind: "direct", action: "review" });
    expect(evaluateStudioWorldInteraction(world, target, "available")).toEqual({ kind: "confirm", rule });
    expect(evaluateStudioWorldInteraction(world, target, "focused")).toEqual({ kind: "blocked", rule });
  });
  it("rejects arbitrary jobs, scripts, unknown targets and duplicate activation conditions", () => {
    expect(studioWorldInteractionRuleSchema.safeParse({ ...rule, script: "anything" }).success).toBe(false);
    expect(studioWorldInteractionRuleSchema.safeParse({ ...rule, trigger: "automatic" }).success).toBe(false);
    expect(studioWorldInteractionRuleSchema.safeParse({ ...rule, action: "start-microphone" }).success).toBe(false);
    expect(studioWorldManifestSchema.safeParse({ ...world, interactionRules: [{ ...rule, interactionId: "absent" }] }).success).toBe(false);
    expect(studioWorldManifestSchema.safeParse({ ...world, interactionRules: [rule, { ...rule, id: "duplicate-target" }] }).success).toBe(false);
    expect(evaluateStudioWorldInteraction(world, { ...target, action: "assistant" }, "available")).toEqual({ kind: "invalid" });
  });
  it("keeps rule data through Tiled, without inheriting unreferenced older rules", () => {
    const restored = parseStudioWorldAuthoringImport(JSON.stringify(studioWorldManifestToTiledMap(world)), DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(restored.interactionRules).toEqual([rule]);
    const legacy = parseStudioWorldAuthoringImport(JSON.stringify(studioWorldManifestToTiledMap(DEFAULT_STUDIO_WORLD_MANIFEST)), world);
    expect(legacy.interactionRules).toBeUndefined();
    expect(evaluateStudioWorldInteraction(restored, studioWorldInteractions(restored).find((item) => item.id === target.id)!, "away").kind).toBe("blocked");
  });
});
