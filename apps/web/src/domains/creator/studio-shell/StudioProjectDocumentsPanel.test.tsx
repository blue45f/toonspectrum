// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import {
  studioExactResumeStorageKey,
  writeStudioExactResumeContext,
} from "../studio-exact-resume-context";
import { readStudioProjectDocuments } from "../studio-project-document-store";
import { StudioProjectDocumentsPanel } from "./StudioProjectDocumentsPanel";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioProjectDocumentsPanel", () => {
  it("creates a document and exposes its canonical editor link", async () => {
    render(
      <MemoryRouter>
        <StudioProjectDocumentsPanel projectId="series-alpha" locale="ko" />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "문서 이름" }), {
      target: { value: "2화 원고" },
    });
    fireEvent.click(screen.getByRole("button", { name: "문서 만들기" }));

    expect(await screen.findByText("2화 원고")).toBeTruthy();
    const documents = readStudioProjectDocuments(window.localStorage, "series-alpha");
    expect(documents.documents).toHaveLength(1);
    expect(screen.getByRole("link", { name: "열기" }).getAttribute("href"))
      .toMatch(/^\/studio\/p\/series-alpha\/d\/[^?]+\?workspace=comic$/u);
  });

  it("keeps the same document identity while changing its default workspace", async () => {
    render(
      <MemoryRouter>
        <StudioProjectDocumentsPanel projectId="series-alpha" locale="ko" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "문서 만들기" }));
    const before = readStudioProjectDocuments(window.localStorage, "series-alpha").documents[0]!;

    fireEvent.change(await screen.findByRole("combobox", { name: "기본 작업공간" }), {
      target: { value: "draw" },
    });

    await waitFor(() => {
      const after = readStudioProjectDocuments(window.localStorage, "series-alpha").documents[0]!;
      expect(after.id).toBe(before.id);
      expect(after.defaultWorkspace).toBe("draw");
    });
  });

  it("removes exact resume metadata when a trashed document is permanently deleted", async () => {
    render(
      <MemoryRouter>
        <StudioProjectDocumentsPanel projectId="series-alpha" locale="ko" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "문서 만들기" }));
    const document = readStudioProjectDocuments(window.localStorage, "series-alpha").documents[0]!;
    const resumeKey = studioExactResumeStorageKey("series-alpha", document.id);
    writeStudioExactResumeContext(window.localStorage, {
      projectId: "series-alpha",
      documentId: document.id,
      workspace: document.defaultWorkspace,
      pageId: "page-1",
      updatedAt: "2026-09-17T00:00:00.000Z",
    });
    expect(window.localStorage.getItem(resumeKey)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "문서를 휴지통으로" }));
    fireEvent.click(screen.getByRole("button", { name: /휴지통 1/u }));
    fireEvent.click(await screen.findByRole("button", { name: "완전히 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: /^삭제$/u }));

    await waitFor(() => {
      expect(readStudioProjectDocuments(window.localStorage, "series-alpha").documents).toHaveLength(0);
    });
    expect(window.localStorage.getItem(resumeKey)).toBeNull();
  });
});
