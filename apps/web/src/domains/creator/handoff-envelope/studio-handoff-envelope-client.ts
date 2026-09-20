import { studioHandoffEnvelopeCreateSchema, studioHandoffEnvelopePrepareSchema, studioHandoffEnvelopeViewSchema, studioHandoffEnvelopeListSchema,
  studioHandoffEnvelopeActionSchema, studioHandoffEnvelopeAcceptSchema, type StudioHandoffEnvelopeCreate, type StudioHandoffEnvelopeAction,
  type StudioHandoffEnvelopeView } from "@toonspectrum/studio-project-model";
import { api, isHttpError } from "@/infrastructure/api";
/** Only a definitive server rejection can discard a pending mutation identity. */
export class StudioHandoffClientError extends Error {
  constructor(readonly reason: "denied" | "missing" | "changed" | "invalid") { super(reason); }
}
/** A successful HTTP response can be malformed after the server committed the write. */
export class StudioHandoffResponseError extends Error {
  constructor() { super("invalid-response"); }
}
const base = (workId: string) => `/creator/works/${encodeURIComponent(workId)}/handoff-envelopes`;
async function call(path: string, signal: AbortSignal, body?: unknown) {
  try { return body === undefined ? await api.get(path, { signal, retry: 0 }) : await api.post(path, body, { signal, retry: 0 }); }
  catch (error) {
    if (isHttpError(error)) {
      if ([401, 403].includes(error.response.status)) throw new StudioHandoffClientError("denied");
      if (error.response.status === 404) throw new StudioHandoffClientError("missing");
      if (error.response.status === 409) throw new StudioHandoffClientError("changed");
      if ([400, 422].includes(error.response.status)) throw new StudioHandoffClientError("invalid");
    }
    throw error;
  }
}
function view(raw: unknown, workId: string, id: string): StudioHandoffEnvelopeView {
  const result = studioHandoffEnvelopeViewSchema.safeParse(raw);
  if (!result.success || result.data.envelope.workId !== workId || result.data.envelope.id !== id) throw new StudioHandoffResponseError();
  return result.data;
}
export const studioHandoffClient = {
  async prepare(workId: string, taskId: string, signal: AbortSignal) {
    const raw = await call(`/creator/works/${encodeURIComponent(workId)}/production-tasks/${encodeURIComponent(taskId)}/handoff-envelope`, signal);
    const result = studioHandoffEnvelopePrepareSchema.safeParse(raw);
    if (!result.success || result.data.workId !== workId || result.data.taskId !== taskId) throw new StudioHandoffResponseError();
    return result.data;
  },
  async list(workId: string, cursor: string | null, signal: AbortSignal) {
    return studioHandoffEnvelopeListSchema.parse(await call(`${base(workId)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, signal));
  },
  async read(workId: string, id: string, signal: AbortSignal) { return view(await call(`${base(workId)}/${encodeURIComponent(id)}`, signal), workId, id); },
  async create(workId: string, input: StudioHandoffEnvelopeCreate, signal: AbortSignal) {
    return view(await call(base(workId), signal, studioHandoffEnvelopeCreateSchema.parse(input)), workId, input.envelopeId);
  },
  async act(workId: string, id: string, phase: "open" | "accept" | "cancel", input: StudioHandoffEnvelopeAction, signal: AbortSignal) {
    const body = phase === "accept" ? studioHandoffEnvelopeAcceptSchema.parse({ ...input, confirmed: true }) : studioHandoffEnvelopeActionSchema.parse(input);
    return view(await call(`${base(workId)}/${encodeURIComponent(id)}/${phase}`, signal, body), workId, id);
  },
};
