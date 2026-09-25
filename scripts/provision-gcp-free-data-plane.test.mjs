import { beforeEach, describe, expect, it, vi } from "vitest";

const cloudCommand = vi.hoisted(() => vi.fn());
// 옵션의 process.env는 mock 호출 기록이나 실패 diff에 남기지 않는다.
vi.mock("node:child_process", () => ({ spawnSync: (command, args) => cloudCommand(command, args) }));

import {
  applyGcpFreeDataPlane,
  parseGcpFreeDataPlaneArguments,
} from "./provision-gcp-free-data-plane.mjs";

const confirmation = { TOONSPECTRUM_GCP_FREE_DATA_CONFIRMATION: "APPLY-TOONSPECTRUM-GCP-FREE-DATA" };
const resources = () => ({
  firestore: { locationId: "asia-northeast3", type: "FIRESTORE_NATIVE", freeTier: true, deleteProtectionState: "DELETE_PROTECTION_ENABLED" },
  realtime: { name: "toonstudio-cloud-20260915-default-rtdb", location: "asia-southeast1", type: "DEFAULT_DATABASE", state: "ACTIVE" },
  dataset: { location: "asia-northeast3", defaultTableExpirationMs: "2592000000" },
  analytics: { timePartitioning: { type: "DAY", field: "event_timestamp", requirePartitionFilter: true }, clustering: { fields: ["event_name", "provider_id"] } },
  quota: { timePartitioning: { type: "DAY", field: "observed_at", requirePartitionFilter: true }, clustering: { fields: ["provider_id", "shard_id"] } },
});
const mutations = () => cloudCommand.mock.calls.filter(([, args]) => args.some((arg) =>
  ["enable", "create", "mk", "projects:addfirebase", "deploy"].includes(arg)));
function mockResources(existing, { unknownReadFailure = false } = {}) {
  cloudCommand.mockImplementation((command, args) => {
    const json = (value) => ({ status: 0, stdout: JSON.stringify(value), stderr: "" });
    if (args.includes("billing")) return { status: 0, stdout: "false", stderr: "" };
    if (args.includes("describe")) return existing.firestore ? json(existing.firestore)
      : { status: 1, stdout: "", stderr: unknownReadFailure ? "PERMISSION_DENIED: read unavailable" : "NOT_FOUND: database does not exist" };
    if (args.includes("database:instances:list")) return json({ result: existing.realtime ? [existing.realtime] : [] });
    if (args.includes("projects:list")) return json({ result: [{ projectId: "toonstudio-cloud-20260915" }] });
    if (command === "bq" && args.includes("show")) {
      const resource = args.at(-1);
      const key = resource.endsWith(".analytics_event") ? "analytics" : resource.endsWith(".provider_quota_snapshot") ? "quota" : "dataset";
      return existing[key] ? json(existing[key]) : { status: 1, stdout: "", stderr: `Not found: ${key === "dataset" ? "Dataset" : "Table"} absent` };
    }
    if (args.includes("create")) existing.firestore = resources().firestore;
    if (args.includes("mk")) {
      if (args.includes("--dataset")) existing.dataset = resources().dataset;
      else if (args.some((arg) => arg.endsWith(".analytics_event"))) existing.analytics = resources().analytics;
      else existing.quota = resources().quota;
    }
    return json({});
  });
}

beforeEach(() => { cloudCommand.mockReset(); });

