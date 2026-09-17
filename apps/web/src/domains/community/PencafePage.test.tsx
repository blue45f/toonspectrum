// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { PencafePage } from "./PencafePage";

vi.mock("@/shared/components/fan-cafe-panel", () => ({
  FanCafePanel: () => <div data-testid="fan-cafe-panel" />,
}));

vi.mock("@/shared/components/share-page-button", () => ({
  SharePageButton: (props: {
    path: string;
    text: string;
    label?: string;
    actionLabel?: string;
  }) => (
    <output
      data-testid="share-probe"
      data-path={props.path}
      data-title={props.text}
      data-label={props.label}
      data-action-label={props.actionLabel}
    />
  ),
}));

afterEach(cleanup);
describe("PencafePage", () => {
  it("shares the public fan cafe with an encoded canonical route", () => {
    render(
      <MemoryRouter initialEntries={["/pencafe/%EC%9B%B9%ED%88%B0%20%EC%97%B0%EA%B5%AC%ED%9A%8C"]}>
        <Routes>
          <Route path="/pencafe/:name" element={<PencafePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "웹툰 연구회 펜카페" })).toBeTruthy();
    const share = screen.getByTestId("share-probe");
    expect(share.getAttribute("data-path"))
      .toBe("/pencafe/%EC%9B%B9%ED%88%B0%20%EC%97%B0%EA%B5%AC%ED%9A%8C");
    expect(share.getAttribute("data-title")).toBe("웹툰 연구회 펜카페");
    expect(share.getAttribute("data-label")).toBe("펜카페 공유");
    expect(share.getAttribute("data-action-label")).toBe("펜카페 보기");
  });
});
