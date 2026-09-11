// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { STUDIO_PROJECT_DIAGNOSTICS_FAILED_EVENT } from "../studio-project-diagnostic-source-store";
import {
  STUDIO_PROJECT_READINESS_UPDATED_EVENT,
  writeStudioProjectReadinessSnapshot,
  type StudioProjectReadinessSnapshot,
} from "../studio-project-readiness-store";
import { StudioProjectReadinessPanel } from "./StudioProjectReadinessPanel";

const SNAPSHOT: StudioProjectReadinessSnapshot = Object.freeze<StudioProjectReadinessSnapshot>({
  schemaVersion: 1,
  projectId: "project-1",
  updatedAt: "2026-09-11T00:00:00.000Z",
  report: {
    status: "blocked",
    completion: 0.5,
    blockingCount: 1,
    warningCount: 1,
    sections: [
      { id: "story", status: "blocked", completion: 0.4, blockingCount: 1, warningCount: 0 },
      { id: "production", status: "warning", completion: 0.6, blockingCount: 0, warningCount: 1 },
      { id: "assets", status: "ready", completion: 1, blockingCount: 0, warningCount: 0 },
      { id: "review", status: "ready", completion: 1, blockingCount: 0, warningCount: 0 },
      { id: "localization", status: "ready", completion: 0, blockingCount: 0, warningCount: 0 },
      { id: "export", status: "ready", completion: 0, blockingCount: 0, warningCount: 0 },
    ],
    actions: [{
      id: "resolve-continuity",
      section: "story",
      priority: "high",
      messageKo: "설명되지 않은 연속성 오류를 해결하세요.",
      messageEn: "Resolve unexplained continuity errors.",
    }],
  },
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioProjectReadinessPanel", () => {
  it("does not fabricate a ready state when no project snapshot exists", () => {
    render(
      <MemoryRouter>
        <StudioProjectReadinessPanel projectId="project-1" locale="ko" />
      </MemoryRouter>,
    );
    expect(screen.getByText("프로젝트 준비도 · 검사 전")).toBeTruthy();
    expect(screen.queryByText(/프로젝트 준비도 100%/u)).toBeNull();
  });

  it("shows a missing diagnostic source instead of silently keeping the pre-check state", () => {
    render(
      <MemoryRouter>
        <StudioProjectReadinessPanel projectId="project-1" locale="ko" />
      </MemoryRouter>,
    );

    act(() => {
      window.dispatchEvent(new CustomEvent(STUDIO_PROJECT_DIAGNOSTICS_FAILED_EVENT, {
        detail: {
          projectId: "project-1",
          code: "source-missing",
          message: "Project diagnostic data has not been collected yet.",
        },
      }));
    });

    expect(screen.getByText("프로젝트 준비도 · 연결 데이터 없음")).toBeTruthy();
    expect(screen.getByText(/source-missing/u)).toBeTruthy();
    expect(screen.queryByText(/프로젝트 준비도 100%/u)).toBeNull();
  });

  it("reacts to a persisted readiness update", () => {
    render(
      <MemoryRouter>
        <StudioProjectReadinessPanel projectId="project-1" locale="ko" />
      </MemoryRouter>,
    );
    writeStudioProjectReadinessSnapshot(window.localStorage, SNAPSHOT);
    act(() => {
      window.dispatchEvent(new CustomEvent(STUDIO_PROJECT_READINESS_UPDATED_EVENT, {
        detail: SNAPSHOT,
      }));
    });
    expect(screen.getByText("프로젝트 준비도 50%")).toBeTruthy();
    expect(screen.getByText("설명되지 않은 연속성 오류를 해결하세요.")).toBeTruthy();
    expect(screen.getAllByText("해결 필요").length).toBeGreaterThan(0);
  });
});
