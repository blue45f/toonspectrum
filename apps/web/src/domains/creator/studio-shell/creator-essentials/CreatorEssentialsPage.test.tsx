// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import CreatorEssentialsPage from "./CreatorEssentialsPage";

const downloads = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock("./creator-essentials-download", () => ({
  downloadCreatorEssential: downloads.run,
}));
vi.mock("./CreatorEssentialModelPreview", () => ({
  default: () => <div data-testid="model-preview-content">model preview</div>,
}));

function Location() {
  return <output data-testid="location">{useLocation().search}</output>;
}

function mount(query = "?view=essentials&project=project-12") {
  return render(
    <MemoryRouter initialEntries={[`/studio/assets${query}`]}>
      <CreatorEssentialsPage />
      <Location />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
  downloads.run.mockReset();
  downloads.run.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("creator essentials page", () => {
  it("renders all 48 useful originals with lazy thumbnails and explicit limitations", () => {
    mount();

    expect(screen.getAllByRole("article")).toHaveLength(48);
    expect(screen.getByText(/48 \/ 48개 소재/u)).toBeTruthy();
    expect(screen.getByText(/자동 2D→3D 복원/u)).toBeTruthy();
    for (const image of screen.getAllByRole("img")) {
      expect(image.getAttribute("loading")).toBe("lazy");
    }
    expect(screen.queryByTestId("model-preview-content")).toBeNull();
  });

  it("preserves project context while filtering and clearing an empty result", async () => {
    mount();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "no-matching-asset" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "pose-2d" },
    });

    expect(await screen.findByText("검색에 맞는 소재가 없습니다")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toContain("project=project-12");
    expect(screen.getByTestId("location").textContent).toContain("q=no-matching-asset");
    expect(screen.getByTestId("location").textContent).toContain("category=pose-2d");

    fireEvent.click(screen.getByRole("button", { name: "검색·필터 초기화" }));

    await waitFor(() => {
      expect(screen.getAllByRole("article")).toHaveLength(48);
    });
    expect(screen.getByTestId("location").textContent).toContain("project=project-12");
    expect(screen.getByTestId("location").textContent).not.toContain("q=");
    expect(screen.getByTestId("location").textContent).not.toContain("category=");
  });

  it("downloads an original asset and reports completion", async () => {
    mount();

    const button = screen.getAllByRole("button", { name: /SVG 저장/u })[0];
    expect(button).toBeDefined();
    fireEvent.click(button!);

    await waitFor(() => expect(downloads.run).toHaveBeenCalledTimes(1));
    expect(downloads.run.mock.calls[0]?.[1]).toBe(false);
    expect(downloads.run.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal);
    expect(await screen.findByText(/다운로드를 요청했습니다/u)).toBeTruthy();
  });

  it("opens and closes a local 3D preview without downloading", async () => {
    mount();

    const openButton = screen.getAllByRole("button", { name: "3D 미리보기" })[0];
    expect(openButton).toBeDefined();
    fireEvent.click(openButton!);

    expect(await screen.findByTestId("model-preview-content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "미리보기 닫기" }));
    await waitFor(() => expect(screen.queryByTestId("model-preview-content")).toBeNull());
    expect(downloads.run).not.toHaveBeenCalled();
  });

  it("shows an actionable error when a download cannot be verified", async () => {
    downloads.run.mockRejectedValueOnce(new Error("integrity failure"));
    mount();

    const button = screen.getAllByRole("button", { name: /SVG 저장/u })[0];
    expect(button).toBeDefined();
    fireEvent.click(button!);

    expect((await screen.findByRole("alert")).textContent).toContain("소재를 확인하거나 저장하지 못했습니다");
  });
});
