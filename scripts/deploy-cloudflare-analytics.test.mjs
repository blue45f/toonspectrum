import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { analyticsDeploymentConfig, analyticsDeploymentSecrets, deployAnalyticsWorker } from "./deploy-cloudflare-analytics.mjs";

const sha = "a".repeat(40);
const environment = {
  CLOUDFLARE_ACCOUNT_ID: "1".repeat(32),
  TRAFFIC_ANALYTICS_D1_DATABASE_ID: "11111111-1111-1111-1111-111111111111",
  TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL: "cloudflare-analytics-production",
  TOONSPECTRUM_APPROVED_MAIN_SHA: sha,
};
const git = { branch: "main", head: sha, dirty: false };

describe("분석 Worker 수동 배포 경계", () => {
  it("dry-run은 실제 계정·비밀 없이 검증용 설정만 만든다", () => {
    const config = analyticsDeploymentConfig({}, false);
    expect(config.d1_databases[0].database_id).toBe("00000000-0000-0000-0000-000000000000");
    expect(config.preview_urls).toBe(false);
    expect(config.compatibility_date).toBe("2026-07-30");
    expect(config.observability.enabled).toBe(false);
    expect(config).not.toHaveProperty("triggers");
  });
  it("검토한 DB binding과 SHA만 운영 설정에 넣는다", () => {
    const config = analyticsDeploymentConfig(environment, true, git);
    expect(config.vars.RELEASE_SHA).toBe(sha);
    expect(config.d1_databases[0].database_id).toBe(environment.TRAFFIC_ANALYTICS_D1_DATABASE_ID);
    expect(config.secrets.required).toEqual(["ANALYTICS_RPC_TOKEN"]);
    expect(config.account_id).toBe(environment.CLOUDFLARE_ACCOUNT_ID);
  });
  it.each([
    { ...git, dirty: true }, { ...git, branch: "codex/test" }, { ...git, head: "b".repeat(40) },
  ])("main·승인 SHA·clean 경계가 깨지면 거부한다", (state) => {
    expect(() => analyticsDeploymentConfig(environment, true, state)).toThrow();
  });
  it.each(["", "cloudflare-static-production"])("다른 배포 승인을 재사용하지 않는다", (approval) => {
    expect(() => analyticsDeploymentConfig({ ...environment, TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL: approval }, true, git)).toThrow();
  });
  it("가상 dry-run DB를 운영에 연결하지 않는다", () => {
    expect(() => analyticsDeploymentConfig({ ...environment, TRAFFIC_ANALYTICS_D1_DATABASE_ID: "00000000-0000-0000-0000-000000000000" }, true, git)).toThrow();
  });
  it.each([undefined, "", "not-an-account"])("운영 계정을 추측하거나 대화형으로 선택하지 않는다", (account) => {
    expect(() => analyticsDeploymentConfig({ ...environment, CLOUDFLARE_ACCOUNT_ID: account }, true, git)).toThrow();
  });
  it.each([undefined, "short", "x".repeat(4_097), `${"x".repeat(32)} with-space`])("유효하지 않은 RPC 비밀은 외부 명령 전에 거부한다", (token) => {
    const runner = vi.fn();
    expect(() => deployAnalyticsWorker({}, { TRAFFIC_ANALYTICS_D1_RPC_TOKEN: token }, true, runner)).toThrow();
    expect(runner).not.toHaveBeenCalled();
  });
  it("Core와 동일한 토큰을 쓰되 설정에는 비밀을 포함하지 않는다", () => {
    const token = "x".repeat(4_096);
    const env = { ...environment, TRAFFIC_ANALYTICS_D1_RPC_TOKEN: ` ${token} ` };
    expect(analyticsDeploymentSecrets(env)).toEqual({ ANALYTICS_RPC_TOKEN: token });
    expect(JSON.stringify(analyticsDeploymentConfig(env, true, git))).not.toContain(token);
  });
  it.each([0, 1])("최초 배포 비밀을 0600 임시 파일로 전달하고 성공·실패 후 모두 지운다: %s", (status) => {
    const token = "local-analytics-deployment-test-value";
    const env = { ...environment, TRAFFIC_ANALYTICS_D1_RPC_TOKEN: token, ANALYTICS_RPC_TOKEN: token };
    const config = analyticsDeploymentConfig(env, true, git);
    let directory;
    const runner = vi.fn((command, args, options) => {
      expect(command).toBe("pnpm");
      expect(args).not.toContain("--dry-run");
      expect(JSON.stringify(args)).not.toContain(token);
      expect(options.env).not.toHaveProperty("TRAFFIC_ANALYTICS_D1_RPC_TOKEN");
      expect(options.env).not.toHaveProperty("ANALYTICS_RPC_TOKEN");
      const path = args[args.indexOf("--secrets-file") + 1];
      directory = dirname(path);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(statSync(directory).mode & 0o777).toBe(0o700);
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ ANALYTICS_RPC_TOKEN: token });
      return { status };
    });
    if (status === 0) deployAnalyticsWorker(config, env, true, runner);
    else expect(() => deployAnalyticsWorker(config, env, true, runner)).toThrow("자동 재시도하지 않았습니다");
    expect(runner).toHaveBeenCalledTimes(1);
    expect(existsSync(directory)).toBe(false);
  });
  it("dry-run은 환경에 비밀이 있어도 secrets 파일을 만들지 않는다", () => {
    const runner = vi.fn((_command, args) => {
      expect(args).toContain("--dry-run");
      expect(args).not.toContain("--secrets-file");
      return { status: 0 };
    });
    deployAnalyticsWorker(analyticsDeploymentConfig({}, false), { TRAFFIC_ANALYTICS_D1_RPC_TOKEN: "short" }, false, runner);
    expect(runner).toHaveBeenCalledTimes(1);
  });
});
