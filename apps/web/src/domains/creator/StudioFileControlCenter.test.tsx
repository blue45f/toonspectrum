// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioFileControlCenter } from "./StudioFileControlCenter";

const originalStorageDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "storage",
);

function installStorageManager({
  persisted = true,
}: {
  persisted?: boolean;
} = {}) {
  const estimate = vi.fn(async () => ({ usage: 1_048_576, quota: 16_777_216 }));
  const persistedMock = vi.fn(async () => persisted);
  const persist = vi.fn(async () => true);
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: { estimate, persisted: persistedMock, persist },
  });
  return { estimate, persisted: persistedMock, persist };
}

function Fixture({
  actions = {},
}: {
  actions?: Partial<Record<
    "archive" | "archiveRecovery" | "checkpoint" | "interchange" | "json" | "newWork" | "psd",
    () => void
  >>;
}) {
  return (
    <div data-studio-project-actions-menu="true">
      <StudioFileControlCenter />
      <button type="button" onClick={actions.newWork}>
        빠른 시작 · 새 작업…
      </button>
      <button type="button" onClick={actions.checkpoint}>
        버전 체크포인트…
      </button>
      <button type="button" onClick={actions.archive}>
        아카이브 백업
      </button>
      <button type="button" onClick={actions.archiveRecovery}>
        아카이브 복구
      </button>
      <button type="button" onClick={actions.json}>
        프로젝트 가져오기…
      </button>
      <button type="button" onClick={actions.psd}>
        PSD 가져오기…
      </button>
      <button type="button" onClick={actions.interchange}>
        ORA · CBZ · WILL 가져오기…
      </button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  installStorageManager();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  if (originalStorageDescriptor) {
    Object.defineProperty(navigator, "storage", originalStorageDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "storage");
  }
});

describe("StudioFileControlCenter", () => {
  it("delegates high-value file lifecycle actions to the existing Project Center owners", () => {
    const checkpoint = vi.fn();
    const archive = vi.fn();
    const archiveRecovery = vi.fn();
    const newWork = vi.fn();
    render(<Fixture actions={{ checkpoint, archive, archiveRecovery, newWork }} />);

    fireEvent.click(screen.getByRole("button", { name: "파일 센터 · 새 작업 준비" }));
    fireEvent.click(screen.getByRole("button", { name: "파일 센터 · 이름 붙인 버전" }));
    fireEvent.click(screen.getByRole("button", { name: "파일 센터 · 이 기기에 완전 사본" }));
    fireEvent.click(screen.getByRole("button", { name: "파일 센터 · 아카이브에서 복구" }));

    expect(newWork).toHaveBeenCalledTimes(1);
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(archive).toHaveBeenCalledTimes(1);
    expect(archiveRecovery).toHaveBeenCalledTimes(1);
  });

  it("preflights a PSD without reading its contents, records metadata, and opens the authoritative importer", async () => {
    const psd = vi.fn();
    render(<Fixture actions={{ psd }} />);
    const input = screen.getByLabelText("파일 선택 또는 놓기") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "episode.psd", {
      type: "image/vnd.adobe.photoshop",
    });

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("episode.psd")).toBeTruthy();
    expect(screen.getByText("가져오기 가능 · 손실 확인")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "PSD 가져오기 열기" }));
    expect(psd).toHaveBeenCalledTimes(1);

    const stored = window.localStorage.getItem(
      "toonspectrum-studio-file-control-center:recent-files:v1",
    );
    expect(stored).toContain("episode.psd");
    expect(screen.getByRole("button", {
      name: "episode.psd 가져오기 선택기 열기",
    })).toBeTruthy();
  });

  it("fails closed for unsupported proprietary documents and gives a conversion route", async () => {
    render(<Fixture />);
    const input = screen.getByLabelText("파일 선택 또는 놓기") as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File(["clip"], "source.clip", { type: "application/octet-stream" })],
      },
    });

    expect(await screen.findByText("직접 가져오기 미지원")).toBeTruthy();
    expect(screen.getByText(/CLIP STUDIO PAINT에서 편집 구조가 필요하면/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /\.clip.*열기/u })).toBeNull();
  });

  it("reports actual browser storage protection separately from server save and requests persistence only on a user action", async () => {
    const storage = installStorageManager({ persisted: false });
    storage.persisted
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    render(<Fixture />);

    expect(await screen.findByText("브라우저 정리 대상일 수 있음")).toBeTruthy();
    expect(storage.persist).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "브라우저 저장 보호 요청" }));
    await waitFor(() => expect(storage.persist).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("영구 보관 허용됨")).toBeTruthy();
    expect(screen.getByText(/서버 초안 저장 성공을 뜻하지 않습니다/)).toBeTruthy();
  });

  it("keeps its controls out of Project Center search ownership", () => {
    render(<Fixture />);
    const center = document.querySelector<HTMLElement>(
      '[data-studio-file-control-center="true"]',
    );
    expect(center).not.toBeNull();
    const controls = Array.from(center?.querySelectorAll("button") ?? []);
    expect(controls.length).toBeGreaterThan(4);
    expect(controls.every((button) => button.dataset.projectCenterControl === "true"))
      .toBe(true);
  });
});
