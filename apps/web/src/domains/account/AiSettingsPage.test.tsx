// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

import { AiSettingsPage } from "./AiSettingsPage";

import { useI18n } from "@/shared/lib/i18n";

vi.mock("@/shared/ai/UnifiedAiSettings", () => ({
  UnifiedAiSettings: () => <div data-testid="unified-ai-settings" />,
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock("@/shared/components/section", () => ({
  Container: ({ children, ...rest }: { children?: React.ReactNode }) => <div {...rest}>{children}</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  useI18n.setState({ lang: "ko" });
});

it("renders the bilingual header, back link, and settings surface", () => {
  render(
    <MemoryRouter initialEntries={["/settings/ai"]}>
      <AiSettingsPage />
    </MemoryRouter>,
  );

  expect(screen.getByRole("heading", { name: "AI 설정" })).toBeTruthy();
  expect(screen.getByText(/자동 무료 AI/)).toBeTruthy();
  const backLink = screen.getByRole("link", { name: /설정/ });
  expect(backLink.getAttribute("href")).toBe("/settings");
  expect(screen.getByTestId("unified-ai-settings")).toBeTruthy();
});

it("labels the back link from the source query param", () => {
  render(
    <MemoryRouter initialEntries={["/settings/ai?source=studio"]}>
      <AiSettingsPage />
    </MemoryRouter>,
  );

  const backLink = screen.getByRole("link", { name: /ToonStudio/ });
  expect(backLink.getAttribute("href")).toBe("/studio");
});
