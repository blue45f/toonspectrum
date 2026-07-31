/// <reference types="@cloudflare/vitest-pool-workers/types" />

declare namespace Cloudflare {
  interface Env {
    readonly REALTIME_ROOMS: DurableObjectNamespace;
    readonly REALTIME_TICKET_SECRET: string;
    readonly REALTIME_TICKET_ISSUER: string;
    readonly REALTIME_TICKET_AUDIENCE: string;
    readonly REALTIME_ALLOWED_ORIGINS?: string;
  }
}
