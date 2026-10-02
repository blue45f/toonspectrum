import { GALLERY_THUMBNAIL_SIZE } from "../state/lab-store";

import { ImageCanvas } from "./LaneCanvas";
import { formatMetric } from "./MetricsTable";

import type { BrushProgram } from "../../engine/presets/program-schema";
import type { GalleryEntry } from "../state/lab-store";

export interface PresetCardProps {
  preset: BrushProgram;
  entry: GalleryEntry | undefined;
  onOpen: (presetId: string) => void;
}

/** 프리셋 썸네일 카드: 결정성 해시·렌더 시간·dab 수·가족 지표 판정. Worker 실패는 오류 카드. */
export function PresetCard({ preset, entry, onOpen }: PresetCardProps) {
  const result = entry?.status === "done" ? entry.result : null;
  const headingId = `lab-card-${preset.id}`;
  return (
    <article
      className={`lab-card${entry?.status === "error" ? " lab-card--error" : ""}`}
      aria-labelledby={headingId}
      data-testid={`lab-preset-card-${preset.id}`}
      data-status={entry?.status ?? "idle"}
    >
      <div className="lab-canvas-stage lab-card-stage">
        <ImageCanvas image={result?.image ?? null} size={GALLERY_THUMBNAIL_SIZE} label={`${preset.name} 썸네일`} />
      </div>
      <h3 id={headingId}>{preset.name}</h3>
      <p className="lab-muted">
        <span className="lab-badge">{preset.family}</span> <span className="lab-mono">{preset.id}</span>
      </p>
      {entry === undefined || entry.status === "pending" ? (
        <p className="lab-muted">{entry === undefined ? "대기" : "렌더 중…"}</p>
      ) : null}
      {entry?.status === "error" ? (
        <p className="lab-error-list" role="alert">
          렌더 실패: {entry.error}
        </p>
      ) : null}
      {result ? (
        <>
          <p className="lab-card-hash">
            해시 <span className="lab-mono">{result.pixelHash}</span> · {result.renderMs.toFixed(1)} ms · dab{" "}
            {result.dabCount}
          </p>
          <ul className="lab-card-metrics">
            {result.family.map((f, i) => (
              <li key={`${f.key}-${i}`}>
                <span className="lab-mono">{f.key}</span> {formatMetric(f.value)} ({f.op} {f.threshold}){" "}
                <span className={`lab-verdict-${f.verdict}`}>{f.verdict}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <button type="button" className="lab-button" onClick={() => onOpen(preset.id)}>
        A/B 비교에서 열기
      </button>
    </article>
  );
}
