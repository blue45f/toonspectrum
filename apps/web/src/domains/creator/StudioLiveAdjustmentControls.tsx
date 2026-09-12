import { useId, useSyncExternalStore } from "react";
import { readStudioLiveAdjustmentStatus, subscribeStudioLiveAdjustmentStatus } from "./studio-live-adjustment-status";
import type { El, ImageEl } from "./studio-element-model";

export function StudioLiveAdjustmentControls({ selected, onPatch }: { selected: ImageEl & Pick<El, "clipBelow">; onPatch: (patch: Partial<El>) => void }) {
  const id = useId();
  const status = useSyncExternalStore(subscribeStudioLiveAdjustmentStatus, () => readStudioLiveAdjustmentStatus(selected.id), () => undefined);
  if (!selected.adjustmentLayer) return null;
  return <section className="space-y-2 p-2" aria-label="보정 레이어">
    <p className="text-xs">원본 레이어를 편집하면 보정 결과도 함께 바뀝니다.</p>
    <label htmlFor={id} className="block text-xs">보정 범위</label>
    <select id={id} className="min-h-11 w-full rounded border bg-background px-2 text-sm" value={selected.clipBelow === undefined ? selected.adjustmentLayer.scope : selected.clipBelow ? "clip-previous" : "composite-below"}
      onChange={(event) => onPatch({ clipBelow: event.target.value === "clip-previous", adjustmentLayer: { version: 1, scope: event.target.value === "clip-previous" ? "clip-previous" : "composite-below" } })}>
      <option value="composite-below">아래 레이어 합성</option>
      <option value="clip-previous">바로 아래 레이어</option>
    </select>
    {status?.state === "loading" ? <p role="status" className="text-xs">보정 결과를 준비하고 있어요.</p> : null}
    {status?.state === "error" ? <p role="alert" className="text-xs text-destructive">{status.message} 필터나 마스크를 수정하면 다시 계산합니다.</p> : null}
  </section>;
}