describe("GCP free data-plane provisioning", () => {
  it.each([
    [["--plan"], "plan"],
    [["--check"], "check"],
    [["--apply"], "apply"],
  ])("parses exactly one explicit mode: %j", (arguments_, expected) => {
    expect(parseGcpFreeDataPlaneArguments(arguments_)).toBe(expected);
  });

  it.each([
    [[]],
    [["--plan", "--check"]],
    [["--apply", "--unknown"]],
  ])("rejects ambiguous or unknown arguments: %j", (arguments_) => {
    expect(() => parseGcpFreeDataPlaneArguments(arguments_)).toThrow(
      "Use exactly one of --plan, --check, or --apply",
    );
  });

  it("requires an explicit apply confirmation before any cloud command", () => {
    expect(() => applyGcpFreeDataPlane({})).toThrow(
      "APPLY-TOONSPECTRUM-GCP-FREE-DATA",
    );
    expect(cloudCommand).not.toHaveBeenCalled();
  });

  it.each([
    ["Firestore 지역", (r) => { r.firestore.locationId = "us-east1"; }],
    ["Firestore 유형", (r) => { r.firestore.type = "DATASTORE_MODE"; }],
    ["Firestore 무료 여부", (r) => { r.firestore.freeTier = false; }],
    ["Firestore 삭제 보호", (r) => { r.firestore.deleteProtectionState = "DELETE_PROTECTION_DISABLED"; }],
    ["RTDB 지역", (r) => { r.realtime.location = "us-central1"; }],
    ["RTDB 유형", (r) => { r.realtime.type = "USER_DATABASE"; }],
    ["RTDB 상태", (r) => { r.realtime.state = "DISABLED"; }],
    ["RTDB 필수 자원 부재", (r) => { r.realtime = null; }],
    ["BQ dataset 지역", (r) => { r.dataset.location = "US"; }],
    ["BQ dataset 만료", (r) => { r.dataset.defaultTableExpirationMs = "0"; }],
    ["BQ analytics partition", (r) => { r.analytics.timePartitioning.type = "HOUR"; }],
    ["BQ analytics filter", (r) => { r.analytics.timePartitioning.requirePartitionFilter = false; }],
    ["BQ analytics clustering", (r) => { r.analytics.clustering.fields.reverse(); }],
    ["BQ quota partition field", (r) => { r.quota.timePartitioning.field = "wrong_field"; }],
    ["BQ quota clustering", (r) => { r.quota.clustering.fields = []; }],
  ])("기존 %s 계약 불일치는 모든 외부 변경 전에 중단한다", (_, alter) => {
    const existing = resources();
    alter(existing);
    mockResources(existing);
    expect(() => applyGcpFreeDataPlane(confirmation)).toThrow();
    expect(mutations()).toEqual([]);
  });

  it("조회 권한 오류를 자원 부재로 간주하여 생성하지 않는다", () => {
    mockResources({ ...resources(), firestore: null }, { unknownReadFailure: true });
    expect(() => applyGcpFreeDataPlane(confirmation)).toThrow();
    expect(mutations()).toEqual([]);
  });

  it("성공 상태의 null 응답도 NOT_FOUND로 간주하지 않는다", () => {
    mockResources(resources());
    const normal = cloudCommand.getMockImplementation();
    cloudCommand.mockImplementation((command, args) => args.includes("describe") && !args.includes("billing")
      ? { status: 0, stdout: "null", stderr: "" } : normal(command, args));
    expect(() => applyGcpFreeDataPlane(confirmation)).toThrow();
    expect(mutations()).toEqual([]);
  });

  it("앞선 자원이 없어도 뒤의 기존 BQ 계약 검증이 끝나기 전에는 생성하지 않는다", () => {
    const existing = { ...resources(), firestore: null, dataset: null, analytics: null };
    existing.quota.timePartitioning.requirePartitionFilter = false;
    mockResources(existing);
    expect(() => applyGcpFreeDataPlane(confirmation)).toThrow();
    expect(mutations()).toEqual([]);
  });

  it("기존 계약 전체를 읽은 후에만 변경하고 존재하는 자원을 재생성하지 않는다", () => {
    mockResources(resources());
    expect(applyGcpFreeDataPlane(confirmation)).toMatchObject({ billingEnabled: false });
    const calls = cloudCommand.mock.calls;
    const firstWrite = calls.findIndex(([, args]) => args.includes("enable"));
    const beforeWrite = calls.slice(0, firstWrite).map(([, args]) => args.join(" "));
    expect(beforeWrite.some((args) => args.includes("firestore databases describe"))).toBe(true);
    expect(beforeWrite.some((args) => args.includes("database:instances:list"))).toBe(true);
    expect(beforeWrite.filter((args) => args.includes("show --format=prettyjson"))).toHaveLength(3);
    expect(mutations().some(([, args]) => args.includes("create") || args.includes("mk"))).toBe(false);
    expect(mutations().some(([, args]) => args.includes("deploy"))).toBe(false);
  });

  it("명시적 NOT_FOUND 자원만 생성하며 기존 RTDB 계약은 먼저 검사한다", () => {
    mockResources({ ...resources(), firestore: null, dataset: null, analytics: null, quota: null });
    expect(applyGcpFreeDataPlane(confirmation)).toMatchObject({ billingEnabled: false });
    expect(mutations().filter(([, args]) => args.includes("create") || args.includes("mk"))).toHaveLength(4);
    const deployments = mutations().filter(([, args]) => args.includes("deploy"));
    expect(deployments).toHaveLength(1);
    expect(deployments[0][1]).toContain("firestore:rules,firestore:indexes");
    expect(deployments[0][1]).not.toContain("database,firestore:rules,firestore:indexes");
  });
});
