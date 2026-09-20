// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioReviewSpatialAnchor, deriveStudioReviewPageMapping, type StudioReviewMappedPage } from "@toonspectrum/studio-project-model";
import { StudioReviewSpatialAnnotation, type StudioReviewAnnotationSelection } from "./StudioReviewSpatialAnnotation";

const mapping = deriveStudioReviewPageMapping({ width: 800, pagesList: [{ id: "page-a", canvasH: 1200,
  elements: [{ id: "frame-a", type: "frame", x: 100, y: 100, width: 300, height: 400 }, { id: "text-a", type: "text" }] }] },
{ sourceServerRevision: 7, sourceContentDigest: "a".repeat(64), ordinal: 0, renderWidth: 1600, renderHeight: 2400 }) as StudioReviewMappedPage;
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup(disabled = false) {
  const choose = vi.fn();
  function Harness() {
    const [selected, setSelected] = useState<StudioReviewAnnotationSelection | null>(null);
    return <StudioReviewSpatialAnnotation mapping={mapping} sha256={"b".repeat(64)} expiresAt={Date.now() + 30_000}
      control={{ selected, disabled, onSelect: (value) => { choose(value); setSelected(value); } }}><img alt="Page pixels" src="/test.png" /></StudioReviewSpatialAnnotation>;
  }
  const rendered = render(<Harness />);
  return { choose, ...rendered };
}
const mode = (value: string) => fireEvent.change(screen.getByLabelText("위치 방식"), { target: { value } });
const apply = () => fireEvent.click(screen.getByRole("button", { name: "이 위치에 의견 연결" }));
describe("source-mapped spatial placement", () => {
  it("requires explicit page, cut and object selection and preserves their authoring IDs", () => {
    const { choose } = setup(); expect(choose).not.toHaveBeenCalled(); apply();
    expect(choose.mock.lastCall?.[0].anchor).toMatchObject({ kind: "page", source: { pageId: "page-a", pageOrdinal: 0 } });
    mode("panel"); expect((screen.getByRole("button", { name: "이 위치에 의견 연결" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("연결할 컷"), { target: { value: "frame-a" } }); apply();
    expect(choose.mock.lastCall?.[0].anchor).toMatchObject({ kind: "panel", source: { frameId: "frame-a" } });
    mode("object"); fireEvent.change(screen.getByLabelText("연결할 요소"), { target: { value: "text-a" } }); apply();
    expect(choose.mock.lastCall?.[0].anchor).toMatchObject({ kind: "object", objectId: "text-a", source: { elementId: "text-a" } });
    expect(choose.mock.lastCall?.[0].anchor.source).not.toHaveProperty("frameId");
  });
  it("offers keyboard percentages for points and regions and rejects out-of-page selections", () => {
    const { choose } = setup(); mode("region");
    for (const [label, value] of [["가로 위치 (%)", "10"], ["세로 위치 (%)", "20"], ["너비 (%)", "30"], ["높이 (%)", "40"]]) {
      fireEvent.change(screen.getByLabelText(label!), { target: { value } });
    }
    apply(); expect(choose.mock.lastCall?.[0].anchor).toMatchObject({ kind: "region", x: 80, y: 240, width: 240, height: 480 });
    fireEvent.change(screen.getByLabelText("가로 위치 (%)"), { target: { value: "90" } }); apply();
    expect(choose.mock.lastCall?.[0]).toBeNull(); expect(screen.getByRole("alert")).toBeTruthy();
    mode("coordinate"); fireEvent.change(screen.getByLabelText("가로 위치 (%)"), { target: { value: "25" } }); apply();
    expect(choose.mock.lastCall?.[0].anchor).toMatchObject({ kind: "coordinate", x: 200, y: 240 });
  });
  it("uses the displayed image bounds for pointer drag without confusing export pixels with source pixels", () => {
    const { choose } = setup(); mode("region");
    const image = screen.getByRole("img"), surface = image.parentElement!;
    Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 1600 }, naturalHeight: { value: 2400 } });
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 100, top: 50, right: 500, bottom: 650, width: 400, height: 600, x: 100, y: 50, toJSON: () => ({}) });
    const pointer = (type: string, x: number, y: number) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }); Object.defineProperty(event, "pointerId", { value: 1 }); fireEvent(surface, event); };
    pointer("pointerdown", 140, 110); pointer("pointerup", 220, 230);
    expect(choose.mock.lastCall?.[0].anchor).toMatchObject({ kind: "region", x: 80, y: 120, width: 160, height: 240 });
  });
  it("keeps saved note highlighting independent from new comment placement", () => {
    const choose = vi.fn(), spatial = createStudioReviewSpatialAnchor(mapping, { kind: "panel", frameId: "frame-a" })!;
    const note = { id: "note", body: "Saved cut note", anchor: { ...spatial, artifactId: "artifact", revisionId: "snapshot", scope: { projectId: "project" } } };
    const mounted = render(<StudioReviewSpatialAnnotation mapping={mapping} sha256={"b".repeat(64)} expiresAt={Date.now() + 30_000}
      control={{ selected: null, disabled: true, onSelect: choose }} editable={false} notes={[note]}><img alt="Page" src="/test.png" /></StudioReviewSpatialAnnotation>);
    expect(screen.queryByLabelText("위치 방식")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /의견 1 위치 보기/u }));
    expect(mounted.container.querySelector("svg rect")?.getAttribute("x")).toBe("100");
    expect(screen.getByRole("status").textContent).toContain("컷 1"); expect(choose).not.toHaveBeenCalled();
  });
  it("disables placement while a note is saving", () => { const { choose } = setup(true); apply(); expect(choose).not.toHaveBeenCalled(); });
});
