// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPublishAccountReviewCard } from "./StudioPublishAccountReviewCard";
import { resolveStudioPublisherIdentity } from "./studio-publish-review-safety";

afterEach(cleanup);

const admin = resolveStudioPublisherIdentity({
  id: "admin-1",
  name: "김희준",
  email: "blue45f@gmail.com",
  role: "admin",
});

describe("StudioPublishAccountReviewCard", () => {
  it("shows the exact account, environment and elevated-role warning", () => {
    render(
      <StudioPublishAccountReviewCard
        identity={admin}
        environment="production"
        visibility="public"
        confirmed={false}
        onConfirmedChange={() => undefined}
      />,
    );

    expect(screen.getAllByText("김희준").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("blue45f@gmail.com")).toBeTruthy();
    expect(screen.getByText("관리자")).toBeTruthy();
    expect(screen.getByText("운영 환경")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("관리 권한 계정");
    expect(screen.getByText("비로그인 독자도 공개 열람")).toBeTruthy();
  });

  it("switches audience copy without changing publication state", () => {
    render(
      <StudioPublishAccountReviewCard
        identity={admin}
        environment="preview"
        visibility="unlisted"
        confirmed={false}
        onConfirmedChange={() => undefined}
      />,
    );

    expect(screen.getByText("직접 링크가 있는 비로그인 독자")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "로그인 독자" }));
    expect(screen.getByText("링크 공개 독자")).toBeTruthy();
    expect(screen.getByRole("button", { name: "로그인 독자" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("reports explicit ownership confirmation through a controlled checkbox", () => {
    const onConfirmedChange = vi.fn();
    render(
      <StudioPublishAccountReviewCard
        identity={admin}
        environment="production"
        visibility="private"
        confirmed={false}
        onConfirmedChange={onConfirmedChange}
      />,
    );

    const checkbox = screen.getByRole("checkbox");
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    fireEvent.click(checkbox);
    expect(onConfirmedChange).toHaveBeenCalledWith(true);
    expect(screen.getByText("비로그인 독자에게 비공개")).toBeTruthy();
  });

  it("does not allow confirmation without an authenticated owner", () => {
    render(
      <StudioPublishAccountReviewCard
        identity={resolveStudioPublisherIdentity(null)}
        environment="unknown"
        visibility="public"
        confirmed={false}
        onConfirmedChange={() => undefined}
      />,
    );

    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("먼저 로그인");
  });
});
