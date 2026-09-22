// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FortuneReading } from "@toonspectrum/core/fortune";
import { CampusPaletteContext } from "@/shared/components/spatial-campus/campus-palette-context";
import { FortuneReadingView } from "./FortuneReadingView";

vi.mock("./FortuneStoryReader", () => ({ FortuneStoryReader: () => null }));
vi.mock("./FortuneEnrichment", () => ({ FortuneEnrichment: () => null }));
vi.mock("./FortuneReadingTools", () => ({
  FortuneCreativeMission: () => null,
  FortuneReadingTools: () => null,
}));
vi.mock("./FortuneVisuals", () => ({
  FortuneElementOrbit: () => null,
  FortuneExperienceArt: () => null,
}));

const reading: FortuneReading = {
  id: "lucky",
  title: "행운 팔레트",
  eyebrow: "오늘의 색",
  summary: "색만 골라 창작에 사용할 수 있어요.",
  generatedFor: "2026-09-22",
  sections: [],
  notes: [],
  colors: [{ name: "밤", hex: "#112233" }, { name: "빛", hex: "#aabbcc" }],
};
afterEach(cleanup);

describe("observatory palette handoff", () => {
  it("sends only HEX colors and renders the Studio receipt", async () => {
    const save = vi.fn(async (colors: readonly string[]) => ({
      paletteId: "palette-A",
      colorCount: colors.length,
      authority: "studio-sqlite" as const,
    }));
    render(<CampusPaletteContext.Provider value={save}>
      <FortuneReadingView reading={reading} />
    </CampusPaletteContext.Provider>);

    fireEvent.click(screen.getByRole("button", { name: /이 색만 Studio 팔레트로 저장/ }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(["#112233", "#aabbcc"]));
    expect(screen.getByRole("status").textContent).toContain("2색 팔레트");
    expect(JSON.stringify(save.mock.calls)).not.toContain("행운 팔레트");
    expect(JSON.stringify(save.mock.calls)).not.toContain("오늘의 색");
  });

  it("does not claim success when the handoff is cancelled by a context change", async () => {
    const save = vi.fn(async () => { throw new DOMException("changed", "AbortError"); });
    render(<CampusPaletteContext.Provider value={save}>
      <FortuneReadingView reading={reading} />
    </CampusPaletteContext.Provider>);
    fireEvent.click(screen.getByRole("button", { name: /이 색만 Studio 팔레트로 저장/ }));
    await screen.findByText(/저장을 취소했어요/);
    expect(screen.queryByText(/Studio 색상 라이브러리에 2색/)).toBeNull();
  });

  it("keeps the action absent outside the campus handoff boundary", () => {
    render(<FortuneReadingView reading={reading} />);
    expect(screen.queryByRole("button", { name: /Studio 팔레트로 저장/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /색상 복사/ })).toHaveLength(2);
  });
});
