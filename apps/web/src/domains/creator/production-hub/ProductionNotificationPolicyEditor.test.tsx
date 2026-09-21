// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProductionDemoProject } from "./production-demo";
import { ProductionNotificationPolicyEditor } from "./ProductionNotificationPolicyEditor";
import type { ProductionClientCommand } from "./production-api";
import type { ProductionNotificationPolicy } from "@toonspectrum/core/production";

const session = vi.hoisted(() => ({ revision: 0 }));
vi.mock("@/compat/auth-session-state", () => ({ getAuthSessionRevision: () => session.revision }));
afterEach(() => { cleanup(); session.revision = 0; });
function fixture(policy?: ProductionNotificationPolicy) {
  const base = createProductionDemoProject();
  const aggregate = { ...base, notificationPolicies: policy ? [policy] : [] };
  const assignmentId = base.assignments[0]!.id;
  const execute = vi.fn(async (_command: ProductionClientCommand, _message: string) => undefined);
  const props = { aggregate, assignmentId, execute, disabled: false, canManage: true };
  return { ...render(<ProductionNotificationPolicyEditor {...props} />), props, execute };
}
function confirm() { fireEvent.click(screen.getByRole("checkbox", { name: "표시된 담당자의 알림 선호 변경을 확인했습니다." })); }
function save() { fireEvent.click(screen.getByRole("button", { name: "알림 정책 저장" })); }
function policy(): ProductionNotificationPolicy {
  const base = createProductionDemoProject();
  return { id: "policy", projectId: base.projectId, assignmentId: base.assignments[0]!.id, channels: ["in-app"],
    digest: "daily", timezone: "Asia/Seoul", quietHoursStart: "22:00", quietHoursEnd: "08:00", dueSoonHours: 48,
    escalationHours: 24, enabled: true, updatedAt: "2026-09-21T00:00:00.000Z" };
}
describe("notification preferences", () => {
  it("requires explicit consent and sends the exact current policy expectation", async () => {
    const { execute } = fixture(); save(); expect(execute).not.toHaveBeenCalled(); confirm(); save();
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]![0]).toMatchObject({ type: "upsert-operations-record", expectedNotificationPolicy: null,
      record: { kind: "notification-policy", value: { channels: ["in-app"], digest: "daily", quietHoursStart: "22:00" } } });
    expect(screen.getByRole("status").textContent).toContain("외부 발송");
  });
  it("invalidates consent when an input changes", () => {
    const { execute } = fixture(); confirm(); fireEvent.change(screen.getByLabelText("시간대"), { target: { value: "UTC" } }); save();
    expect(execute).not.toHaveBeenCalled();
  });
  it("retains failed inputs and blocks a duplicate pending save", async () => {
    const { execute } = fixture(); let fail!: (reason: Error) => void;
    execute.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    fireEvent.change(screen.getByLabelText("시간대"), { target: { value: "UTC" } }); confirm(); save(); save();
    expect(execute).toHaveBeenCalledTimes(1);
    await act(async () => fail(new Error("network")));
    expect((screen.getByLabelText("시간대") as HTMLInputElement).value).toBe("UTC");
    expect(screen.getByRole("status").textContent).toContain("입력은 유지");
  });
  it("detects changed content even when its timestamp is unchanged", () => {
    const current = policy(), { props, rerender, execute } = fixture(current);
    fireEvent.change(screen.getByLabelText("시간대"), { target: { value: "UTC" } }); confirm();
    rerender(<ProductionNotificationPolicyEditor {...props} aggregate={{ ...props.aggregate, notificationPolicies: [{ ...current, digest: "weekly" }] }} />);
    expect(screen.getByRole("alert").textContent).toContain("다른 변경"); save(); expect(execute).not.toHaveBeenCalled();
    expect((screen.getByLabelText("시간대") as HTMLInputElement).value).toBe("UTC");
    fireEvent.click(screen.getByRole("button", { name: "입력을 버리고 현재 정책 확인" }));
    expect((screen.getByLabelText("묶음 주기") as HTMLSelectElement).value).toBe("weekly");
  });
  it.each(["Not/A_Timezone", ""])("rejects invalid timezone %s without writes", (value) => {
    const { execute } = fixture(); fireEvent.change(screen.getByLabelText("시간대"), { target: { value } }); save();
    expect(screen.getByRole("alert")).toBeTruthy(); expect(execute).not.toHaveBeenCalled();
  });
  it("represents disabled quiet hours as an explicit null pair", async () => {
    const { execute } = fixture(); fireEvent.click(screen.getByLabelText("조용한 시간 사용")); confirm(); save();
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]![0]).toMatchObject({ record: { value: { quietHoursStart: null, quietHoursEnd: null } } });
  });
  it("does not submit after management rights are removed", () => {
    const { execute, props, rerender } = fixture(); confirm();
    rerender(<ProductionNotificationPolicyEditor {...props} canManage={false} />); save(); expect(execute).not.toHaveBeenCalled();
  });
  it("ignores completion belonging to an earlier account session", async () => {
    const { execute, props, rerender } = fixture(); let finish!: () => void;
    execute.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve(undefined); })); confirm(); save();
    session.revision++; rerender(<ProductionNotificationPolicyEditor {...props} />);
    await act(async () => finish()); expect(screen.queryByRole("status")).toBeNull();
    expect((screen.getByRole("checkbox", { name: "표시된 담당자의 알림 선호 변경을 확인했습니다." }) as HTMLInputElement).checked).toBe(false);
  });
});
