// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStudioWorkSession, reduceStudioWorkSession, type StudioSessionResources, type StudioWorkSession, type StudioWorkSessionCommand,
  type StudioWorkSessionView } from "@toonspectrum/studio-project-model/work-session";
import { StudioSessionAgenda } from "./StudioSessionAgenda";
import { StudioSessionMaterialBoard } from "./StudioSessionMaterialBoard";
import type { StudioWorkSessionController } from "./studio-work-session-controller";

vi.mock("./StudioSessionMaterialPreview", () => ({ StudioSessionMaterialPreview: () => <div>Bounded private-asset preview</div> }));
const host = { userId: "host", canEdit: true, canComment: true }, at = "2026-09-21T10:00:00.000Z";
const source = { version: 1 as const, sourceServerRevision: 7, sourceContentDigest: "a".repeat(64), pageOrdinal: 0, pageId: "page-1" };
const asset = { assetId: "asset-1", elementType: "image" as const, sha256: "b".repeat(64), title: "교실 배경" };
const item = { id: "agenda-1", source, title: "첫 장면", purpose: "시선 확인", dialogue: "원래 대사 제안", assignedUserId: null };
const candidate = { id: "candidate-1", title: "후보 A", asset: { assetId: asset.assetId, sha256: asset.sha256, elementType: asset.elementType }, rationale: "목적에 맞는 배경", usageConditions: "별도 권리 확인 필요" };
type Intent<T = StudioWorkSessionCommand> = T extends StudioWorkSessionCommand ? Omit<T, "operationId" | "expectedVersion"> : never;
function step(session: StudioWorkSession, intent: Intent) { return reduceStudioWorkSession(session, { ...intent, operationId: `op-${session.version}`, expectedVersion: session.version }, host, at); }
function fixture(kind: StudioWorkSession["kind"] = "reading") {
  let session = createStudioWorkSession({ id: "session", operationId: "create", title: "검토 세션", purpose: "고정 원고 검토", kind,
    input: { schemaVersion: 1, workId: "work", projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "revision", rootGraphHash: source.sourceContentDigest }, invitedUserIds: [] }, host, at);
  session = kind === "material-choice" ? step(session, { action: "material-propose", candidate }) : step(session, { action: "agenda-add", item });
  session = step(step(session, { action: "ready" }), { action: "start" });
  const view: StudioWorkSessionView = { session, capabilities: { edit: true, comment: true } };
  const command = vi.fn(async (intent: Intent) => { view.session = step(view.session, intent); });
  const controller = { command, getSnapshot: () => ({ phase: "ready", view }) } as unknown as StudioWorkSessionController;
  const resources: StudioSessionResources = { workId: "work", sessionId: "session", inputDigest: source.sourceContentDigest,
    expiresAt: new Date(Date.now() + 15000).toISOString(), sourceStatus: "mapped",
    pages: [{ source, title: "Page 1", frameIds: ["frame-1"], previewCursor: null }], nextPageOffset: null, assets: [asset] };
  return { view, actorId: "host", controller, command, resources, busy: false, saving: false, name: (id: string) => id, onInspect: vi.fn() };
}
beforeEach(() => sessionStorage.clear());
afterEach(cleanup);
const click = async (name: string) => { await act(async () => { fireEvent.click(screen.getByRole("button", { name })); }); };

