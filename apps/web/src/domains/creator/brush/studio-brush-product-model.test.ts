import { describe, expect, it } from "vitest";

import {
  STUDIO_BRUSH_CREATE_ROUTE,
  STUDIO_BRUSH_LABELS,
  resolveStudioBrushEditorContext,
  studioBrushEditorHref,
} from "./studio-brush-product-model";

describe("single Brush Studio product model", () => {
  it("uses one canonical vocabulary for choose, edit, create and manage", () => {
    expect(STUDIO_BRUSH_LABELS).toMatchObject({
      product: "브러시 스튜디오",
      choose: "브러시 선택",
      editCurrent: "현재 브러시 편집",
      create: "새 브러시 만들기",
      manage: "브러시 관리",
    });
    expect(Object.values(STUDIO_BRUSH_LABELS).join(" ")).not.toContain("제작실");
  });

  it("opens the canonical full editor while retaining legacy and document context", () => {
    expect(studioBrushEditorHref("/studio/canvas")).toBe(STUDIO_BRUSH_CREATE_ROUTE);
    expect(studioBrushEditorHref("/studio/work/work 42/canvas")).toBe(
      "/studio/assets/brushes/new?context=work&workId=work+42",
    );
    expect(studioBrushEditorHref("/studio/remix/source-7/canvas")).toBe(
      "/studio/assets/brushes/new?context=remix&sourceWorkId=source-7",
    );
    expect(studioBrushEditorHref("/studio/p/project-1/d/page-3")).toBe(
      "/studio/assets/brushes/new?context=document&documentId=page-3&projectId=project-1",
    );
  });

  it("resolves canonical query context and saved-brush edit routes", () => {
    expect(resolveStudioBrushEditorContext({}, "?context=work&workId=work-42")).toMatchObject({
      kind: "work",
      mode: "create",
      scope: "work:work-42",
      returnHref: "/studio/work/work-42/canvas",
    });
    expect(resolveStudioBrushEditorContext(
      {},
      "?context=document&projectId=project-1&documentId=page-3",
    )).toMatchObject({
      kind: "document",
      scope: "document:project-1:page-3",
      returnHref: "/studio/p/project-1/d/page-3",
    });
    expect(resolveStudioBrushEditorContext({ brushId: "saved brush" })).toMatchObject({
      kind: "brush",
      mode: "edit",
      scope: "brush:saved brush",
      baseHref: "/studio/assets/brushes/saved%20brush/edit",
      returnHref: "/studio/assets/brushes?selected=saved%20brush",
    });
  });
});
