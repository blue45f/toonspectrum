// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioGenerativePage } from "./StudioGenerativePage";

import type { PropsWithChildren } from "react";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  image: vi.fn(),
}));

vi.mock("./media-inference-client", () => ({
  inferenceStatus: mocks.status,
  createInferenceJob: mocks.create,
  getInferenceJob: mocks.get,
  listInferenceJobs: mocks.list,
  cancelInferenceJob: vi.fn(),
  inferenceArtifact: vi.fn(),
  isInferenceTerminal: (state: string) => ["succeeded", "failed", "cancelled"].includes(state),
}));

vi.mock("../spatial-reader/spatial-book", () => ({
  localSpatialImage: mocks.image,
}));

vi.mock("./GlbCapture", () => ({
  GlbCapture: () => <p>glb capture</p>,
}));

vi.mock("@/shared/components/section", () => ({
  Container: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/studio/generate"]}>
      <StudioGenerativePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.image.mockResolvedValue("data:image/png;base64,AAAA");
});

afterEach(cleanup);

describe("StudioGenerativePage", () => {
  it("explains an offline server, blocks generation and offers real alternatives", async () => {
    mocks.status.mockRejectedValue(new Error("추론 서버 점검 중"));
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "캐릭터에서, 움직이는 이야기로" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "추론 서버에 연결하지 못했어요." })).toBeTruthy();
    expect(screen.getByText("추론 서버 점검 중")).toBeTruthy();
    expect(screen.getByRole("button", { name: /실제 모델로 생성/u }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("link", { name: /내 AI 런타임에서 같은 변환 실행/u }).getAttribute("href")).toBe("/studio/ai-lab#ai-runtime");
    expect(screen.getByRole("link", { name: /모션 웹툰으로 직접 연출/u }).getAttribute("href")).toBe("/studio/motion-webtoon");

    const modes = screen.getByRole("group", { name: "변환 방식" });
    fireEvent.click(within(modes).getByRole("button", { name: /2D → 3D 모델/u }));
    expect(within(modes).getByRole("button", { name: /2D → 3D 모델/u }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link", { name: /캐릭터 3D 셰이퍼로 직접 만들기/u }).getAttribute("href")).toBe("/studio/assets/characters/new");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("submits a ready mode once an image is prepared and tracks the job steps", async () => {
    mocks.status.mockResolvedValue({ configured: true, capabilities: [{ kind: "image-to-video", ready: true, missing: [] }] });
    mocks.create.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      kind: "image-to-video",
      state: "queued",
      error: null,
      createdAt: "2026-09-30T00:00:00.000Z",
      updatedAt: "2026-09-30T00:00:00.000Z",
      artifacts: [],
    });
    renderPage();

    expect(await screen.findByRole("heading", { name: /추론 서버 준비됨/u })).toBeTruthy();
    const generate = screen.getByRole("button", { name: /실제 모델로 생성/u });
    expect(generate.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("입력 이미지를 넣으면 생성 버튼이 켜져요.")).toBeTruthy();

    const file = new File(["png"], "panel.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("만화 컷 · 구도 이미지 선택"), { target: { files: [file] } });
    await waitFor(() => expect(generate.hasAttribute("disabled")).toBe(false));
    fireEvent.click(generate);

    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    const [input, key] = mocks.create.mock.calls[0] as [{ kind: string; image: string }, string];
    expect(input.kind).toBe("image-to-video");
    expect(input.image).toBe("data:image/png;base64,AAAA");
    expect(key).toMatch(/^[0-9a-f-]{36}$/u);
    expect(await screen.findByText("GPU 작업 대기")).toBeTruthy();
    const steps = screen.getByRole("list", { name: "생성 진행 단계" });
    expect(within(steps).getAllByRole("listitem")[1]?.getAttribute("aria-current")).toBe("step");
  });
});
