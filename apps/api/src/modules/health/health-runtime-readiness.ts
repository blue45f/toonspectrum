import { Inject, Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { PostgresAdapter } from "@socket.io/postgres-adapter";

import { STUDIO_LIVE_REQUIRED_NAMESPACES } from "../../realtime/studio-postgres-pubsub";
import { StudioLiveGateway } from "../creator/studio-live.gateway";

import type { StudioLivePostgresListenerStatusProvider } from "../../realtime/studio-postgres-pubsub";

export const HEALTH_RUNTIME_READINESS = Symbol("HEALTH_RUNTIME_READINESS");

export interface HealthRuntimeReadiness {
  isStudioLivePostgresNamespaceReady(): boolean;
}

interface StudioLiveNamespaceLike {
  readonly name: string;
  readonly adapter: unknown;
}

export function isPostgresBackedStudioLiveNamespace(
  namespace: StudioLiveNamespaceLike | null | undefined,
): boolean {
  if (
    namespace?.name !== STUDIO_LIVE_REQUIRED_NAMESPACES[1] ||
    !(namespace.adapter instanceof PostgresAdapter)
  ) {
    return false;
  }
  const statusProvider =
    namespace.adapter as Partial<StudioLivePostgresListenerStatusProvider>;
  if (
    typeof statusProvider.getStudioLivePostgresListenerStatus !==
    "function"
  ) {
    return false;
  }
  try {
    const status =
      statusProvider.getStudioLivePostgresListenerStatus();
    return status === "active" || status === "reconnecting";
  } catch {
    return false;
  }
}

/**
 * The PostgreSQL adapter factory performs the expensive LISTEN/NOTIFY and attachment round-trip
 * preflight before the long-running server starts listening. Runtime readiness additionally
 * consumes the lifecycle-safe listener status, allowing a bounded transient reconnect grace but
 * rejecting stale reconnect loops and closed transports.
 */
@Injectable()
export class NestHealthRuntimeReadiness implements HealthRuntimeReadiness {
  constructor(
    @Inject(ModuleRef)
    private readonly moduleRef: ModuleRef,
  ) {}

  isStudioLivePostgresNamespaceReady(): boolean {
    try {
      const gateway = this.moduleRef.get(StudioLiveGateway, {
        strict: false,
      });
      return isPostgresBackedStudioLiveNamespace(gateway.server);
    } catch {
      return false;
    }
  }
}
