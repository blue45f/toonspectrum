// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_TEMPLATE_HANDOFF_KEY,
  createStudioTemplateHandoff,
  writeStudioTemplateHandoff,
} from "../studio-template-catalog";
import { readStudioProjectFeatureSuite } from "../studio-project-feature-suite-store";
import {
  STUDIO_TEMPLATE_APPLIED_EVENT,
  StudioTemplateHandoffHost,
} from "./StudioTemplateHandoffHost";

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/studio/draft/draft-template-1?workspace=comic");
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("StudioTemplateHandoffHost", () => {
  it("applies a short-lived template to the new project context exactly once", async () => {
    writeStudioTemplateHandoff(
      window.localStorage,
      createStudioTemplateHandoff(
        "webtoon-four-panel",
        "2026-09-12T00:00:00.000Z",
        3_600_000,
      ),
    );
    const applied = vi.fn();
    window.addEventListener(STUDIO_TEMPLATE_APPLIED_EVENT, applied);

    render(<StudioTemplateHandoffHost />);

    expect(await screen.findByText("템플릿 적용됨")).toBeTruthy();
    await waitFor(() => expect(applied).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem(STUDIO_TEMPLATE_HANDOFF_KEY)).toBeNull();
    expect(readStudioProjectFeatureSuite(window.localStorage, "draft-template-1"))
      .toMatchObject({
        projectId: "draft-template-1",
        storyBeats: expect.arrayContaining([
          expect.objectContaining({ kind: "setup" }),
          expect.objectContaining({ kind: "reveal" }),
        ]),
        design: {
          template: expect.objectContaining({ id: "template:webtoon-four-panel" }),
          values: expect.any(Object),
          slides: expect.any(Array),
        },
      });

    window.removeEventListener(STUDIO_TEMPLATE_APPLIED_EVENT, applied);
  });

  it("does nothing when there is no valid handoff", async () => {
    render(<StudioTemplateHandoffHost />);
    await waitFor(() => {
      expect(screen.queryByText("템플릿 적용됨")).toBeNull();
    });
    expect(readStudioProjectFeatureSuite(window.localStorage, "draft-template-1")).toBeNull();
  });
});
