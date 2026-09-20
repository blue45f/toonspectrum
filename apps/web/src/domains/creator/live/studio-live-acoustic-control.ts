import { studioAcousticCoreBindingSchema, type StudioAcousticCoreBinding } from "@toonspectrum/studio-project-model/world-acoustic";
import { studioConversationInvalidationSchema, type StudioConversationInvalidation } from "@toonspectrum/studio-project-model/world-conversation";

/** A join-confirmed Core identity, never a door, consent or media grant. */
export type StudioLiveAcousticCoreBinding = Readonly<Pick<StudioAcousticCoreBinding, "connectionId" | "clientInstanceId">>;
const bindingSchema = studioAcousticCoreBindingSchema.omit({ joinedAt: true });

export function studioLiveAcousticJoinBinding(value: unknown, expectedClientInstanceId: string): StudioLiveAcousticCoreBinding | null {
  const parsed = bindingSchema.safeParse(value);
  return parsed.success && parsed.data.clientInstanceId === expectedClientInstanceId ? Object.freeze(parsed.data) : null;
}

/** Untrusted hints invalidate cached reads only; extra fields never confer authority. */
export function parseStudioLiveAcousticInvalidation(value: unknown, workId: string): StudioConversationInvalidation | null {
  const parsed = studioConversationInvalidationSchema.safeParse(value);
  return parsed.success && parsed.data.workId === workId ? Object.freeze(parsed.data) : null;
}
