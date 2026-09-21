import { studioWorldInteractionRuleSchema, type StudioWorldInteractionRule } from "@toonspectrum/studio-project-model/world-publication";
import type { StudioVirtualSpaceActivity } from "./studio-virtual-space-model";
import { studioWorldInteractions, type StudioVirtualSpaceWorldManifest, type StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";

export type WorldInteractionEvaluation = { readonly kind: "direct"; readonly action: StudioWorldInteractionDefinition["action"] }
  | { readonly kind: "confirm" | "blocked"; readonly rule: StudioWorldInteractionRule }
  | { readonly kind: "invalid" };
/** A local explicit-use rule selects an existing tool, never permissions, script or network jobs. */
export function evaluateStudioWorldInteraction(world: StudioVirtualSpaceWorldManifest, interaction: StudioWorldInteractionDefinition,
  activity: StudioVirtualSpaceActivity): WorldInteractionEvaluation {
  const actual = studioWorldInteractions(world).find((item) => item.id === interaction.id);
  if (!actual || actual.action !== interaction.action) return { kind: "invalid" };
  const rules = world.interactionRules?.filter((rule) => rule.interactionId === interaction.id) ?? [];
  if (!rules.length) return { kind: "direct", action: actual.action };
  if (rules.length !== 1) return { kind: "invalid" };
  const parsed = studioWorldInteractionRuleSchema.safeParse(rules[0]);
  if (!parsed.success) return { kind: "invalid" };
  return { kind: parsed.data.activities.includes(activity) ? "confirm" : "blocked", rule: parsed.data };
}
