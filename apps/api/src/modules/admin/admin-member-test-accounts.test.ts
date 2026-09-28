import { BadRequestException, ConflictException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseTestAccountMutation, readMemberTestAccountFlags, setMemberTestAccount } from "./admin-member-test-accounts";

const doubles = vi.hoisted(() => ({
  actor: vi.fn(), select: vi.fn(), transaction: vi.fn(), insert: vi.fn(), values: vi.fn(), upsert: vi.fn(),
  users: { id: "id", status: "status" }, flags: { userId: "userId", isTestAccount: "isTestAccount" }, audit: {},
  target: [{ id: "member", status: "active" }], previous: [] as { isTestAccount: boolean }[],
}));
vi.mock("../../platform/database", () => ({
  users: doubles.users, adminMemberTestAccounts: doubles.flags, adminAuditLogs: doubles.audit,
  db: { select: doubles.select, transaction: doubles.transaction },
}));
vi.mock("./admin-types", () => ({ requireAdminUser: doubles.actor, ensureAdminSchema: vi.fn() }));
const input = { isTestAccount: true, expectedIsTestAccount: false, reason: "댓글 회귀 검증" };
beforeEach(() => {
  vi.resetAllMocks();
  doubles.target = [{ id: "member", status: "active" }];
  doubles.previous = [];
  doubles.actor.mockResolvedValue({ id: "admin", role: "admin" });
  doubles.upsert.mockResolvedValue(undefined);
  doubles.values.mockResolvedValue(undefined);
  doubles.insert.mockImplementation((table) => ({ values: (value: unknown) => table === doubles.flags
    ? { onConflictDoUpdate: (options: unknown) => doubles.upsert(value, options) } : doubles.values(value) }));
  doubles.select.mockImplementation(() => ({ from: (table: unknown) => ({ where: () => table === doubles.users
    ? { for: () => Promise.resolve(doubles.target) } : Promise.resolve(doubles.previous) }) }));
  doubles.transaction.mockImplementation((run) => run({ select: doubles.select, insert: doubles.insert }));
});
describe("관리자 테스트 계정 입력과 조회", () => {
  it.each([null, {}, { ...input, isTestAccount: "true" }, { ...input, expectedIsTestAccount: 0 },
    { ...input, reason: " " }, { ...input, reason: "가".repeat(301) }])("잘못된 입력을 거부한다: %j", (value) => {
    expect(() => parseTestAccountMutation(value)).toThrow(BadRequestException);
  });
  it("사유를 정리하고 허용한 값만 사용한다", () => {
    expect(parseTestAccountMutation({ ...input, reason: "  검증  ", role: "admin" })).toEqual({ ...input, reason: "검증" });
  });
  it("조회 권한이 없으면 DB에 접근하지 않는다", async () => {
    doubles.actor.mockRejectedValue(new ForbiddenException());
    await expect(readMemberTestAccountFlags("member", ["member"])).rejects.toThrow(ForbiddenException);
    expect(doubles.select).not.toHaveBeenCalled();
  });
  it("마이그레이션 미적용을 일반 계정으로 오판하지 않는다", async () => {
    doubles.select.mockImplementation(() => { throw { cause: { code: "42P01" } }; });
    const result = await readMemberTestAccountFlags("admin", ["member"]);
    expect(result.available).toBe(false);
    expect(result.flags.size).toBe(0);
  });
  it("DB 권한이나 연결 오류는 정상 응답으로 숨기지 않는다", async () => {
    doubles.select.mockImplementation(() => { throw new Error("permission denied"); });
    await expect(readMemberTestAccountFlags("admin", ["member"])).rejects.toThrow("permission denied");
  });
});
describe("관리자 테스트 계정 변경", () => {
  it("운영자는 값을 바꿀 수 없다", async () => {
    doubles.actor.mockResolvedValue({ id: "operator", role: "operator" });
    await expect(setMemberTestAccount("operator", "member", input)).rejects.toThrow(ForbiddenException);
    expect(doubles.transaction).not.toHaveBeenCalled();
  });
  it("이전 구분값이 다르면 변경과 감사 기록을 하지 않는다", async () => {
    doubles.previous = [{ isTestAccount: true }];
    await expect(setMemberTestAccount("admin", "member", input)).rejects.toThrow(ConflictException);
    expect(doubles.insert).not.toHaveBeenCalled();
  });
  it("존재하지 않는 회원은 구분할 수 없다", async () => {
    doubles.target = [];
    await expect(setMemberTestAccount("admin", "member", input)).rejects.toThrow(BadRequestException);
    expect(doubles.insert).not.toHaveBeenCalled();
  });
  it("구분값과 사유를 저장하고 같은 트랜잭션에 감사 기록을 남긴다", async () => {
    await expect(setMemberTestAccount("admin", "member", input)).resolves.toEqual({ ok: true, id: "member", isTestAccount: true });
    expect(doubles.transaction).toHaveBeenCalledTimes(1);
    expect(doubles.upsert).toHaveBeenCalledWith(expect.objectContaining({ userId: "member", isTestAccount: true, reason: input.reason }), expect.anything());
    expect(doubles.values).toHaveBeenCalledWith(expect.objectContaining({ action: "USER_TEST_ACCOUNT_CHANGE",
      targetId: "member", details: { previousIsTestAccount: false, isTestAccount: true, reason: input.reason } }));
  });
  it("같은 구분값을 다시 저장하면 중복 감사 기록을 만들지 않는다", async () => {
    await setMemberTestAccount("admin", "member", { ...input, isTestAccount: false });
    expect(doubles.insert).not.toHaveBeenCalled();
  });
  it("감사 기록 실패를 성공으로 숨기지 않는다", async () => {
    doubles.values.mockRejectedValueOnce(new Error("audit failed"));
    await expect(setMemberTestAccount("admin", "member", input)).rejects.toThrow("audit failed");
  });
  it("테이블 미적용 시 재시도 가능한 오류를 반환한다", async () => {
    doubles.select.mockImplementation(() => { throw Object.assign(new Error("missing table"), { code: "42P01" }); });
    await expect(setMemberTestAccount("admin", "member", input)).rejects.toThrow(ServiceUnavailableException);
  });
});
