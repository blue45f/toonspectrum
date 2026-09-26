import type { UpstashQStashRuntime } from "./upstash-qstash.client";

export function createDefaultUpstashQStashRuntime(): UpstashQStashRuntime {
  return {
    fetch: globalThis.fetch.bind(globalThis),
  };
}
