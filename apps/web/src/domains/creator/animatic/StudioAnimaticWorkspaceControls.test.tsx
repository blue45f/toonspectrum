// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioAnimaticWorkspace, validateStudioAnimaticWorkspace, type StudioAnimaticWorkspaceDocument } from "./studio-animatic-workspace";
import { StudioAnimaticWorkspaceControls } from "./StudioAnimaticWorkspaceControls";

vi.mock("./StudioAnimaticCanvas", () => ({ StudioAnimaticCanvas: ({ label }: { label: string }) => <div role="img" aria-label={label} /> }));
afterEach(cleanup);

function renderControls() {
  const initial = createStudioAnimaticWorkspace([{ id: "p1", name: "도입" }, { id: "p2", name: "마무리" }], "episode-1");
  let current: StudioAnimaticWorkspaceDocument = initial;
  const seek = vi.fn();
  function Host() {
    const [workspace, setWorkspace] = useState(initial);
    return <StudioAnimaticWorkspaceControls workspace={workspace} images={new Map()} selectedShot={initial.timeline.segments[0]!.id}
      busy={false} progress={null} currentTime={() => 1200} totalDuration={5000}
      onCommit={(next) => { current = validateStudioAnimaticWorkspace(next); setWorkspace(current); }} onSeek={seek}
      onCapture={vi.fn()} onAudioFile={vi.fn()} onExportArchive={vi.fn()} onImportArchive={vi.fn()} onExportVideo={vi.fn()} onCancel={vi.fn()} />;
  }
  const rendered = render(<Host />);
  for (const detail of rendered.container.querySelectorAll("details")) detail.open = true;
  return { ...rendered, initial, current: () => current, seek };
}

describe("authored storyboard shot, marker and revision controls", () => {
  it("edits sequence/camera metadata and reorders the selected shot without losing its metadata", () => {
    const h = renderControls();
    fireEvent.change(screen.getByLabelText("시퀀스"), { target: { value: "오프닝" } });
    fireEvent.change(screen.getByLabelText("카메라 메모"), { target: { value: "느린 돌리 인" } });
    fireEvent.click(screen.getByRole("button", { name: "컷 뒤로 이동" }));
    expect(h.current().timeline.segments[1]!.id).toBe(h.initial.timeline.segments[0]!.id);
    expect(h.current().shots[0]).toMatchObject({ segmentId: h.initial.timeline.segments[0]!.id, sequence: "오프닝", camera: "느린 돌리 인" });
  });
  it("stores a marker at the playhead, seeks to it and deletes it", () => {
    const h = renderControls();
    fireEvent.change(screen.getByLabelText("새 타임라인 마커 이름"), { target: { value: "대사 시작" } });
    fireEvent.click(screen.getByRole("button", { name: "현재 위치에 마커" }));
    expect(h.current().markers[0]).toMatchObject({ label: "대사 시작", timeMs: 1200 });
    fireEvent.click(screen.getByRole("button", { name: "1.20초 · 대사 시작" }));
    expect(h.seek).toHaveBeenCalledWith(1200);
    fireEvent.click(screen.getByRole("button", { name: "대사 시작 마커 삭제" }));
    expect(h.current().markers).toEqual([]);
  });
  it("compares and restores an immutable version, while keeping linked review comments valid after version deletion", () => {
    const h = renderControls();
    fireEvent.change(screen.getByLabelText("스토리보드 버전 이름"), { target: { value: "첫 편집" } });
    fireEvent.click(screen.getByRole("button", { name: "현재 버전 보관" }));
    const version = h.current().variants[0]!;
    fireEvent.click(screen.getByRole("button", { name: "컷 뒤로 이동" }));
    fireEvent.change(screen.getByLabelText("비교할 스토리보드 버전"), { target: { value: version.id } });
    expect(screen.getByText(/재생 시간·순서 변경/)).toBeTruthy();
    expect(screen.getByRole("img", { name: "보관한 버전 그림" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("새 스토리보드 검토 의견"), { target: { value: "카메라를 더 천천히" } });
    fireEvent.click(screen.getByRole("button", { name: "현재 위치에 의견 남기기" }));
    expect(h.current().reviews[0]).toMatchObject({ variantId: version.id, timeMs: 1200, resolved: false });
    fireEvent.click(screen.getByRole("button", { name: "검토 완료" }));
    expect(h.current().reviews[0]?.resolved).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "이 버전으로 복원" }));
    expect(h.current().timeline.segments).toEqual(h.initial.timeline.segments);
    expect(h.current().reviews).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "보관 버전 삭제" }));
    expect(h.current().variants).toEqual([]);
    expect(h.current().reviews[0]?.variantId).toBeNull();
  });
});
