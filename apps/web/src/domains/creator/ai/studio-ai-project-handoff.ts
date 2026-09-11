import type { StudioAiAssistToolId } from "./studio-ai-assist-ux";

export const STUDIO_AI_PROJECT_HANDOFF_STORAGE_KEY = "toonstudio:ai-project-handoff:v1";
export const STUDIO_AI_PROJECT_HANDOFF_TTL_MS = 15 * 60 * 1000;

export interface StudioAiProjectHandoff {
  readonly version: 1;
  readonly projectId: string;
  readonly documentId: string | null;
  readonly tool: StudioAiAssistToolId;
  readonly prompt: string;
  readonly requestedAt: string;
  readonly expiresAt: string;
  readonly source: "project-shell" | "story" | "review" | "export";
}

export interface CreateStudioAiProjectHandoffInput {
  readonly projectId: string;
  readonly documentId?: string | null;
  readonly tool: StudioAiAssistToolId;
  readonly prompt: string;
  readonly source: StudioAiProjectHandoff["source"];
  readonly now?: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTool(value: unknown): value is StudioAiAssistToolId {
  return value === "background"
    || value === "character"
    || value === "composition"
    || value === "dialogue"
    || value === "palette";
}

function isSource(value: unknown): value is StudioAiProjectHandoff["source"] {
  return value === "project-shell" || value === "story" || value === "review" || value === "export";
}

/** Build a bounded, non-durable request that can be consumed by the existing editor AI hub. */
export function createStudioAiProjectHandoff(
  input: CreateStudioAiProjectHandoffInput,
): StudioAiProjectHandoff {
  const projectId = input.projectId.trim();
  const prompt = input.prompt.trim();
  if (!projectId || !prompt) throw new Error("AI handoff requires a project and prompt.");
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + STUDIO_AI_PROJECT_HANDOFF_TTL_MS);
  return Object.freeze({
    version: 1,
    projectId,
    documentId: input.documentId?.trim() || null,
    tool: input.tool,
    prompt,
    requestedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    source: input.source,
  });
}

/** Persist only a short-lived launch intent; documents and generated output remain in canonical stores. */
export function writeStudioAiProjectHandoff(
  storage: Pick<Storage, "setItem">,
  handoff: StudioAiProjectHandoff,
): void {
  storage.setItem(STUDIO_AI_PROJECT_HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
}

/** Read and atomically remove a handoff so refreshes cannot execute the same request twice. */
export function consumeStudioAiProjectHandoff(
  storage: Pick<Storage, "getItem" | "removeItem">,
  expectedProjectId: string,
  now = new Date(),
): StudioAiProjectHandoff | null {
  const raw = storage.getItem(STUDIO_AI_PROJECT_HANDOFF_STORAGE_KEY);
  if (!raw) return null;
  storage.removeItem(STUDIO_AI_PROJECT_HANDOFF_STORAGE_KEY);

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)
    || value.version !== 1
    || typeof value.projectId !== "string"
    || value.projectId !== expectedProjectId
    || !(typeof value.documentId === "string" || value.documentId === null)
    || !isTool(value.tool)
    || typeof value.prompt !== "string"
    || !value.prompt.trim()
    || typeof value.requestedAt !== "string"
    || typeof value.expiresAt !== "string"
    || !isSource(value.source)) {
    return null;
  }
  const expiresAt = Date.parse(value.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return null;
  return Object.freeze({
    version: 1,
    projectId: value.projectId,
    documentId: value.documentId,
    tool: value.tool,
    prompt: value.prompt.trim(),
    requestedAt: value.requestedAt,
    expiresAt: value.expiresAt,
    source: value.source,
  });
}
