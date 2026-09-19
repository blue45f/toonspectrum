// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HiringSlotEditor } from "./HiringSlotEditor";
import { emptyTerms } from "./hiring-form-values";

vi.mock("../collaboration-ui", () => ({ CollabField: ({ label, children }: { label: string; children: React.ReactNode }) => <label>{label}{children}</label>, collabButton: "", collabInput: "", collabPrimary: "" }));
afterEach(cleanup);
describe("supported compensation confirmation", () => {
  it.each(["employment", "freelance-task"])("blocks unpaid %s without silently changing the collaboration model", (model) => {
    const save = vi.fn(); render(<HiringSlotEditor initial={emptyTerms()} busy={false} onSave={save} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("협업 형태"), { target: { value: model } });
    fireEvent.change(screen.getByLabelText("보수 방식"), { target: { value: "unpaid" } });
    const submit = screen.getByRole("button", { name: "모집 조건 저장" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true); expect((screen.getByLabelText("협업 형태") as HTMLSelectElement).value).toBe(model);
    fireEvent.submit(submit.closest("form")!); expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("보수 방식"), { target: { value: "paid" } });
    expect(submit.disabled).toBe(false);
  });
  it("explains and blocks unsupported revenue-share even for co-creation", () => {
    const save = vi.fn(); render(<HiringSlotEditor initial={{ ...emptyTerms(), model: "co-creation" }} busy={false} onSave={save} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("보수 방식"), { target: { value: "revenue-share" } });
    expect(screen.getByText(/아직 지원하지 않아 저장·확정할 수 없습니다/u)).toBeTruthy();
    const submit = screen.getByRole("button", { name: "모집 조건 저장" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true); fireEvent.submit(submit.closest("form")!); expect(save).not.toHaveBeenCalled();
  });
});
