import { Injectable, OnModuleDestroy } from "@nestjs/common";

import {
  STUDIO_LIVE_INTER_SERVER_RELAY_EVENT,
  StudioLiveInterServerRelayResponseSchema,
} from "./studio-live.protocol";

import type {
  StudioLiveInterServerRelayRequest,
  StudioLiveInterServerRelayResponse,
  StudioLiveNamespace,
} from "./studio-live.protocol";

export const STUDIO_LIVE_RELAY_RPC_TIMEOUT_MS = 2_000;

type StudioLiveInterServerRelayReceiver = (request: unknown) => Promise<boolean>;

/**
 * Owns Socket.IO inter-server relay registration and one-shot request/ACK mechanics. Participant,
 * session, voice and candidate authorization remain in the gateway receiver callback.
 */
@Injectable()
export class StudioLiveInterServerRelayTransport implements OnModuleDestroy {
  private namespace: StudioLiveNamespace | null = null;
  private receive: StudioLiveInterServerRelayReceiver | null = null;
  private readonly listener = (
    request: StudioLiveInterServerRelayRequest,
    ack: (response: StudioLiveInterServerRelayResponse) => void
  ): void => {
    let acknowledged = false;
    const respond = (delivered: boolean): void => {
      if (acknowledged) return;
      acknowledged = true;
      try {
        ack({ delivered });
      } catch {
        // A remote ACK callback cannot affect receiver-owned authorization or local socket state.
      }
    };
    const receive = this.receive;
    if (!receive) {
      respond(false);
      return;
    }
    try {
      void receive(request).then(respond, () => respond(false));
    } catch {
      respond(false);
    }
  };

  bind(
    namespace: StudioLiveNamespace,
    receive: StudioLiveInterServerRelayReceiver
  ): void {
    this.unbind();
    this.namespace = namespace;
    this.receive = receive;
    namespace.on(STUDIO_LIVE_INTER_SERVER_RELAY_EVENT, this.listener);
  }

  async send(request: StudioLiveInterServerRelayRequest): Promise<boolean> {
    const namespace = this.namespace;
    if (!namespace || typeof namespace.serverSideEmitWithAck !== "function") return false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const responses = await Promise.race([
        namespace.serverSideEmitWithAck(
          STUDIO_LIVE_INTER_SERVER_RELAY_EVENT,
          request
        ),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error("studio peer relay RPC timed out")),
            STUDIO_LIVE_RELAY_RPC_TIMEOUT_MS
          );
          timeout.unref?.();
        }),
      ]);
      let delivered = 0;
      for (const response of responses) {
        const parsed = StudioLiveInterServerRelayResponseSchema.safeParse(response);
        if (!parsed.success) return false;
        if (parsed.data.delivered) delivered += 1;
      }
      return delivered === 1;
    } catch {
      return false;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  onModuleDestroy(): void {
    this.unbind();
  }

  private unbind(): void {
    this.namespace?.off(STUDIO_LIVE_INTER_SERVER_RELAY_EVENT, this.listener);
    this.namespace = null;
    this.receive = null;
  }
}
