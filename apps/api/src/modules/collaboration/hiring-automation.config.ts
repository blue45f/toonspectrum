export interface HiringAutomationConfig { enabled: boolean; supported: boolean; tickMs: number; batch: number; leaseMs: number; maxAttempts: number; }
// Only the explicit in-app transport can be enabled. No credentials or paid transport.
export function hiringAutomationConfig(env: NodeJS.ProcessEnv = process.env): HiringAutomationConfig {
  const mode = env.CREATOR_HIRING_AUTOMATION;
  return { enabled: mode === "in-app-v1", supported: !mode || mode === "off" || mode === "in-app-v1", tickMs: 5000, batch: 2, leaseMs: 30000, maxAttempts: 5 };
}
export const HIRING_AUTOMATION_CONFIG = Symbol("HIRING_AUTOMATION_CONFIG");
