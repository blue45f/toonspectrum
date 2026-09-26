import {
  UpstashRestCoordinationPort,
  type UpstashCoordinationRuntime,
} from "./upstash-coordination.client";
import {
  resolveUpstashCoordinationConfig,
  type UpstashCoordinationConfig,
} from "./upstash-coordination.config";

export function createDefaultUpstashCoordinationRuntime(): UpstashCoordinationRuntime {
  return {
    fetch: globalThis.fetch.bind(globalThis),
  };
}

export function createUpstashCoordinationPort(
  config: UpstashCoordinationConfig,
  runtime: UpstashCoordinationRuntime =
    createDefaultUpstashCoordinationRuntime()
): UpstashRestCoordinationPort {
  return new UpstashRestCoordinationPort(config, runtime);
}

/**
 * The caller must omit the feature module when this returns `null`. An absent environment never
 * creates a process-local substitute, because local state would falsely appear cross-host safe.
 */
export function createUpstashCoordinationPortFromEnvironment(
  environment: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>,
  runtime: UpstashCoordinationRuntime =
    createDefaultUpstashCoordinationRuntime()
): UpstashRestCoordinationPort | null {
  const config = resolveUpstashCoordinationConfig(environment);
  return config ? createUpstashCoordinationPort(config, runtime) : null;
}
