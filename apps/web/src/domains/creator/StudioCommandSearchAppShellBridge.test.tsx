// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioCommandSearchHost } from "./StudioCommandSearchHost";

import {
  requestStudioCommandSearchFromAppShell,
  resetStudioCommandSearchBridgeForTests,
} from "@/shared/lib/studio-command-search-bridge";

afterEach(() => {
  cleanup();
  resetStudioCommandSearchBridgeForTests();
});

describe("StudioCommandSearchHost app-shell bridge", () => {
  it("reports no consumer before a Studio host is mounted", () => {
    expect(requestStudioCommandSearchFromAppShell()).toBe(false);
  });

  it("opens the same registry-backed dialog and preserves the requested scope", async () => {
    render(<StudioCommandSearchHost />);

    let accepted = false;
    act(() => {
      accepted = requestStudioCommandSearchFromAppShell({ scope: "command" });
    });

    expect(accepted).toBe(true);
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("radio", { name: "명령" }).getAttribute("aria-checked"),
    ).toBe("true");
  });
});