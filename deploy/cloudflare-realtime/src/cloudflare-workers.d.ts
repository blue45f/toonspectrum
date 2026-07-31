declare module "cloudflare:workers" {
  export const env: import("./runtime-types").RealtimeWorkerEnv;

  export class DurableObject<Environment = unknown> {
    constructor(
      context: import("./runtime-types").DurableObjectStateLike,
      environment: Environment,
    );

    protected readonly ctx: import("./runtime-types").DurableObjectStateLike;
    protected readonly env: Environment;
  }
}
