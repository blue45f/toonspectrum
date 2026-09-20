// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResumeEditor } from "./ResumeEditor";
import { emptyResume } from "./hiring-form-values";
import { ResumePreview } from "./ResumePreview";

vi.mock("../collaboration-ui", () => ({ CollabField: ({ label, children }: { label: string; children: React.ReactNode }) => <label>{label}{children}</label>, collabButton: "", collabInput: "", collabPrimary: "" }));
afterEach(cleanup);
describe("structured Korean resume editor", () => {
  it("saves structured roles and contributions without a JSON editor", () => {
    const save = vi.fn(); render(<ResumeEditor initial={emptyResume()} busy={false} onSave={save} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("이력서 이름"), { target: { value: "선화 지원" } });
    fireEvent.change(screen.getByLabelText("활동명"), { target: { value: "그림작가" } });
    fireEvent.click(screen.getByLabelText("선화"));
    fireEvent.click(screen.getByText("작업 경험 추가"));
    fireEvent.change(screen.getByLabelText("작품·프로젝트 이름"), { target: { value: "작품 A" } });
    fireEvent.change(screen.getByLabelText("시작 월"), { target: { value: "2026-01" } });
    fireEvent.change(screen.getByLabelText("직접 기여한 작업"), { target: { value: "1~5화 선화" } });
    fireEvent.submit(screen.getByText("새 버전으로 저장").closest("form")!);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: "선화 지원", expectedRevision: 0, content: expect.objectContaining({ roles: ["lineart"], experiences: [expect.objectContaining({ title: "작품 A", contribution: "1~5화 선화" })] }) }));
    expect(screen.queryByLabelText(/생년월일/u)).toBeNull();
  });
  it("labels self declarations honestly and never links javascript drafts", () => {
    const content = emptyResume().content; content.portfolio = [{ title: "위험 주소", url: "javascript:alert(1)", contribution: "기여", permission: "owned" }];
    render(<ResumePreview content={content} />);
    expect(screen.getByText("위험 주소").getAttribute("href")).toBeNull();
    expect(screen.getByText(/권리·경력 검증 표시는 아닙니다/u)).toBeTruthy();
  });
  it("provides preview and user-triggered print", () => {
    const print = vi.spyOn(globalThis, "print").mockImplementation(() => {});
    render(<ResumeEditor initial={emptyResume()} busy={false} onSave={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByText("미리보기")); fireEvent.click(screen.getByText("인쇄·PDF 저장"));
    expect(print).toHaveBeenCalledOnce(); print.mockRestore();
  });
});
