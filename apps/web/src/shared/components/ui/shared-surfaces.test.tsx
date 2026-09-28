// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import { Segmented, UnderlineTabs } from "./segmented";
import { Select } from "./select";
import { LoadingState } from "../LoadingState";
import { ErrorState } from "../feedback/error-state";

afterEach(cleanup);

describe("공통 표면의 상호작용 보존", () => {
  it("링크형 버튼은 목적지와 키보드 접근성을 유지한다", () => {
    render(<Button asChild variant="outline"><a href="/studio/projects">프로젝트 열기</a></Button>);
    const link = screen.getByRole("link", { name: "프로젝트 열기" });
    expect(link.getAttribute("href")).toBe("/studio/projects");
    expect(link.getAttribute("data-slot")).toBe("button");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each([Segmented, UnderlineTabs])("탭의 키보드 선택은 양식 제출을 발생시키지 않는다", (Tabs) => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    function Example() {
      const [value, setValue] = useState("projects");
      return <form onSubmit={submit}><Tabs value={value} onChange={setValue} items={[
        { value: "projects", label: "프로젝트" }, { value: "assets", label: "소재" }, { value: "review", label: "검토" },
      ]} /><output>{value}</output></form>;
    }
    render(<Example />);
    const first = screen.getByRole("tab", { name: "프로젝트" });
    first.focus();
    fireEvent.keyDown(first, { key: "End" });
    const last = screen.getByRole("tab", { name: "검토" });
    expect(last.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(last);
    fireEvent.click(screen.getByRole("tab", { name: "소재" }));
    expect(screen.getByRole("tab", { name: "소재" }).getAttribute("aria-selected")).toBe("true");
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getAllByRole("tab").every((tab) => tab.getAttribute("type") === "button")).toBe(true);
  });

  it("선택기의 현재 값과 접근 가능한 레이블을 보존한다", () => {
    render(<Select value="draft" onValueChange={vi.fn()} ariaLabel="제작 상태" options={[
      { value: "draft", label: "초안" }, { value: "ready", label: "검토 대기" },
    ]} />);
    const select = screen.getByRole("combobox", { name: "제작 상태" });
    expect(select.textContent).toContain("초안");
    expect(select.getAttribute("data-slot")).toBe("select-trigger");
  });

  it("로딩에서 실패로 전환해도 상태 안내와 재시도 동작을 보존한다", () => {
    const retry = vi.fn();
    const result = render(<LoadingState variant="cards" cardCount={2} label="작품 불러오는 중" />);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(result.container.querySelectorAll("[data-skeleton-card]")).toHaveLength(2);
    result.rerender(<ErrorState title="작품을 불러오지 못했습니다" message="연결을 확인하고 다시 시도하세요." onRetry={retry} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("연결을 확인");
    fireEvent.click(screen.getByRole("button"));
    expect(retry).toHaveBeenCalledOnce();
  });
});
