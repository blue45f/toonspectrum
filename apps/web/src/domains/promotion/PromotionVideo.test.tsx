// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PromotionVideo } from "./PromotionVideo";

afterEach(cleanup);
describe("promotion video privacy boundary", () => {
  it("does not contact the provider before an explicit click", () => {
    const { container } = render(<PromotionVideo url="https://youtu.be/dQw4w9WgXcQ" title="작품" />);
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /홍보 영상 보기/u }));
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(iframe?.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(iframe?.getAttribute("allow")).not.toContain("autoplay");
  });
  it("does not render arbitrary iframe HTML or lookalike provider hosts", () => {
    const { container } = render(<PromotionVideo url="https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ" title="작품" />);
    expect(container.childElementCount).toBe(0);
  });
  it("requires fresh consent when the video changes", () => {
    const view = render(<PromotionVideo url="https://youtu.be/dQw4w9WgXcQ" title="작품" />);
    fireEvent.click(screen.getByRole("button", { name: /홍보 영상 보기/u }));
    view.rerender(<PromotionVideo url="https://vimeo.com/123456789" title="다른 작품" />);
    expect(view.container.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("link", { name: /Vimeo에서 보기/u }).getAttribute("href")).toBe("https://vimeo.com/123456789");
    view.rerender(<PromotionVideo url="https://youtu.be/dQw4w9WgXcQ" title="원래 작품" />);
    expect(view.container.querySelector("iframe")).toBeNull();
  });
});
