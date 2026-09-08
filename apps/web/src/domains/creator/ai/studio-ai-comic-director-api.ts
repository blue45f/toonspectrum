import {
  createStudioAiComicDirectorSession,
  hydrateStudioAiComicDirectorSession,
  type StudioAiComicDirectorApproval,
  type StudioAiComicDirectorJob,
  type StudioAiComicDirectorSessionDocument,
  type StudioAiVisualBibleDocument,
} from "./studio-ai-comic-director-session";

import { withCsrfProtection } from "@/shared/lib/csrf";
import { useApp } from "@/shared/lib/store";

export type StudioAiComicDirectorApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly code:
        | "not_authenticated"
        | "conflict"
        | "not_found"
        | "network_error"
        | "http_error"
        | "parse_error";
      readonly message: string;
      readonly currentRevision?: number;
    };

export interface StudioAiComicDirectorApiClient {
  createSession(
    session: StudioAiComicDirectorSessionDocument,
  ): Promise<StudioAiComicDirectorApiResult<StudioAiComicDirectorSessionDocument>>;
  getSession(
    sessionId: string,
  ): Promise<StudioAiComicDirectorApiResult<StudioAiComicDirectorSessionDocument>>;
  updateSession(
    session: StudioAiComicDirectorSessionDocument,
    previousRevision: number,
  ): Promise<StudioAiComicDirectorApiResult<StudioAiComicDirectorSessionDocument>>;
  appendVisualBibleRevision(
    sessionId: string,
    bible: StudioAiVisualBibleDocument,
  ): Promise<StudioAiComicDirectorApiResult<StudioAiVisualBibleDocument>>;
  createJob(
    sessionId: string,
    input: {
      readonly operationId: string;
      readonly kind: StudioAiComicDirectorJob["kind"];
      readonly progressTotal: number;
      readonly payload?: Readonly<Record<string, unknown>>;
    },
  ): Promise<StudioAiComicDirectorApiResult<StudioAiComicDirectorJob>>;
  updateJob(
    sessionId: string,
    jobId: string,
    patch: Partial<StudioAiComicDirectorJob> & {
      readonly eventType?: string;
      readonly eventPayload?: Readonly<Record<string, unknown>>;
    },
  ): Promise<StudioAiComicDirectorApiResult<StudioAiComicDirectorJob>>;
  createArtifact(
    sessionId: string,
    input: Readonly<Record<string, unknown>>,
  ): Promise<StudioAiComicDirectorApiResult<Readonly<Record<string, unknown>>>>;
  createApproval(
    sessionId: string,
    expectedRevision: number,
    candidateDigest: string,
  ): Promise<StudioAiComicDirectorApiResult<StudioAiComicDirectorApproval>>;
}

interface ServerSessionRecord {
  readonly id: string;
  readonly workId: string | null;
  readonly remixSourceWorkId: string | null;
  readonly title: string;
  readonly stage: StudioAiComicDirectorSessionDocument["stage"];
  readonly status: StudioAiComicDirectorSessionDocument["status"];
  readonly revision: number;
  readonly baseDocumentRevision: string | null;
  readonly payload: Record<string, unknown>;
  readonly updatedAt: string;
}

interface ServerVisualBibleRevision {
  readonly id: string;
  readonly revision: number;
  readonly status: StudioAiVisualBibleDocument["status"];
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

interface ServerSessionBundle {
  readonly session: ServerSessionRecord;
  readonly visualBibleRevisions?: readonly ServerVisualBibleRevision[];
  readonly jobs?: readonly StudioAiComicDirectorJob[];
  readonly approval?: StudioAiComicDirectorApproval | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function serverMessage(value: unknown, fallback: string): string {
  const body = record(value);
  if (!body) return fallback;
  const message = body.message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message)) {
    const text = message
      .filter((item): item is string => typeof item === "string")
      .join(" ");
    if (text) return text;
  }
  return fallback;
}

function sessionFromServer(
  bundle: ServerSessionBundle,
): StudioAiComicDirectorSessionDocument {
  const sourcePayload = record(bundle.session.payload) ?? {};
  const local = hydrateStudioAiComicDirectorSession({
    version: 1,
    id: bundle.session.id,
    workId: bundle.session.workId,
    remixSourceWorkId: bundle.session.remixSourceWorkId,
    title: bundle.session.title,
    entrySource: sourcePayload.entrySource,
    stage: bundle.session.stage,
    status: bundle.session.status,
    revision: bundle.session.revision,
    baseDocumentRevision: bundle.session.baseDocumentRevision,
    storyText: sourcePayload.storyText,
    characterDescription: sourcePayload.characterDescription,
    scenes: sourcePayload.scenes,
    visualBible:
      bundle.visualBibleRevisions?.[0]?.payload
      ?? sourcePayload.visualBible,
    jobs: bundle.jobs ?? sourcePayload.jobs,
    approval: bundle.approval ?? sourcePayload.approval,
    updatedAt: bundle.session.updatedAt,
  });
  return local ?? createStudioAiComicDirectorSession({ id: bundle.session.id });
}

function sessionPayload(session: StudioAiComicDirectorSessionDocument) {
  return {
    entrySource: session.entrySource,
    storyText: session.storyText,
    characterDescription: session.characterDescription,
    scenes: session.scenes,
    visualBible: session.visualBible,
  };
}

