// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { PERSONAL_STUDIO_HOME_ID, StudioWorkspaceLiveHome } from "./StudioWorkspaceLiveHome";

vi.mock("../virtual-space/StudioVirtualSpacePage", () => ({
  StudioVirtualSpacePage: ({ projectIdOverride, homeHeader, personal }: { projectIdOverride: string; homeHeader: ReactNode; personal: boolean }) =>
    <section data-testid="existing-runtime" data-work={projectIdOverride} data-personal={personal}>{homeHeader}</section>,
}));
afterEach(cleanup);
it("opens a local-only personal world without manufacturing a persistent project", () => {
  render(<StudioWorkspaceLiveHome projectId={null} header={<header>Current home</header>} />);
  expect(screen.getByTestId("existing-runtime").getAttribute("data-work")).toBe(PERSONAL_STUDIO_HOME_ID);
  expect(screen.getByTestId("existing-runtime").getAttribute("data-personal")).toBe("true");
  expect(screen.getByText("Current home")).toBeTruthy();
});
it("preserves an exact selected project and delegates collaboration admission to its existing runtime", () => {
  render(<StudioWorkspaceLiveHome projectId="작품 a/b" header={<header>Selected work</header>} />);
  expect(screen.getByTestId("existing-runtime").getAttribute("data-work")).toBe("작품 a/b");
  expect(screen.getByTestId("existing-runtime").getAttribute("data-personal")).toBe("false");
});
