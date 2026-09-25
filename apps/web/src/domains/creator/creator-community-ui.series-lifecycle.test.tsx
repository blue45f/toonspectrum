// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SeriesForm } from "./creator-community-ui";

const creatorClient = vi.hoisted(() => ({
  createSeries: vi.fn(),
  updateSeries: vi.fn(),
}));

vi.mock("@/platform/creator-client", () => ({
  createSeries: creatorClient.createSeries,
  updateSeries: creatorClient.updateSeries,
}));

const SAVED_SERIES = {
  id: "series-1",
  title: "별빛 탐정단",
  description: "다음 시즌 준비 중",
  cover: "",
  tags: ["미스터리"],
  status: "hiatus" as const,
  showcaseEnabled: true,
  author: { id: "user-1", name: "작가", avatar: "#123456" },
  episodes: 7,
  views: 120,
  likes: 12,
  latestEpisodeAt: "2026-09-01T00:00:00.000Z",
  isOwner: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  creatorClient.createSeries.mockResolvedValue(SAVED_SERIES);
  creatorClient.updateSeries.mockResolvedValue(SAVED_SERIES);
});

describe("SeriesForm lifecycle controls", () => {
  it("lets a creator start a series in hiatus without coercing it to ongoing", async () => {
    const onSaved = vi.fn();
    render(<SeriesForm onSaved={onSaved} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("시리즈 제목"), {
      target: { value: "별빛 탐정단" },
    });
    fireEvent.change(screen.getByLabelText("시리즈 소개"), {
      target: { value: "다음 시즌 준비 중" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "휴재" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "가상 전시관에 시리즈 배치" }));
    fireEvent.click(screen.getByRole("button", { name: "시리즈 만들기" }));

    await waitFor(() => expect(creatorClient.createSeries).toHaveBeenCalledWith({
      title: "별빛 탐정단",
      description: "다음 시즌 준비 중",
      tags: [],
      status: "hiatus",
      showcaseEnabled: true,
    }));
    expect(onSaved).toHaveBeenCalledWith(SAVED_SERIES);
  });

  it("restores a hiatus series to ongoing explicitly", async () => {
    const onSaved = vi.fn();
    render(
      <SeriesForm
        initial={SAVED_SERIES}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("radio", { name: "휴재" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect((screen.getByRole("checkbox", { name: "가상 전시관에 시리즈 배치" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "연재중" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "가상 전시관에 시리즈 배치" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(creatorClient.updateSeries).toHaveBeenCalledWith(
      "series-1",
      expect.objectContaining({ status: "ongoing", showcaseEnabled: false }),
    ));
    expect(onSaved).toHaveBeenCalledWith(SAVED_SERIES);
  });
});
