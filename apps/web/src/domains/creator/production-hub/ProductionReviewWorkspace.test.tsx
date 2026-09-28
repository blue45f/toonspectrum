// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductionReviewWorkspace } from "./ProductionReviewWorkspace";
import { createProductionDemoProject } from "./production-demo";
import type { ProductionProjectAggregate } from "@toonstudio/core/production";

afterEach(cleanup);
function mount(aggregate = createProductionDemoProject(), execute = vi.fn(async () => undefined)) {
  render(<ProductionReviewWorkspace aggregate={aggregate} canEdit roleLens="art" execute={execute} />);
  return execute;
}
describe("검수 우선순위와 컷별 입력", () => {
  it("해결된 질문과 완료된 수정 요청을 열린 이슈 집계에서 제외한다", () => {
    const base = createProductionDemoProject();
    mount({ ...base, clarifications: base.clarifications.map((entry) => ({ ...entry, status: "closed" })),
      changeRequests: base.changeRequests.map((entry) => ({ ...entry, status: "completed" })) });
    fireEvent.click(screen.getByRole("button", { name: "열린 이슈 컷" }));
    const navigator = screen.getByRole("complementary", { name: "검수 컷 목록" });
    expect(within(navigator).queryAllByRole("button", { name: /컷으로 이동/ })).toHaveLength(0);
    expect(within(navigator).getByRole("button", { name: /필터 초기화/ })).toBeTruthy();
  });
  it("컷을 바꿨다가 돌아와도 질문 초안과 차단 설정을 보존한다", () => {
    mount();
    fireEvent.change(screen.getByRole("textbox", { name: "검수 질문" }), { target: { value: "첫 컷의 의도 확인" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "cut-12-002 컷으로 이동" }));
    expect((screen.getByRole("textbox", { name: "검수 질문" }) as HTMLTextAreaElement).value).toBe("");
    fireEvent.change(screen.getByRole("textbox", { name: "검수 질문" }), { target: { value: "두 번째 컷 질문" } });
    fireEvent.click(screen.getByRole("button", { name: "cut-12-001 컷으로 이동" }));
    expect((screen.getByRole("textbox", { name: "검수 질문" }) as HTMLTextAreaElement).value).toBe("첫 컷의 의도 확인");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });
  it("질문 저장 실패를 표시하고 같은 컷의 입력을 유지한다", async () => {
    const execute = vi.fn(async () => { throw new Error("검수 서버 연결 실패"); });
    mount(createProductionDemoProject(), execute);
    fireEvent.change(screen.getByRole("textbox", { name: "검수 질문" }), { target: { value: "보존할 검수 질문" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 추가" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("검수 서버 연결 실패"));
    expect((screen.getByRole("textbox", { name: "검수 질문" }) as HTMLTextAreaElement).value).toBe("보존할 검수 질문");
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("다른 회차의 검수 라운드를 현재 회차 결정에 재사용하지 않는다", async () => {
    const base = createProductionDemoProject();
    const aggregate: ProductionProjectAggregate = { ...base, reviewDecisions: base.reviewDecisions.map((decision) => ({
      ...decision, reviewRoundId: "unrelated-round", evidenceScopeRefs: [{ kind: "episode", id: "episode-13", ancestors: [{ kind: "project", id: base.projectId }] }],
    })) };
    const execute = mount(aggregate);
    fireEvent.click(screen.getAllByRole("button", { name: "승인" })[0]!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "record-review-decision",
      decision: expect.objectContaining({ reviewRoundId: "episode-12-review-round-1" }),
    }), expect.any(String)));
  });
});
