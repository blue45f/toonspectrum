// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useHashAnchorScroll } from "./useHashAnchorScroll";

const KNOWN = ["ai-runtime"] as const;

function Page() {
  useHashAnchorScroll(KNOWN);
  return (
    <>
      <section id="ai-runtime">runtime</section>
      <section id="other">other</section>
    </>
  );
}

afterEach(cleanup);

describe("useHashAnchorScroll", () => {
  it("scrolls to a known section from a cross-page hash link", async () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, writable: true, value: scroll });
    render(<MemoryRouter initialEntries={["/studio/ai-lab#ai-runtime"]}><Page /></MemoryRouter>);
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: "start" }));
    expect(document.activeElement?.id).toBe("ai-runtime");
  });

  it("ignores unknown or malformed hashes", async () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, writable: true, value: scroll });
    render(<MemoryRouter initialEntries={["/studio/ai-lab#other"]}><Page /></MemoryRouter>);
    cleanup();
    render(<MemoryRouter initialEntries={["/studio/ai-lab#%E0%A4%A"]}><Page /></MemoryRouter>);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    expect(scroll).not.toHaveBeenCalled();
  });
});
