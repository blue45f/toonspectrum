export type Tool = "select" | "draw" | "hand";

/** pen/eraser/shape + 픽셀 펜슬 · lasso fill. */
export type DrawMode = "pen" | "eraser" | "shape" | "pixel" | "lasso-fill";

export type DrawShapeKind =
  | "line"
  | "rect"
  | "ellipse"
  | "star"
  | "arrow"
  | "triangle"
  | "polygon";
