// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioWorkSession, emptyStudioSessionWorkflow, type StudioWorkSession } from "@toonspectrum/studio-project-model/work-session";
import { StudioSessionClosingDraft } from "./StudioSessionClosingDraft";
import { buildStudioSessionClosingDraft } from "./studio-session-closing-draft";

const at = "2026-09-21T00:00:00.000Z", ko = (value: string) => value;
const fixture = (): StudioWorkSession => createStudioWorkSession({ id: "session", operationId: "create", title: "리딩", purpose: "고정 컷 논의", kind: "reading",
  input: { schemaVersion: 1, workId: "work", projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "pin-1", rootGraphHash: "a".repeat(64) }, invitedUserIds: [] },
{ userId: "host", canEdit: true, canComment: true }, at);
afterEach(cleanup);
const create = () => fireEvent.click(screen.getByRole("button", { name: "기록으로 종료 초안 만들기" }));
const apply = () => screen.getByRole<HTMLButtonElement>("button", { name: "검토한 초안 적용" });
const preview = () => screen.getByRole<HTMLTextAreaElement>("textbox", { name: "검토용 종료 초안" }).value;

describe("record-derived closing draft", () => {
  it("does not invent outcomes or treat missing records as completion", () => {
    const session = fixture(), before = JSON.stringify(session), text = buildStudioSessionClosingDraft(session, ko);
    expect(text).toContain("pin-1"); expect(text).toContain("아직 기록된 결정이 없습니다");
    expect(text).toContain("모든 작업이 완료됐다는 뜻은 아닙니다");
    expect(text).toContain("다음 행동을 직접 보완하세요"); expect(JSON.stringify(session)).toBe(before);
  });
  it("copies recorded conclusions and unresolved items without treating AI notes as verified decisions", () => {
    const session = fixture(); session.notes = [
      { id: "a", authorUserId: "host", at, category: "decision", body: "대사를 수정한다" },
      { id: "b", authorUserId: "host", at, category: "unresolved", body: "시선 재확인" },
      { id: "c", authorUserId: "host", at, category: "ai-evidence", body: "unverified AI assertion" }];
    session.workflow = { ...emptyStudioSessionWorkflow(), agenda: [{ id: "agenda", revision: 1, title: "결론 없는 컷",
      source: { version: 1, sourceServerRevision: 1, sourceContentDigest: "a".repeat(64), pageOrdinal: 0, pageId: "page" },
      purpose: "확인", dialogue: "미승인 대사 제안", assignedUserId: null, createdBy: "host", createdAt: at, updatedBy: "host", updatedAt: at, outcome: null }] };
    const text = buildStudioSessionClosingDraft(session, ko);
    expect(text).toContain("대사를 수정한다"); expect(text).toContain("시선 재확인");
    expect(text).toContain("결론 없는 컷"); expect(text).not.toContain("unverified AI assertion");
    expect(text).not.toContain("미승인 대사 제안");
  });
  it("uses the latest material decision and preserves explicit rights uncertainty", () => {
    const session = fixture(); session.workflow = { ...emptyStudioSessionWorkflow(),
      materialCandidates: [{ id: "candidate", title: "배경 A", asset: { assetId: "file", elementType: "image", sha256: "b".repeat(64) },
        proposedBy: "host", proposedAt: at, withdrawnAt: null, rationale: "대비", usageConditions: "사용권 미확인" }],
      materialDecisions: [{ candidateId: "candidate", authorUserId: "host", at, rationale: "구도 선택", sessionVersion: 2, votes: [] }] };
    const text = buildStudioSessionClosingDraft(session, ko);
    expect(text).toContain("배경 A"); expect(text).toContain("사용권 미확인"); expect(text).toContain("사용권·삽입·구매·공개를 의미하지 않습니다");
    session.workflow.materialDecisions.push({ candidateId: null, authorUserId: "host", at, rationale: "조건 재검토", sessionVersion: 3, votes: [] });
    expect(buildStudioSessionClosingDraft(session, ko)).toContain("재논의 중");
    expect(buildStudioSessionClosingDraft(session, ko)).not.toContain("기록된 선정: 배경 A");
  });
  it("requires a user preview and apply, with no write port", () => {
    const onApply = vi.fn(); render(<StudioSessionClosingDraft session={fixture()} currentSummary="" busy={false} onApply={onApply} />);
    expect(screen.queryByRole("textbox")).toBeNull(); create();
    expect(onApply).not.toHaveBeenCalled(); const expected = preview();
    fireEvent.click(apply()); expect(onApply).toHaveBeenCalledExactlyOnceWith(expected);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("does not overwrite existing input without separate consent", () => {
    const onApply = vi.fn(); render(<StudioSessionClosingDraft session={fixture()} currentSummary="직접 쓴 결론" busy={false} onApply={onApply} />);
    create(); expect(apply().disabled).toBe(true); fireEvent.click(apply()); expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox")); expect(apply().disabled).toBe(false);
    fireEvent.click(apply()); expect(onApply).toHaveBeenCalledTimes(1);
  });
  it.each(["version", "input"])("blocks a draft after the %s changes", (changed) => {
    const session = fixture(), onApply = vi.fn();
    const view = render(<StudioSessionClosingDraft session={session} currentSummary="original" busy={false} onApply={onApply} />);
    create(); fireEvent.click(screen.getByRole("checkbox"));
    view.rerender(<StudioSessionClosingDraft session={changed === "version" ? { ...session, version: 2 } : session}
      currentSummary={changed === "input" ? "updated" : "original"} busy={false} onApply={onApply} />);
    expect(apply().disabled).toBe(true); fireEvent.click(apply()); expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("바뀌었습니다");
    fireEvent.click(screen.getByRole("button", { name: "최신 기록으로 다시 만들기" }));
    expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(false);
    expect(apply().disabled).toBe(true);
  });
  it("never truncates oversized records or silently applies a partial summary", () => {
    const session = fixture(); session.notes = Array.from({ length: 4 }, (_, i) => ({ id: `n${i}`, authorUserId: "host", at,
      category: "decision", body: "결정".repeat(999) }));
    const onApply = vi.fn(); render(<StudioSessionClosingDraft session={session} currentSummary="" busy={false} onApply={onApply} />); create();
    expect(preview().length).toBeGreaterThan(4000); expect(preview().match(/결정결정/g)?.length).toBeGreaterThan(1000);
    expect(apply().disabled).toBe(true); fireEvent.click(apply()); expect(onApply).not.toHaveBeenCalled();
  });
  it("clears previews on scope changes and blocks application while busy", () => {
    const session = fixture(), onApply = vi.fn();
    const view = render(<StudioSessionClosingDraft session={session} currentSummary="" busy={false} onApply={onApply} />); create();
    view.rerender(<StudioSessionClosingDraft session={session} currentSummary="" busy onApply={onApply} />);
    expect(apply().disabled).toBe(true); fireEvent.click(apply()); expect(onApply).not.toHaveBeenCalled();
    view.rerender(<StudioSessionClosingDraft session={{ ...session, id: "other" }} currentSummary="" busy={false} onApply={onApply} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    view.rerender(<StudioSessionClosingDraft session={session} currentSummary="" busy={false} onApply={onApply} />);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
