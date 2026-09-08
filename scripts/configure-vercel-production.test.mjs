import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";

import { validateEnv } from "../apps/api/src/config/env";
import { buildAuthorizeUrl, isAuthorizationCodeFlowConfigured, issueState, redirectUri, verifyState, webAppBaseUrl } from "../apps/api/src/server/oauth";

vi.mock("../apps/api/src/db", () => ({
  accounts: {}, db: {}, dbClient: {}, sessions: {}, users: {},
}));

const SECRET = "fixture-signing-secret-with-at-least-32-bytes";
const FAKE_DB = "postgresql://fixture:fixture@127.0.0.1:1/fixture";
const fixtureKeys = [
  "DATABASE_URL", "AUTH_SESSION_SECRET", "AUTH_STATE_SECRET", "AUTH_SECRET", "BETTER_AUTH_SECRET",
  "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "KAKAO_REST_API_KEY", "KAKAO_CLIENT_SECRET",
  "NAVER_OAUTH_CLIENT_ID", "NAVER_OAUTH_CLIENT_SECRET", "WEB_APP_BASE_URL", "OAUTH_REDIRECT_BASE_URL",
  "KAKAO_OAUTH_CLIENT_ID", "KAKAO_OAUTH_CLIENT_SECRET", "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET",
];
let requests;
let existing;
let logs;

beforeEach(() => {
  vi.resetModules();
  for (const key of fixtureKeys) {
    vi.stubEnv(key, "");
    vi.stubEnv(`${key}_VALUE`, "");
  }
  vi.stubEnv("VERCEL_TOKEN", "fixture-token");
  vi.stubEnv("VERCEL_PROJECT_ID", "fixture-project");
  vi.stubEnv("VERCEL_ORG_ID", "fixture-team");
  vi.stubEnv("VERCEL_ENV_TARGET", "production");
  vi.stubEnv("PUBLIC_APP_ORIGIN", "https://www.toonstudio.cloud");
  existing = [{ key: "DATABASE_URL", type: "sensitive", target: ["production"] }];
  requests = [];
  logs = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ url, method: options.method, body });
    if (options.method === "GET") return Response.json({ envs: existing });
    return Response.json({ created: true });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function reconcile() {
  const module = await import("./configure-vercel-production.mjs");
  return module.reconcileProductionEnvironment();
}
function posted(key) { return requests.find((request) => request.body?.key === key)?.body; }
function runtimeEnvironment() {
  return Object.fromEntries([
    ["NODE_ENV", "production"], ["DATABASE_URL", FAKE_DB],
    ...requests.filter((request) => request.body).map(({ body }) => [body.key, body.value]),
  ]);
}

