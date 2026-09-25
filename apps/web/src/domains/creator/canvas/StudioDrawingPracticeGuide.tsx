import { useEffect, useRef, useState } from "react";
import { Group, Image as KImage, Transformer } from "react-konva/lib/ReactKonvaCore";

import { studioKonvaRuntime as KonvaRuntime } from "../render/studio-konva-runtime";
import { registerStudioDrawingPracticeCaptureExclusion } from "../studio-drawing-practice-runtime";

import type {
  StudioDrawingPracticeDocument,
  StudioDrawingPracticeView,
} from "../studio-drawing-practice-document";
import type Konva from "konva";

export interface StudioDrawingPracticeGuideProps {
  document: StudioDrawingPracticeDocument;
  sourceDataUrl: string;
  effectiveScale: number;
  interactionBlocked: boolean;
  onCommitView: (patch: Partial<StudioDrawingPracticeView>) => void;
}

/** View-only guide. It is mounted only on live editor paths, never document raster capture paths. */
export function StudioDrawingPracticeGuide({
  document,
  sourceDataUrl,
  effectiveScale,
  interactionBlocked,
  onCommitView,
}: StudioDrawingPracticeGuideProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const groupRef = useRef<Konva.Group>(null);
  const imageRef = useRef<Konva.Image>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const view = document.view;
  const interactive = !view.locked && !interactionBlocked;

  useEffect(() => {
    let active = true;
    const next = new Image();
    next.decoding = "async";
    next.onload = () => {
      if (active) setImage(next);
    };
    next.onerror = () => {
      if (active) setImage(null);
    };
    next.src = sourceDataUrl;
    return () => {
      active = false;
      next.onload = null;
      next.onerror = null;
    };
  }, [sourceDataUrl]);

  useEffect(() => registerStudioDrawingPracticeCaptureExclusion(groupRef.current), [image]);

  useEffect(() => {
    const node = imageRef.current;
    if (!node || !image) return;
    if (view.grayscale) {
      node.cache({ pixelRatio: Math.min(2, Math.max(1, effectiveScale)) });
    } else {
      node.clearCache();
    }
    node.getLayer()?.batchDraw();
    return () => {
      node.clearCache();
    };
  }, [effectiveScale, image, view.grayscale, view.height, view.width]);

  useEffect(() => {
    const node = imageRef.current;
    const transformer = transformerRef.current;
    if (!transformer) return;
    transformer.nodes(interactive && node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [interactive, image]);

  if (!image) return null;

  return (
    <Group ref={groupRef} name="studio-drawing-practice-guide-group">
      <KImage
        ref={imageRef}
        name="studio-drawing-practice-guide"
        image={image}
        x={view.centerX}
        y={view.centerY}
        width={view.width}
        height={view.height}
        offsetX={view.width / 2}
        offsetY={view.height / 2}
        rotation={view.rotationDeg}
        scaleX={view.flipX ? -1 : 1}
        scaleY={view.flipY ? -1 : 1}
        opacity={view.opacity}
        filters={view.grayscale ? [KonvaRuntime.Filters.Grayscale] : []}
        listening={interactive}
        draggable={interactive}
        perfectDrawEnabled={false}
        onDragEnd={(event) => {
          onCommitView({ centerX: event.target.x(), centerY: event.target.y() });
        }}
        onTransformEnd={() => {
          const node = imageRef.current;
          if (!node) return;
          const width = Math.max(1, node.width() * Math.abs(node.scaleX()));
          const height = Math.max(1, node.height() * Math.abs(node.scaleY()));
          const patch = {
            centerX: node.x(),
            centerY: node.y(),
            width,
            height,
            rotationDeg: node.rotation(),
          } satisfies Partial<StudioDrawingPracticeView>;
          node.width(width);
          node.height(height);
          node.offsetX(width / 2);
          node.offsetY(height / 2);
          node.scaleX(view.flipX ? -1 : 1);
          node.scaleY(view.flipY ? -1 : 1);
          onCommitView(patch);
        }}
      />
      {interactive ? (
        <Transformer
          ref={transformerRef}
          name="studio-drawing-practice-transformer"
          rotateEnabled
          flipEnabled={false}
          keepRatio
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          anchorSize={10 / Math.max(0.1, effectiveScale)}
          borderStrokeWidth={1.5 / Math.max(0.1, effectiveScale)}
          boundBoxFunc={(previous, next) => (
            Math.abs(next.width) < 24 || Math.abs(next.height) < 24 ? previous : next
          )}
        />
      ) : null}
    </Group>
  );
}
