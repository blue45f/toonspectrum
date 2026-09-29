/**
 * 벡터 스트로크 편집기 (T2, 선택적 UI).
 *
 * 스트로크 목록·선택, 선 굵기 일괄 조정 슬라이더(0.1x~5x),
 * 브러시 모양 교체 버튼, SVG 미리보기를 제공한다.
 * 상태 변경은 모두 부모 콜백으로 위임하고, 이 컴포넌트는 상태를 소유하지 않는다.
 */

import { useMemo } from "react";

import { exportVectorLayerToSvg } from "./vector-layer-svg-export";
import {
  VECTOR_BRUSH_SHAPES,
  VECTOR_WIDTH_SCALE_MAX,
  VECTOR_WIDTH_SCALE_MIN,
  type VectorBrushShapeId,
  type VectorLayer,
} from "./vector-layer-model";

export interface VectorStrokeEditorProps {
  readonly layer: VectorLayer;
  readonly selectedStrokeId: string | null;
  readonly onSelectStroke: (strokeId: string | null) => void;
  readonly onScaleStrokeWidths: (strokeId: string, scale: number) => void;
  readonly onReplaceBrushShape: (
    strokeId: string,
    shapeId: VectorBrushShapeId
  ) => void;
}

const PANEL_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 12,
  border: "1px solid #d7d7d7",
  borderRadius: 8,
  maxWidth: 360,
};

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

export function VectorStrokeEditor({
  layer,
  selectedStrokeId,
  onSelectStroke,
  onScaleStrokeWidths,
  onReplaceBrushShape,
}: VectorStrokeEditorProps): React.JSX.Element {
  const selectedStroke = layer.strokes.find(
    (stroke) => stroke.id === selectedStrokeId
  ) ?? null;

  const preview = useMemo(
    () =>
      exportVectorLayerToSvg(layer, {
        width: 320,
        height: 200,
        background: "#ffffff",
      }),
    [layer]
  );

  const selectedPreview = useMemo(() => {
    if (!selectedStroke) return null;
    return exportVectorLayerToSvg(
      { ...layer, strokes: [selectedStroke] },
      { width: 320, height: 120, background: "#fafafa" }
    );
  }, [layer, selectedStroke]);

  return (
    <section aria-label="벡터 스트로크 편집기" style={PANEL_STYLE}>
      <h2 style={{ margin: 0, fontSize: 14 }}>
        벡터 스트로크 편집기
        <span style={{ fontWeight: 400, color: "#666" }}>
          {" "}
          · {layer.name} ({layer.strokes.length}획)
        </span>
      </h2>

      {layer.strokes.length === 0 ? (
        <p style={{ margin: 0, color: "#666" }}>
          스트로크가 없습니다. 먼저 벡터 레이어에 선을 그리세요.
        </p>
      ) : (
        <ul
          aria-label="스트로크 목록"
          style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}
        >
          {layer.strokes.map((stroke, index) => {
            const selected = stroke.id === selectedStrokeId;
            return (
              <li key={stroke.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectStroke(selected ? null : stroke.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: selected ? "2px solid #2563eb" : "1px solid #d7d7d7",
                    background: selected ? "#eff6ff" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  획 {index + 1} · {stroke.color} · 평균{" "}
                  {(
                    stroke.widths.reduce((sum, width) => sum + width, 0)
                    / Math.max(stroke.widths.length, 1)
                  ).toFixed(1)}
                  px
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selectedStroke ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label htmlFor="vector-stroke-width-scale">
              선 굵기 일괄 조정 (
              {VECTOR_WIDTH_SCALE_MIN}x~{VECTOR_WIDTH_SCALE_MAX}x)
            </label>
            <div style={ROW_STYLE}>
              <input
                id="vector-stroke-width-scale"
                key={selectedStroke.id}
                type="range"
                min={VECTOR_WIDTH_SCALE_MIN}
                max={VECTOR_WIDTH_SCALE_MAX}
                step={0.1}
                defaultValue={1}
                aria-label="선택 획 굵기 배율"
                onChange={(event) =>
                  onScaleStrokeWidths(
                    selectedStroke.id,
                    Number(event.target.value)
                  )
                }
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <fieldset style={{ margin: 0, padding: 8, border: "1px solid #d7d7d7", borderRadius: 6 }}>
            <legend>브러시 모양 교체</legend>
            <div style={{ ...ROW_STYLE, flexWrap: "wrap" }}>
              {VECTOR_BRUSH_SHAPES.map((shape) => (
                <button
                  key={shape.id}
                  type="button"
                  aria-pressed={selectedStroke.brushShapeId === shape.id}
                  title={shape.description}
                  onClick={() => onReplaceBrushShape(selectedStroke.id, shape.id)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border:
                      selectedStroke.brushShapeId === shape.id
                        ? "2px solid #2563eb"
                        : "1px solid #d7d7d7",
                    background:
                      selectedStroke.brushShapeId === shape.id ? "#eff6ff" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  {shape.label}
                </button>
              ))}
            </div>
          </fieldset>

          {selectedPreview ? (
            <figure style={{ margin: 0 }}>
              <figcaption style={{ fontSize: 12, color: "#666" }}>
                선택 획 미리보기
              </figcaption>
              <div
                role="img"
                aria-label="선택한 벡터 스트로크의 SVG 미리보기"
                // 미리보기는 이 모듈이 생성한 SVG이므로 안전하다.
                dangerouslySetInnerHTML={{ __html: selectedPreview.svg }}
              />
            </figure>
          ) : null}
        </div>
      ) : (
        <p style={{ margin: 0, color: "#666" }}>
          편집할 획을 목록에서 선택하세요.
        </p>
      )}

      <figure style={{ margin: 0 }}>
        <figcaption style={{ fontSize: 12, color: "#666" }}>
          레이어 SVG 미리보기
        </figcaption>
        <div
          role="img"
          aria-label="벡터 레이어 전체의 SVG 미리보기"
          dangerouslySetInnerHTML={{ __html: preview.svg }}
        />
      </figure>
    </section>
  );
}
