import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  evaluateVercelProductionReleaseGate,
  VERCEL_RELEASE_APPROVED_EXIT_CODE,
} from "./vercel-production-release-gate.mjs";

const RELEASE_SHA = "1234567890abcdef1234567890abcdef12345678";
const CONFIG = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
);

function runIgnoreCommand(environment, command = CONFIG.ignoreCommand) {
  return spawnSync(command, {
    cwd: new URL("..", import.meta.url),
    env: {
      PATH: process.env.PATH,
      ...environment,
    },
    encoding: "utf8",
    shell: true,
  });
}

describe("Vercel production release gate", () => {
  it("is the repository-owned ignored build step", () => {
    expect(CONFIG.ignoreCommand).toBe(
      'node scripts/vercel-production-release-gate.mjs; status=$?; if [ "$status" -eq 42 ]; then exit 1; else exit 0; fi',
    );
    expect(VERCEL_RELEASE_APPROVED_EXIT_CODE).toBe(42);
  });

  it("keeps preview deployments automatic without a production approval", () => {
    expect(
      evaluateVercelProductionReleaseGate({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_SHA: RELEASE_SHA,
      }),
    ).toEqual({
      ignoreBuild: false,
      reason: "non-production deployment",
    });
  });

  it.each([
    [{ VERCEL_ENV: "production" }, "production release SHA is missing or invalid"],
    [
      {
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_SHA: RELEASE_SHA,
        TOONSPECTRUM_APPROVED_PRODUCTION_SHA: "not-a-sha",
      },
      "production release SHA is missing or invalid",
    ],
    [
      {
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_SHA: RELEASE_SHA,
        TOONSPECTRUM_APPROVED_PRODUCTION_SHA:
          "abcdef1234567890abcdef1234567890abcdef12",
      },
      "production release SHA is not approved",
    ],
    [
      {
        VERCEL_ENV: "preview",
        VERCEL_TARGET_ENV: "production",
        VERCEL_GIT_COMMIT_SHA: RELEASE_SHA,
      },
      "production release SHA is missing or invalid",
    ],
    [
      {
        VERCEL_GIT_COMMIT_SHA: RELEASE_SHA,
        TOONSPECTRUM_APPROVED_PRODUCTION_SHA: RELEASE_SHA,
      },
      "deployment environment is missing or invalid",
    ],
    [
      {
        VERCEL_ENV: "unexpected",
        VERCEL_GIT_COMMIT_SHA: RELEASE_SHA,
        TOONSPECTRUM_APPROVED_PRODUCTION_SHA: RELEASE_SHA,
      },
      "deployment environment is missing or invalid",
    ],
  ])("fails closed for an unapproved or ambiguous production build", (environment, reason) => {
    const decision = evaluateVercelProductionReleaseGate(environment);

    expect(decision.reason).toBe(reason);
    expect(decision.ignoreBuild).toBe(true);
  });

  it("allows only the exact approved production commit", () => {
    expect(
      evaluateVercelProductionReleaseGate({
        VERCEL_ENV: "production",
        VERCEL_TARGET_ENV: "production",
        VERCEL_GIT_COMMIT_SHA: RELEASE_SHA.toUpperCase(),
        TOONSPECTRUM_APPROVED_PRODUCTION_SHA: ` ${RELEASE_SHA} `,
      }),
    ).toEqual({
      ignoreBuild: false,
      reason: "production release SHA is approved",
    });
  });

  it("maps only the private approval sentinel to Vercel's build-continue status", () => {
    const approved = runIgnoreCommand({
      VERCEL_ENV: "production",
      VERCEL_TARGET_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: RELEASE_SHA,
      TOONSPECTRUM_APPROVED_PRODUCTION_SHA: RELEASE_SHA,
    });
    const unapproved = runIgnoreCommand({
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: RELEASE_SHA,
    });

    expect(approved.status).toBe(1);
    expect(unapproved.status).toBe(0);
  });

  it.each([
    ["missing gate program", "node scripts/does-not-exist.mjs"],
    ["crashed gate program", 'node -e "process.exit(7)"'],
    ["wrong nonzero sentinel", 'node -e "process.exit(1)"'],
  ])("fails closed when the %s cannot approve", (_label, gateProgram) => {
    const guardedCommand = CONFIG.ignoreCommand.replace(
      "node scripts/vercel-production-release-gate.mjs",
      gateProgram,
    );
    const result = runIgnoreCommand(
      {
        VERCEL_ENV: "production",
        VERCEL_TARGET_ENV: "production",
        VERCEL_GIT_COMMIT_SHA: RELEASE_SHA,
        TOONSPECTRUM_APPROVED_PRODUCTION_SHA: RELEASE_SHA,
      },
      guardedCommand,
    );

    expect(result.status).toBe(0);
  });
});
