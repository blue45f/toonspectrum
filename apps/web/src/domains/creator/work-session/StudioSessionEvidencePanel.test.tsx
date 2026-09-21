// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioSessionEvidencePanel } from "./StudioSessionEvidencePanel";
import { evidenceTestResponse, evidenceTestSource, evidenceTestView } from "./studio-session-evidence.test-fixture";
import type { StudioWorkSessionController } from "./studio-work-session-controller";

const mock = vi.hoisted(() => ({ resource: { value: null as unknown, failed: false, offset: 0, setOffset: vi.fn(), refresh: vi.fn() }, enabled: vi.fn() }));
vi.mock("./use-session-evidence", () => ({ useSessionEvidence: (_: unknown, __: unknown, enabled: boolean) => { mock.enabled(enabled); return mock.resource; } }));
const command = vi.fn(), onInspect = vi.fn();
function props() { return { view: evidenceTestView(), actorId: "host", controller: { command, suspend: vi.fn() } as unknown as StudioWorkSessionController, busy: false, onInspect }; }
const open = () => fireEvent.click(screen.getByRole("button", { name: /소재 사용 · AI 기록/ }));
beforeEach(() => { mock.resource.value = evidenceTestResponse(); mock.resource.failed = false; mock.resource.offset = 0; vi.clearAllMocks(); });
afterEach(cleanup);
it("starts collapsed and expands read-only with explicit failure and unknown-cost labels", () => {
  render(<StudioSessionEvidencePanel {...props()} />); expect(screen.queryByText("실제 제출본 소재")).toBeNull(); expect(mock.enabled).toHaveBeenLastCalledWith(false);
  open(); expect(mock.enabled).toHaveBeenLastCalledWith(true); expect(screen.getByText("실제 제출본 소재")).toBeTruthy();
  expect(screen.getByText(/실패 · local/)).toBeTruthy(); expect(screen.getByText(/전체 미확인/)).toBeTruthy(); expect(command).not.toHaveBeenCalled();
  open(); expect(screen.queryByText("실제 제출본 소재")).toBeNull();
});
it("filters by unverified rights and by native-3D records without implying a new 3D renderer", () => {
  render(<StudioSessionEvidencePanel {...props()} />); open();
  fireEvent.change(screen.getByRole("combobox", { name: "표시 범위" }), { target: { value: "unknown" } });
  expect(screen.getByText("실제 제출본 소재")).toBeTruthy(); expect(screen.queryByText("제출된 3D 장면")).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "표시 범위" }), { target: { value: "3d" } });
  expect(screen.queryByText("실제 제출본 소재")).toBeNull(); expect(screen.getByText("제출된 3D 장면")).toBeTruthy();
});
it("uses the exact pinned page and only explicitly cites a record through the existing command", () => {
  render(<StudioSessionEvidencePanel {...props()} />); open(); fireEvent.click(screen.getAllByRole("button", { name: "사용된 고정 페이지 보기" })[0]!);
  expect(onInspect).toHaveBeenCalledExactlyOnceWith(evidenceTestSource); expect(command).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "검토 기록에 인용" }));
  expect(command).toHaveBeenCalledWith({ action: "note", category: "ai-evidence", body: expect.stringContaining("not an edit or approval") });
});
it.each(["busy", "viewer", "unjoined", "closed", "capacity"])("blocks citation for %s", (state) => {
  const p = props(); if (state === "busy") p.busy = true; if (state === "viewer") p.view.capabilities.comment = false;
  if (state === "unjoined") p.view.session.participantUserIds = []; if (state === "closed") p.view.session.status = "closed"; if (state === "capacity") p.view.session.version = 128;
  render(<StudioSessionEvidencePanel {...p} />); open(); const button = screen.getByRole("button", { name: "검토 기록에 인용" });
  expect(button.matches(":disabled")).toBe(true); fireEvent.click(button); expect(command).not.toHaveBeenCalled();
});
it("does not treat missing, failed or unmapped evidence as a successful empty result", () => {
  const p = props(); mock.resource.value = null; const r = render(<StudioSessionEvidencePanel {...p} />); open();
  expect(screen.getByRole("status").textContent).toContain("확인 중"); mock.resource.failed = true; r.rerender(<StudioSessionEvidencePanel {...p} />);
  expect(screen.getByRole("status").textContent).toContain("확인하지 못했습니다");
  mock.resource.value = { ...evidenceTestResponse(), evidence: null }; r.rerender(<StudioSessionEvidencePanel {...p} />);
  expect(screen.getByRole("status").textContent).toContain("최신 원고로 대체하지 않았습니다"); expect(screen.queryByRole("button", { name: "검토 기록에 인용" })).toBeNull();
});
it("does not cite an expired displayed record before the expiry timer gets CPU time", () => {
  render(<StudioSessionEvidencePanel {...props()} />); open();
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 20_000);
  fireEvent.click(screen.getByRole("button", { name: "검토 기록에 인용" })); expect(command).not.toHaveBeenCalled(); expect(mock.resource.refresh).toHaveBeenCalled(); vi.restoreAllMocks();
});
