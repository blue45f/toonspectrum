// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  creatorIntelligenceClient,
  type CreatorIntelligenceStatus,
} from "./studio-creator-intelligence-client";
import { StudioCreatorIntelligencePanel } from "./StudioCreatorIntelligencePanel";

const ready = { status: "ready", reason: "configured" } as const;
const disabled = { status: "disabled", reason: "not enabled" } as const;

const providerStatus: CreatorIntelligenceStatus = {
  schema: "toonspectrum.creator-intelligence.status.v1",
  references: { openverse: ready, pexels: ready, pixabay: ready },
  translation: { deepl: disabled, libretranslate: disabled },
  voice: { gemini: ready, deepgram: ready },
  scene: disabled,
  anilist: disabled,
  freesound: disabled,
  soundEffects: disabled,
  meshy: disabled,
  safeSearch: disabled,
};
function renderPanel() {
  return render(
    <MemoryRouter>
      <StudioCreatorIntelligencePanel projectId="project-alpha" locale="ko" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(creatorIntelligenceClient, "status").mockResolvedValue(providerStatus);
  vi.spyOn(creatorIntelligenceClient, "references").mockResolvedValue({
    provider: "pexels",
    status: "ready",
    page: 1,
    hasMore: false,
    cache: { hit: false, ttlSeconds: 21_600 },
    notice: "Keep photographer/Pexels attribution metadata.",
    items: [{
      id: "pexels:42",
      provider: "pexels",
      title: "Rainy city reference",
      creator: "Reference Photographer",
      sourceUrl: "https://www.pexels.com/photo/42/",
      creatorUrl: "https://www.pexels.com/@reference-photographer/",
      previewUrl: "https://images.pexels.com/photos/42/preview.jpeg",
      license: "Pexels License",
      licenseUrl: "https://www.pexels.com/license/",
      width: 1200,
      height: 800,      rightsStatus: "provider-license",
      importable: false,
      fetchedAt: "2026-09-25T00:00:00.000Z",
    }],
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("StudioCreatorIntelligencePanel free reference APIs", () => {
  it("shows free-provider guardrails and quick reference starters", async () => {
    renderPanel();

    await waitFor(() => expect(creatorIntelligenceClient.status).toHaveBeenCalledTimes(1));
    expect(screen.getByText("무료 Openverse/Pexels/Pixabay 검색을 하나의 보드로 연결하고, 출처·작가·라이선스를 프로젝트와 함께 보존합니다. 외부 이미지는 자동 반입하지 않습니다.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "배경" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "실내" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "소품" })).toBeTruthy();
    expect(screen.getAllByText("무료 API").length).toBeGreaterThan(0);
  });

  it("searches Pexels, shows provenance, and saves the reference", async () => {
    renderPanel();
    await waitFor(() => expect(creatorIntelligenceClient.status).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("reference provider"), {      target: { value: "pexels" },
    });
    fireEvent.click(screen.getByRole("button", { name: "배경" }));

    await waitFor(() => expect(creatorIntelligenceClient.references).toHaveBeenCalledWith(
      "pexels",
      "cinematic rainy night alley background",
    ));
    expect(await screen.findByRole("img", { name: "Rainy city reference" })).toBeTruthy();
    expect(screen.getByText("Pexels License")).toBeTruthy();
    expect(screen.getByText(/새 API 응답/u)).toBeTruthy();
    expect(screen.getAllByText(/6h/u).length).toBeGreaterThanOrEqual(2);

    const source = screen.getByRole("link", { name: "원본 출처" });
    expect(source.getAttribute("href")).toBe("https://www.pexels.com/photo/42/");
    const license = screen.getByRole("link", { name: "라이선스" });
    expect(license.getAttribute("href")).toBe("https://www.pexels.com/license/");

    fireEvent.click(screen.getByRole("button", { name: "프로젝트에 보관" }));
    const savedButton = await screen.findByRole("button", { name: "출처와 함께 저장됨" });
    expect((savedButton as HTMLButtonElement).disabled).toBe(true);
  });
});