describe("production reconciliation runtime authority", () => {
  it("fails before any write when the existing database has no actual API signing authority", async () => {
    await expect(reconcile()).rejects.toThrow(/AUTH_SESSION_SECRET.*AUTH_STATE_SECRET/u);
    expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  it("forwards the actual signing key and origin names consumed by the API", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET_VALUE", SECRET);
    await reconcile();
    expect(posted("AUTH_SESSION_SECRET")?.value).toBe(SECRET);
    expect(posted("AUTH_SECRET")).toBeUndefined();
    const runtime = runtimeEnvironment();
    expect(validateEnv(runtime, { warn: vi.fn(), error: vi.fn() })).toMatchObject({ AUTH_SESSION_SECRET: SECRET });
    vi.stubEnv("WEB_APP_BASE_URL", runtime.WEB_APP_BASE_URL);
    vi.stubEnv("OAUTH_REDIRECT_BASE_URL", runtime.OAUTH_REDIRECT_BASE_URL);
    expect(webAppBaseUrl()).toBe("https://www.toonstudio.cloud");
    expect(redirectUri("google")).toBe("https://www.toonstudio.cloud/api/auth/oauth/google/callback");
    expect(JSON.stringify(logs.mock.calls)).not.toContain(SECRET);
    expect(posted("DATABASE_URL")).toBeUndefined();
  });

  it("preserves the existing Sensitive state fallback without introducing a new signing authority", async () => {
    existing.push({ key: "AUTH_STATE_SECRET", type: "sensitive", target: ["production"] });
    vi.stubEnv("AUTH_SESSION_SECRET_VALUE", SECRET);
    vi.stubEnv("AUTH_STATE_SECRET_VALUE", `${SECRET}-replacement`);
    vi.stubEnv("DATABASE_URL_VALUE", "postgresql://replacement.invalid/db");
    const report = await reconcile();
    expect(report.retained).toContain("AUTH_STATE_SECRET");
    expect(requests.filter(({ body }) => body && /^(?:AUTH_|DATABASE_URL$)/u.test(body.key))).toEqual([]);
  });

  it("requires the actual OAuth state secret before configuring authorization-code credentials", async () => {
    existing.push({ key: "AUTH_SESSION_SECRET", type: "sensitive", target: ["production"] });
    existing.push({ key: "GOOGLE_OAUTH_CLIENT_SECRET", type: "sensitive", target: ["production"] });
    await expect(reconcile()).rejects.toThrow(/AUTH_STATE_SECRET/u);
    expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  it("allows one explicit state secret to satisfy both current runtime requirements", async () => {
    vi.stubEnv("AUTH_STATE_SECRET_VALUE", SECRET);
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET_VALUE", "fixture-google-client-secret");
    await reconcile();
    const runtime = runtimeEnvironment();
    expect(validateEnv(runtime, { warn: vi.fn(), error: vi.fn() })).toMatchObject({ AUTH_STATE_SECRET: SECRET });
    expect(posted("AUTH_SESSION_SECRET")).toBeUndefined();
    expect(posted("GOOGLE_OAUTH_CLIENT_SECRET")?.value).toBe("fixture-google-client-secret");
  });

  it.each(["short", ` ${SECRET}`, `${SECRET} `])("rejects a new invalid signing secret without modifying it or exposing it", async (value) => {
    vi.stubEnv("AUTH_SESSION_SECRET_VALUE", value);
    await expect(reconcile()).rejects.toThrow(/AUTH_SESSION_SECRET.*32/u);
    expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
    expect(JSON.stringify(logs.mock.calls)).not.toContain(value);
  });

  it("keeps audit-only read-only and labels additions as planned rather than created", async () => {
    existing.push({ key: "AUTH_STATE_SECRET", type: "sensitive", target: ["production"] });
    const argv = [...process.argv, "--audit-only"];
    vi.spyOn(process, "argv", "get").mockReturnValue(argv);
    const report = await reconcile();
    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(report.created).toEqual([]);
    expect(report.planned).toEqual(expect.arrayContaining(["WEB_APP_BASE_URL", "OAUTH_REDIRECT_BASE_URL"]));
  });

  it("fails before adding auth or origins when the database is missing", async () => {
    existing = [];
    vi.stubEnv("AUTH_SESSION_SECRET_VALUE", SECRET);
    await expect(reconcile()).rejects.toThrow(/DATABASE_URL/u);
    expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  it("adds required OAuth state without replacing an existing preferred signing authority", async () => {
    existing.push({ key: "AUTH_SESSION_SECRET", type: "sensitive", target: ["production"] });
    existing.push({ key: "GOOGLE_OAUTH_CLIENT_SECRET", type: "sensitive", target: ["production"] });
    vi.stubEnv("AUTH_SESSION_SECRET_VALUE", `${SECRET}-replacement`);
    vi.stubEnv("AUTH_STATE_SECRET_VALUE", SECRET);
    await reconcile();
    expect(posted("AUTH_SESSION_SECRET")).toBeUndefined();
    expect(posted("AUTH_STATE_SECRET")?.value).toBe(SECRET);
  });

  it("suppresses reflected secret values when a create request fails", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET_VALUE", SECRET);
    vi.stubGlobal("fetch", vi.fn(async (url, options) => options.method === "GET"
      ? Response.json({ envs: existing })
      : new Response(`invalid value ${SECRET}`, { status: 400 })));
    const error = await reconcile().catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("400");
    expect(error.message).not.toContain(SECRET);
    expect(JSON.stringify(logs.mock.calls)).not.toContain(SECRET);
  });

  it("never includes a reflected upstream error body in the CLI-visible error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`invalid value ${SECRET}`, { status: 400 })));
    const error = await reconcile().catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("400");
    expect(error.message).not.toContain(SECRET);
  });
});

describe("OAuth aliases use the same state-signing authority as the real API", () => {
  const cases = [
    { provider: "kakao", credentials: { KAKAO_OAUTH_CLIENT_ID: "fixture-kakao-id" } },
    { provider: "kakao", credentials: { KAKAO_OAUTH_CLIENT_ID: "fixture-kakao-id", KAKAO_OAUTH_CLIENT_SECRET: "fixture-kakao-secret" } },
    { provider: "naver", credentials: { NAVER_CLIENT_ID: "fixture-naver-id", NAVER_CLIENT_SECRET: "fixture-naver-secret" } },
    { provider: "naver", credentials: { NAVER_OAUTH_CLIENT_ID: "fixture-naver-id", NAVER_CLIENT_SECRET: "fixture-naver-secret" } },
    { provider: "naver", credentials: { NAVER_CLIENT_ID: "fixture-naver-id", NAVER_OAUTH_CLIENT_SECRET: "fixture-naver-secret" } },
  ];
  it.each(cases)("refuses the configured $provider alias flow before any Vercel write without state authority: $credentials", async ({ provider, credentials }) => {
    existing.push({ key: "AUTH_SESSION_SECRET", type: "sensitive", target: ["production"] });
    for (const [key, value] of Object.entries(credentials)) {
      vi.stubEnv(`${key}_VALUE`, value);
      vi.stubEnv(key, value);
    }
    vi.stubEnv("NODE_ENV", "production");
    expect(isAuthorizationCodeFlowConfigured(provider)).toBe(true);
    expect(() => issueState(provider)).toThrow(/AUTH_STATE_SECRET/u);
    await expect(reconcile()).rejects.toThrow(/AUTH_STATE_SECRET/u);
    expect(requests.every(({ method }) => method === "GET")).toBe(true);
  });

  it.each(cases)("configures $provider aliases with a state token accepted by the actual callback verifier: $credentials", async ({ provider, credentials }) => {
    vi.stubEnv("AUTH_SESSION_SECRET_VALUE", SECRET);
    vi.stubEnv("AUTH_STATE_SECRET_VALUE", `${SECRET}-state`);
    for (const [key, value] of Object.entries(credentials)) vi.stubEnv(`${key}_VALUE`, value);
    await reconcile();
    const runtime = runtimeEnvironment();
    expect(validateEnv(runtime, { warn: vi.fn(), error: vi.fn() })).not.toBeNull();
    for (const [key, value] of Object.entries(runtime)) vi.stubEnv(key, value);
    expect(isAuthorizationCodeFlowConfigured(provider)).toBe(true);
    const state = issueState(provider);
    expect(verifyState(provider, state)).toBe(true);
    const url = new URL(buildAuthorizeUrl(provider, state));
    expect(url.searchParams.get("client_id")).toBe(Object.entries(credentials).find(([key]) => key.endsWith("CLIENT_ID"))[1]);
    expect(url.searchParams.get("state")).toBe(state);
  });

  it.each([
    ["KAKAO_REST_API_KEY", "KAKAO_OAUTH_CLIENT_ID"],
    ["KAKAO_CLIENT_SECRET", "KAKAO_OAUTH_CLIENT_SECRET"],
    ["NAVER_OAUTH_CLIENT_ID", "NAVER_CLIENT_ID"],
    ["NAVER_OAUTH_CLIENT_SECRET", "NAVER_CLIENT_SECRET"],
  ])("preserves existing Sensitive %s fallback %s instead of changing effective credentials", async (preferred, fallback) => {
    existing.push({ key: "AUTH_STATE_SECRET", type: "sensitive", target: ["production"] }, { key: fallback, type: "sensitive", target: ["production"] });
    vi.stubEnv(`${preferred}_VALUE`, "different-app-credential");
    await reconcile();
    expect(posted(preferred)).toBeUndefined();
    expect(posted(fallback)).toBeUndefined();
    expect(posted("AUTH_STATE_SECRET")).toBeUndefined();
  });
});

describe("production readiness workflow", () => {
  it("uses audit-only when deployment is disabled and requires the CLI project/org pair before mutation", () => {
    const workflow = parseYaml(readFileSync(new URL("../.github/workflows/production-readiness.yml", import.meta.url), "utf8"));
    expect(workflow.on.workflow_dispatch.inputs.deploy.default).toBe(false);
    const steps = workflow.jobs["reconcile-and-deploy"].steps;
    const validation = steps.find((step) => step.name === "Validate deployment credentials");
    expect(validation.run).toContain("VERCEL_PROJECT_ID");
    expect(validation.run).toContain("VERCEL_ORG_ID");
    const reconciliation = steps.find((step) => step.name?.startsWith("Reconcile production variables"));
    expect(reconciliation.run).toContain("--audit-only");
    expect(reconciliation.env.DEPLOY).toBe("${{ inputs.deploy }}");
    expect(workflow.jobs["reconcile-and-deploy"].env.AUTH_SESSION_SECRET_VALUE).toBe("${{ secrets.AUTH_SESSION_SECRET }}");
    expect(workflow.jobs["reconcile-and-deploy"].env.AUTH_STATE_SECRET_VALUE).toBe("${{ secrets.AUTH_STATE_SECRET }}");
    expect(steps.findIndex((step) => step === validation)).toBeLessThan(steps.findIndex((step) => step === reconciliation));
  });
  it("rejects a missing CLI org/project pair before any remote command", () => {
    const workflow = parseYaml(readFileSync(new URL("../.github/workflows/production-readiness.yml", import.meta.url), "utf8"));
    const script = workflow.jobs["reconcile-and-deploy"].steps.find((step) => step.name === "Validate deployment credentials").run;
    for (const ids of [{ VERCEL_PROJECT_ID: "fixture-project" }, { VERCEL_ORG_ID: "fixture-team" }, {}]) {
      const result = spawnSync("bash", ["-c", script], { env: { PATH: process.env.PATH, VERCEL_TOKEN: "fixture-token", ...ids }, encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("both required");
      expect(result.stdout).not.toContain("fixture-token");
    }
    expect(spawnSync("bash", ["-c", script], { env: { PATH: process.env.PATH, VERCEL_TOKEN: "fixture-token", VERCEL_PROJECT_ID: "fixture-project", VERCEL_ORG_ID: "fixture-team" } }).status).toBe(0);
  });

  it("dispatches only the read-only script mode when deploy is false", () => {
    const workflow = parseYaml(readFileSync(new URL("../.github/workflows/production-readiness.yml", import.meta.url), "utf8"));
    const script = workflow.jobs["reconcile-and-deploy"].steps.find((step) => step.name?.startsWith("Reconcile production variables")).run;
    const fixture = mkdtempSync(join(tmpdir(), "toonspectrum-env-mode-"));
    const args = join(fixture, "args.txt");
    try {
      writeFileSync(join(fixture, "node"), '#!/bin/sh\nprintf "%s\n" "$@" > "$FIXTURE_ARGS"\n', { mode: 0o700 });
      for (const deploy of ["false", "true"]) {
        const result = spawnSync("bash", ["-c", script], { env: { PATH: `${fixture}:${process.env.PATH}`, DEPLOY: deploy, FIXTURE_ARGS: args }, encoding: "utf8" });
        expect(result.status).toBe(0);
        expect(readFileSync(args, "utf8").includes("--audit-only")).toBe(deploy === "false");
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

});
