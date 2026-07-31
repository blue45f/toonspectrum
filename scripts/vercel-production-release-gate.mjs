import { fileURLToPath } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const VERCEL_ENVIRONMENTS = new Set(["development", "preview", "production"]);
export const VERCEL_RELEASE_APPROVED_EXIT_CODE = 42;

function normalizeSha(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SHA_PATTERN.test(normalized) ? normalized : null;
}

/**
 * This program deliberately never exits with Vercel's build-continue status.
 * Instead, an approved build exits with a private sentinel (42). The
 * repository-owned ignoreCommand wrapper translates only that sentinel to
 * Vercel's exit 1, and maps every other status (including a missing or crashed
 * Node program) to exit 0 so production stays fail-closed.
 */
export function evaluateVercelProductionReleaseGate(environment) {
  const vercelEnvironment =
    typeof environment.VERCEL_ENV === "string"
      ? environment.VERCEL_ENV.trim().toLowerCase()
      : "";
  const targetEnvironment =
    typeof environment.VERCEL_TARGET_ENV === "string"
      ? environment.VERCEL_TARGET_ENV.trim().toLowerCase()
      : "";
  const environmentIsKnown = VERCEL_ENVIRONMENTS.has(vercelEnvironment);
  const isProduction =
    vercelEnvironment === "production" || targetEnvironment === "production";

  if (!environmentIsKnown) {
    return {
      ignoreBuild: true,
      reason: "deployment environment is missing or invalid",
    };
  }
  if (!isProduction) {
    return {
      ignoreBuild: false,
      reason: "non-production deployment",
    };
  }

  const commitSha = normalizeSha(environment.VERCEL_GIT_COMMIT_SHA);
  const approvedSha = normalizeSha(
    environment.TOONSPECTRUM_APPROVED_PRODUCTION_SHA,
  );
  if (commitSha === null || approvedSha === null) {
    return {
      ignoreBuild: true,
      reason: "production release SHA is missing or invalid",
    };
  }
  if (commitSha !== approvedSha) {
    return {
      ignoreBuild: true,
      reason: "production release SHA is not approved",
    };
  }
  return {
    ignoreBuild: false,
    reason: "production release SHA is approved",
  };
}

function run() {
  const decision = evaluateVercelProductionReleaseGate(process.env);
  const action = decision.ignoreBuild ? "cancel" : "continue";
  console.log(`ToonSpectrum Vercel release gate: ${action} (${decision.reason}).`);
  process.exitCode = decision.ignoreBuild
    ? 0
    : VERCEL_RELEASE_APPROVED_EXIT_CODE;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
