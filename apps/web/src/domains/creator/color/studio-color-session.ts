import { normalizeHexColor } from "../studio-color-utils";

export interface StudioColorSession {
  readonly targetKey: string;
  readonly initialColor: string;
  readonly color: string;
  readonly raw: string;
  readonly valid: boolean;
}

export function beginStudioColorSession(targetKey: string, value: string): StudioColorSession {
  const color = normalizeHexColor(value) ?? "#000000";
  return { targetKey, initialColor: color, color, raw: color, valid: true };
}

/** Local draft only: preserve incomplete six-digit input rather than replacing it. */
export function editStudioColorSession(session: StudioColorSession, raw: string): StudioColorSession {
  const normalized = normalizeHexColor(raw.trim());
  return { ...session, raw, color: normalized ?? session.color, valid: normalized !== null };
}

export type StudioColorCommitResult =
  | { readonly status: "invalid" | "stale" | "unchanged" }
  | { readonly status: "commit"; readonly color: string };

export function resolveStudioColorCommit(session: StudioColorSession, targetKey: string, value: string): StudioColorCommitResult {
  if (session.targetKey !== targetKey || session.initialColor !== (normalizeHexColor(value) ?? "#000000")) return { status: "stale" };
  if (!session.valid) return { status: "invalid" };
  return session.color === session.initialColor ? { status: "unchanged" } : { status: "commit", color: session.color };
}
