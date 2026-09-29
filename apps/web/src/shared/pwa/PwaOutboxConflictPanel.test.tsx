// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PwaOutboxConflictPanel } from "./PwaOutboxConflictPanel";
import {
  getBrowserPwaOfflineOutbox,
  PwaOutboxConflictError,
} from "./pwa-offline-outbox";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  translateBilingualValueForActiveLocale: (_scope: string, ko: unknown) => ko,
  useBilingualI18nRevision: () => undefined,
}));

async function seedConflictedItem(label: string): Promise<string> {
  const outbox = getBrowserPwaOfflineOutbox();
  const item = outbox.enqueue("note", label, { text: "hello" });
  await outbox.syncAll(async () => {
    throw new PwaOutboxConflictError(Date.now(), "서버 사본");
  });
  return item.id;
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("PwaOutboxConflictPanel", () => {
  it("닫혀 있으면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(
      <PwaOutboxConflictPanel open={false} onClose={() => undefined} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("충돌이 없으면 빈 상태를 보여준다", () => {
    render(<PwaOutboxConflictPanel open onClose={() => undefined} />);
    expect(screen.getByRole("dialog").textContent).toContain("확인할 충돌이 없어요");
  });

  it("충돌 항목을 나열한다", async () => {
    await seedConflictedItem("에피소드 3 메모");
    render(<PwaOutboxConflictPanel open onClose={() => undefined} />);
    expect(screen.getByText("에피소드 3 메모")).toBeTruthy();
    expect(screen.getByRole("button", { name: "내 것 유지" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "서버 것 사용" })).toBeTruthy();
  });

  it("내 것 유지를 선택하면 항목이 다시 큐로 돌아간다", async () => {
    const id = await seedConflictedItem("에피소드 3 메모");
    render(<PwaOutboxConflictPanel open onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "내 것 유지" }));
    const after = getBrowserPwaOfflineOutbox()
      .list()
      .find((entry) => entry.id === id);
    expect(after?.status).toBe("queued");
    expect(screen.queryByText("에피소드 3 메모")).toBeNull();
  });

  it("서버 것 사용을 선택하면 항목이 삭제된다", async () => {
    const id = await seedConflictedItem("에피소드 3 메모");
    render(<PwaOutboxConflictPanel open onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "서버 것 사용" }));
    expect(
      getBrowserPwaOfflineOutbox().list().find((entry) => entry.id === id),
    ).toBeUndefined();
  });

  it("Escape 키로 닫힌다", () => {
    const onClose = vi.fn();
    render(<PwaOutboxConflictPanel open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