export function createStudioAiComicDirectorApiClient(input: {
  /** Signed ToonSpectrum session token accepted through x-user-id. */
  readonly sessionToken?: string | null;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
} = {}): StudioAiComicDirectorApiClient {
  const baseUrl = (input.baseUrl ?? "/api/studio-ai/comic-director").replace(/\/$/u, "");
  const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis);
  // Local edits can advance the client session revision several times before one cloud save. Keep
  // the last acknowledged server revision separately so optimistic locking never compares against
  // a client-only revision.
  const remoteRevisions = new Map<string, number>();

  async function request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<StudioAiComicDirectorApiResult<T>> {
    const sessionToken = input.sessionToken?.trim()
      || useApp.getState().sessionToken?.trim()
      || null;
    if (!sessionToken) {
      return {
        ok: false,
        code: "not_authenticated",
        message: "로그인하면 AI 코믹 디렉터 세션을 클라우드에 저장할 수 있어요.",
      };
    }
    let response: Response;
    try {
      response = await fetchImpl(
        `${baseUrl}${path}`,
        withCsrfProtection({
          credentials: "include",
          ...init,
          headers: {
            "Content-Type": "application/json",
            "x-user-id": sessionToken,
            ...(init.headers ?? {}),
          },
        }),
      );
    } catch {
      return {
        ok: false,
        code: "network_error",
        message: "AI 코믹 디렉터 저장 서버에 연결하지 못했어요.",
      };
    }
    let body: unknown = null;
    try {
      const text = await response.text();
      body = text ? JSON.parse(text) : null;
    } catch {
      return {
        ok: false,
        code: "parse_error",
        message: "AI 코믹 디렉터 서버 응답을 해석하지 못했어요.",
      };
    }
    if (!response.ok) {
      const parsed = record(body);
      return {
        ok: false,
        code:
          response.status === 409
            ? "conflict"
            : response.status === 404
              ? "not_found"
              : "http_error",
        message: serverMessage(
          body,
          `요청이 실패했습니다 (HTTP ${response.status}).`,
        ),
        ...(typeof parsed?.currentRevision === "number"
          ? { currentRevision: parsed.currentRevision }
          : {}),
      };
    }
    return { ok: true, data: body as T };
  }

  return {
    async createSession(session) {
      const result = await request<ServerSessionRecord>("/sessions", {
        method: "POST",
        body: JSON.stringify({
          id: session.id,
          workId: session.workId,
          remixSourceWorkId: session.remixSourceWorkId,
          title: session.title,
          stage: session.stage,
          status: session.status,
          baseDocumentRevision: session.baseDocumentRevision,
          payload: sessionPayload(session),
        }),
      });
      if (!result.ok) return result;
      remoteRevisions.set(result.data.id, result.data.revision);
      return {
        ok: true,
        data: sessionFromServer({ session: result.data }),
      };
    },

    async getSession(sessionId) {
      const result = await request<ServerSessionBundle>(
        `/sessions/${encodeURIComponent(sessionId)}`,
      );
      if (!result.ok) return result;
      remoteRevisions.set(sessionId, result.data.session.revision);
      return { ok: true, data: sessionFromServer(result.data) };
    },

    async updateSession(session, previousRevision) {
      const expectedRevision = remoteRevisions.get(session.id) ?? previousRevision;
      const result = await request<ServerSessionRecord>(
        `/sessions/${encodeURIComponent(session.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedRevision,
            title: session.title,
            stage: session.stage,
            status: session.status,
            baseDocumentRevision: session.baseDocumentRevision,
            payload: sessionPayload(session),
          }),
        },
      );
      if (!result.ok) return result;
      remoteRevisions.set(session.id, result.data.revision);
      return {
        ok: true,
        data: sessionFromServer({ session: result.data }),
      };
    },

    async appendVisualBibleRevision(sessionId, bible) {
      const result = await request<ServerVisualBibleRevision>(
        `/sessions/${encodeURIComponent(sessionId)}/visual-bible`,
        {
          method: "POST",
          body: JSON.stringify({ status: bible.status, payload: bible }),
        },
      );
      return result.ok
        ? {
            ok: true,
            data: {
              ...bible,
              revision: result.data.revision,
              status: result.data.status,
              updatedAt: result.data.createdAt,
            },
          }
        : result;
    },

    createJob(sessionId, job) {
      return request<StudioAiComicDirectorJob>(
        `/sessions/${encodeURIComponent(sessionId)}/jobs`,
        { method: "POST", body: JSON.stringify(job) },
      );
    },

    updateJob(sessionId, jobId, patch) {
      return request<StudioAiComicDirectorJob>(
        `/sessions/${encodeURIComponent(sessionId)}/jobs/${encodeURIComponent(jobId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: patch.status,
            progressDone: patch.progressDone,
            progressTotal: patch.progressTotal,
            result: patch.result,
            error: patch.error,
            leaseMs:
              patch.status === "running"
                ? 120_000
                : patch.status
                  ? null
                  : undefined,
            eventType: patch.eventType,
            eventPayload: patch.eventPayload,
          }),
        },
      );
    },

    createArtifact(sessionId, artifact) {
      return request<Readonly<Record<string, unknown>>>(
        `/sessions/${encodeURIComponent(sessionId)}/artifacts`,
        { method: "POST", body: JSON.stringify(artifact) },
      );
    },

    createApproval(sessionId, expectedRevision, candidateDigest) {
      return request<StudioAiComicDirectorApproval>(
        `/sessions/${encodeURIComponent(sessionId)}/approval`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: remoteRevisions.get(sessionId) ?? expectedRevision,
            candidateDigest,
            payload: { source: "studio-ai-comic-director" },
          }),
        },
      );
    },
  };
}