describe("actual agenda and candidate surfaces", () => {
  it("opens read-only, inspects the exact saved page and never automatically follows or mutates", async () => {
    const f = fixture(); render(<StudioSessionAgenda {...f} />);
    expect(f.command).not.toHaveBeenCalled();
    await click("이 페이지 직접 보기"); expect(f.onInspect).toHaveBeenCalledExactlyOnceWith(source); expect(f.command).not.toHaveBeenCalled();
  });
  it("keeps editor focus and input across refresh, then prevents overwriting a newer item revision", async () => {
    const f = fixture(); const r = render(<StudioSessionAgenda {...f} />);
    await click("제안 내용 편집");
    const field = screen.getByRole("textbox", { name: "대사 제안 수정" }); field.focus();
    fireEvent.change(field, { target: { value: "아직 저장하지 않은 수정" } });
    r.rerender(<StudioSessionAgenda {...f} busy saving={false} />);
    expect(field.matches(":disabled")).toBe(false); expect(document.activeElement).toBe(field);
    expect(screen.getByRole("button", { name: "현재 제안 저장" }).matches(":disabled")).toBe(true);
    f.view.session = step(f.view.session, { action: "agenda-edit", itemId: item.id, expectedItemRevision: 1, title: item.title, purpose: item.purpose, dialogue: "다른 탭 수정", assignedUserId: null });
    r.rerender(<StudioSessionAgenda {...f} />);
    expect((field as HTMLTextAreaElement).value).toBe("아직 저장하지 않은 수정");
    expect(screen.getByRole("button", { name: "현재 제안 저장" }).matches(":disabled")).toBe(true);
    fireEvent.submit(field.closest("form")!); expect(f.command).not.toHaveBeenCalled();
  });
  it("recovers item edits after an error remount only under the same actor key", async () => {
    const f = fixture(); const first = render(<StudioSessionAgenda {...f} />); await click("제안 내용 편집");
    fireEvent.change(screen.getByRole("textbox", { name: "대사 제안 수정" }), { target: { value: "복구할 제안" } }); first.unmount();
    const second = render(<StudioSessionAgenda {...f} />);
    expect((screen.getByRole("textbox", { name: "대사 제안 수정" }) as HTMLTextAreaElement).value).toBe("복구할 제안"); second.unmount();
    render(<StudioSessionAgenda {...f} actorId="another" />);
    expect(screen.queryByRole("textbox", { name: "대사 제안 수정" })).toBeNull();
  });
  it("records an explicit conclusion with the originally observed item version and leaves review state unchanged", async () => {
    const f = fixture(); render(<StudioSessionAgenda {...f} />);
    fireEvent.change(screen.getByRole("textbox", { name: "이 안건의 결론" }), { target: { value: "대사 수정 후 재검토" } });
    await click("결론 확정 기록");
    expect(f.command).toHaveBeenCalledExactlyOnceWith({ action: "agenda-conclude", itemId: item.id, expectedItemRevision: 1, body: "대사 수정 후 재검토" });
    expect(f.view.session.results).toEqual([]); expect(f.view.session.status).toBe("active");
  });
  it("retains failed proposal input, blocks missing sources and adds only a verified pinned cut", async () => {
    const f = fixture(); const r = render(<StudioSessionAgenda {...f} />);
    fireEvent.click(screen.getByText("새 안건 추가"));
    fireEvent.change(screen.getByRole("combobox", { name: "고정 페이지" }), { target: { value: "page-1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "고정 컷" }), { target: { value: "frame-1" } });
    fireEvent.change(screen.getByRole("textbox", { name: "안건 제목" }), { target: { value: "두 번째 안건" } });
    r.rerender(<StudioSessionAgenda {...f} resources={null} />);
    expect(screen.getByRole("button", { name: "고정 원고에 안건 연결" }).matches(":disabled")).toBe(true);
    r.rerender(<StudioSessionAgenda {...f} />);
    await click("고정 원고에 안건 연결");
    expect(f.command).toHaveBeenCalledWith(expect.objectContaining({ action: "agenda-add", item: expect.objectContaining({ title: "두 번째 안건", source: { ...source, frameId: "frame-1" } }) }));
    expect((screen.getByRole("textbox", { name: "안건 제목" }) as HTMLInputElement).value).toBe("");
  });
  it("keeps ordinary participants from changing agenda order, contents or conclusions", () => {
    const f = fixture(); f.view = { ...f.view, capabilities: { edit: false, comment: true } };
    render(<StudioSessionAgenda {...f} />);
    expect(screen.queryByRole("button", { name: "제안 내용 편집" })).toBeNull();
    expect(screen.queryByRole("button", { name: "결론 확정 기록" })).toBeNull();
    expect(screen.getByRole("button", { name: "이 페이지 직접 보기" })).toBeTruthy();
  });
  it("casts one explicit ballot without insertion, buying or automatic selection", async () => {
    const f = fixture("material-choice"); render(<StudioSessionMaterialBoard {...f} />);
    expect(f.command).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "내 투표 근거" }), { target: { value: "조명 방향이 맞음" } });
    await click("이 후보에 투표"); expect(f.command).toHaveBeenCalledExactlyOnceWith({ action: "material-vote", candidateId: candidate.id, rationale: "조명 방향이 맞음" });
    expect(f.view.session.workflow!.materialDecisions).toEqual([]); expect(f.view.session.results).toEqual([]);
  });
  it("requires reinspection of changed ballots before a host can record selection", async () => {
    const f = fixture("material-choice"), r = render(<StudioSessionMaterialBoard {...f} />);
    await click("선정 검토…"); fireEvent.change(screen.getByRole("textbox", { name: "선정·보류 근거" }), { target: { value: "비교 후 선정" } });
    f.view.session = step(f.view.session, { action: "material-vote", candidateId: candidate.id, rationale: "새 투표" });
    r.rerender(<StudioSessionMaterialBoard {...f} />);
    expect(screen.getByRole("button", { name: "근거와 함께 기록" }).matches(":disabled")).toBe(true);
    await click("최신 상태 확인함"); await click("근거와 함께 기록");
    expect(f.command).toHaveBeenCalledExactlyOnceWith({ action: "material-decide", candidateId: candidate.id, observedVersion: 5, rationale: "비교 후 선정" });
    expect(f.view.session.workflow!.materialDecisions[0]!.votes).toHaveLength(1);
  });
  it("does not show candidate mutation on closed sessions and rejects unavailable files", () => {
    const f = fixture("material-choice"), r = render(<StudioSessionMaterialBoard {...f} resources={{ ...f.resources, assets: [] }} />);
    expect(screen.getByRole("button", { name: "이 후보에 투표" }).matches(":disabled")).toBe(true);
    f.view.session = step(f.view.session, { action: "close", summary: "다음 검토 필요" });
    r.rerender(<StudioSessionMaterialBoard {...f} />);
    expect(screen.queryByRole("button", { name: "이 후보에 투표" })).toBeNull();
    expect(within(screen.getByRole("article", { name: candidate.title })).getByText(candidate.usageConditions)).toBeTruthy();
  });
});
