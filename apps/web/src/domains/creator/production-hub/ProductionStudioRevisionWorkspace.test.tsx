// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProductionDemoProject } from "./production-demo";
import { ProductionStudioRevisionWorkspace } from "./ProductionStudioRevisionWorkspace";

afterEach(() => cleanup());

function renderWorkspace(options: { readonly canEdit?: boolean } = {}) {
  const execute = vi.fn().mockResolvedValue(undefined);
  render(
    <MemoryRouter>
      <ProductionStudioRevisionWorkspace
        aggregate={createProductionDemoProject()}
        execute={execute}
        canEdit={options.canEdit ?? true}
        roleLens="producer"
      />
    </MemoryRouter>,
  );
  return execute;
}

describe("ProductionStudioRevisionWorkspace", () => {
  it("shows approved, pending and missing Studio revision coverage", () => {
    renderWorkspace();

    expect(screen.getByRole("heading", { name: "실제 원고 revision 연결" })).toBeTruthy();
    expect(screen.getByText("아직 통합 검수 기준이 완성되지 않았습니다")).toBeTruthy();
    expect(screen.getByRole("button", { name: "검수 revision 갱신" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "승인 revision 갱신" })).toBeTruthy();
  });

  it("links the selected Studio submission only after an explicit action", async () => {
    const execute = renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "검수 revision 갱신" }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute).toHaveBeenCalledWith({
      type: "upsert-studio-revision-link",
      link: expect.objectContaining({
        projectId: "sample-project",
        workId: "sample-work",
        episodeId: "episode-12",
        documentRole: "thumbnail",
        deliverableId: "deliverable-thumbnail-12",
        submissionId: "submission-thumbnail-12-r2",
        linkedByAssignmentId: expect.any(String),
        status: "submitted",
      }),
    }, expect.stringContaining("콘티"));
  });

  it("keeps revision linking read-only without edit permission", () => {
    const execute = renderWorkspace({ canEdit: false });

    const button = screen.getByRole("button", { name: "검수 revision 갱신" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(execute).not.toHaveBeenCalled();
  });
});
