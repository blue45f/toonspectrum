/**
 * Availability helpers. §15.4 makes `availability` a function returning a
 * tri-state, not a boolean, because a disabled row still has to explain itself
 * (`reason`) and still has to be findable in the palette — only `hidden` drops
 * out of the surface entirely.
 */

import type { Availability, CommandContext } from "./types";

const ENABLED: Availability = { state: "enabled" };

export function alwaysAvailable(): Availability {
  return ENABLED;
}

export interface AvailableWhenOptions {
  /** Copy shown when the predicate fails. */
  reason?: string;
  /** Help node for the disabled state. */
  helpNodeId?: string;
  /** `hidden` removes the row instead of greying it. Defaults to `disabled`. */
  fallback?: "disabled" | "hidden";
}

/** Wrap a boolean predicate into the §15.4 tri-state. */
export function availableWhen(
  predicate: (context: CommandContext) => boolean,
  options: AvailableWhenOptions = {},
): (context: CommandContext) => Availability {
  const fallback: Availability = {
    state: options.fallback ?? "disabled",
    ...(options.reason === undefined ? {} : { reason: options.reason }),
    ...(options.helpNodeId === undefined
      ? {}
      : { helpNodeId: options.helpNodeId }),
  };
  return (context) => (predicate(context) ? ENABLED : fallback);
}
