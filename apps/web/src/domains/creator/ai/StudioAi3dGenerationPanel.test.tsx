// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Studio3dGenerationHttpClient,
  type Studio3dGenerationJob,
} from "./studio-3d-generation-client";
import { StudioAi3dGenerationPanel } from "./StudioAi3dGenerationPanel";

const job: Studio3dGenerationJob = {
  id: "job-1",
  state: "generating-geometry",
  generation: 2,
  estimatedCredits: 1,
  createdAtMs: 1,
  updatedAtMs: 2,
  deadlineAtMs: 100_000,
  request: {
    mode: "text-to-3d",
    provider: "hyper3d-rodin",
    model: "Rodin Gen-2.5",
    tier: "Gen-2.5-Medium",
    seed: 73,
    transport: "server",
  },
};

const response = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("StudioAi3dGenerationPanel", () => {
  it("submits a text-to-3D job after explicit preflight", async () => {
    const fetchMock = vi.fn<typeof fetch>((input) =>
      Promise.resolve(String(input).endsWith("/jobs") ? response(job) : response([])),
    );
    const client = new Studio3dGenerationHttpClient({ userId: "user-1", fetchImpl: fetchMock });
    render(<StudioAi3dGenerationPanel client={client} />);
    fireEvent.change(screen.getByLabelText("생성 설명"), {
      target: { value: "웹툰 교실용 학생 책상" },
    });
    fireEvent.click(screen.getByRole("button", { name: "3D 생성 시작" }));
    await waitFor(() => expect(screen.getByText(/형상 생성 중/u)).not.toBeNull());
    const createCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(createCall).toBeDefined();
    expect(String(createCall?.[1]?.body)).toContain("웹툰 교실용 학생 책상");
  });

  it("cancels an active job and clears the action state", async () => {
    let calls = 0;
    const cancelled = { ...job, state: "cancelled" as const, generation: 3 };
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = String(input);
      if (!init?.method) return Promise.resolve(response(calls++ === 0 ? [job] : job));
      if (url.endsWith("/cancel")) return Promise.resolve(response(cancelled));
      return Promise.resolve(response(job));
    });
    const client = new Studio3dGenerationHttpClient({ userId: "user-1", fetchImpl: fetchMock });
    render(<StudioAi3dGenerationPanel client={client} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "취소" })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.getByText(/취소됨/u)).not.toBeNull());
  });
});
