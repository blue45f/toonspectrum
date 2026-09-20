import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { z } from "zod";
import { STUDIO_ACOUSTIC_CONVERSATION_EVENT, studioConversationInvalidationSchema, type StudioConversationInvalidation } from "@toonspectrum/studio-project-model/world-conversation";
import { studioAcousticCoreBindingSchema, type StudioAcousticCoreBinding } from "@toonspectrum/studio-project-model/world-acoustic";
import { studioLivePrincipalFingerprint, type VerifiedSessionToken } from "../../server/session";
import type { StudioLiveGatewayHost } from "./studio-live-gateway-host";

const EVENT = "studio:internal:acoustic-binding:v1";
const requestSchema = z.object({ workId: z.string().min(1).max(160), connectionId: z.string().min(1).max(128), clientInstanceId: z.string().min(1).max(80),
  fingerprint: z.string().regex(/^[A-Za-z0-9_-]{43}$/u), sessionVersion: z.number().int().positive(), deadline: z.number().int().positive() }).strict();
type Request = z.infer<typeof requestSchema>;
type Receive = (request: Request) => Promise<StudioAcousticCoreBinding | null>;
interface NamespacePort {
  on(event: string, listener: (request: unknown, ack: (value: unknown) => void) => void): unknown;
  off(event: string, listener: (request: unknown, ack: (value: unknown) => void) => void): unknown;
  serverSideEmitWithAck(event: string, request: Request): Promise<unknown[]>;
  to(connectionId:string): {emit(event:string,payload:unknown):unknown};
}

/** Internal one-shot RPC only. Public room tickets and adapter-visible claims are insufficient. */
@Injectable()
export class StudioLiveAcousticBinding implements OnModuleDestroy {
  private namespace: NamespacePort | null = null;
  private receive: Receive | null = null;
  private readonly listener = (raw: unknown, ack: (value: unknown) => void) => {
    const parsed = requestSchema.safeParse(raw);
    const answer = (binding: StudioAcousticCoreBinding | null) => { try { ack({ binding }); } catch { /* requester left */ } };
    if (!parsed.success || parsed.data.deadline <= Date.now() || !this.receive) { answer(null); return; }
    void this.receive(parsed.data).then(answer, () => answer(null));
  };
  bind(namespace: unknown, receive: Receive): void {
    this.onModuleDestroy(); this.namespace = namespace as NamespacePort; this.receive = receive;
    this.namespace.on(EVENT, this.listener);
  }
  onModuleDestroy(): void { this.namespace?.off(EVENT, this.listener); this.namespace = null; this.receive = null; }
  notify(connectionId:string,event:StudioConversationInvalidation):void {
    // A targeted hint, never a broadcast of membership, private actors or permissions.
    try { this.namespace?.to(connectionId).emit(STUDIO_ACOUSTIC_CONVERSATION_EVENT,studioConversationInvalidationSchema.parse(event)); } catch { /* authoritative reads reconcile dropped hints */ }
  }
  async verify(principal: VerifiedSessionToken, workId: string, identity: { connectionId: string; clientInstanceId: string }): Promise<StudioAcousticCoreBinding | null> {
    const namespace = this.namespace, receive = this.receive;
    if (!namespace || !receive) return null;
    const request = requestSchema.parse({ connectionId:identity.connectionId,clientInstanceId:identity.clientInstanceId, workId, fingerprint: studioLivePrincipalFingerprint(principal.userId), sessionVersion: principal.sessionVersion, deadline: Date.now() + 2000 });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const binding = await Promise.race([(async () => {
        const local = await receive(request);
        if (local) return local.connectionId === request.connectionId && local.clientInstanceId === request.clientInstanceId && Date.now() < request.deadline ? local : null;
        const responses = await namespace.serverSideEmitWithAck(EVENT, request);
        const bindings: StudioAcousticCoreBinding[] = [];
        for (const response of responses) {
          const parsed = z.object({ binding: studioAcousticCoreBindingSchema.nullable() }).strict().safeParse(response);
          if (!parsed.success) return null;
          if (parsed.data.binding) {
            if (parsed.data.binding.connectionId !== request.connectionId || parsed.data.binding.clientInstanceId !== request.clientInstanceId) return null;
            bindings.push(parsed.data.binding);
          }
        }
        return bindings.length === 1 && Date.now() < request.deadline ? bindings[0]! : null;
      })(), new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 2000); timer.unref?.(); })]);
      return this.namespace === namespace && this.receive === receive && Date.now() < request.deadline ? binding : null;
    } catch { return null; } finally { if (timer) clearTimeout(timer); }
  }
}

/** Runs on the node owning the actual Socket object and its non-public authentication principal. */
export async function verifyLocalStudioAcousticBinding(host: StudioLiveGatewayHost, request: Request): Promise<StudioAcousticCoreBinding | null> {
  const socket = host.server.sockets.get(request.connectionId);
  if (!socket || request.deadline <= Date.now()) return null;
  const principal = host.socketAuthentication.principal(socket);
  if (!principal || principal.sessionVersion !== request.sessionVersion || studioLivePrincipalFingerprint(principal.userId) !== request.fingerprint) return null;
  const result = await host.runWithAuthorizedParticipant(socket, request.workId, false, true, (participant) => {
    if (participant.clientInstanceId !== request.clientInstanceId || !host.isSocketPrincipalCurrent(socket, principal, principal.userId) || Date.now() >= request.deadline) return null;
    return studioAcousticCoreBindingSchema.parse({ connectionId: participant.connectionId, clientInstanceId: participant.clientInstanceId, joinedAt: participant.joinedAt });
  });
  return result?.value ?? null;
}
