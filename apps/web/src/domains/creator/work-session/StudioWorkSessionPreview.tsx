import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioWorkSessionView } from "@toonspectrum/studio-project-model";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioReviewImage } from "../virtual-space/StudioPinnedReviewPreview";
import { useStudioPinnedReviewPreviews } from "../virtual-space/use-studio-pinned-review-previews";
import type { StudioWorkSessionController } from "./studio-work-session-controller";

const control = "min-h-11 rounded-lg border border-line bg-card px-3 text-sm";
/** Only the review viewport follows an explicitly shared, server-verified position; the editor is untouched. */
export function StudioWorkSessionPreview({ view, controller, busy }: {
  readonly view: StudioWorkSessionView; readonly controller: StudioWorkSessionController; readonly busy: boolean;
}) {
  const bt = useBilingual("StudioWorkSessionPreview"), [input] = useState(view.session.input);
  const [revoked, setRevoked] = useState(false), [ordinal, setOrdinal] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1), [following, setFollowing] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const onRevoked = useCallback(() => { setRevoked(true); setFollowing(false); controller.suspend(); }, [controller]);
  const previews = useStudioPinnedReviewPreviews(input, onRevoked);
  const shared = view.session.status === "active" ? view.session.presenter : null;
  const followingActive = following && Boolean(shared) && !revoked;
  const pages = previews.result?.ok ? previews.result.previews : [];
  const selectedOrdinal = followingActive ? shared!.pageOrdinal : ordinal;
  const selected = selectedOrdinal === null ? pages[0] : pages.find((page) => page.ordinal === selectedOrdinal);
  const shownZoom = followingActive ? shared!.zoom : zoom;
  const applyPosition = useCallback(() => {
    if (!followingActive || !shared || !selected || !viewport.current) return;
    const el = viewport.current;
    el.scrollLeft = Math.max(0, el.scrollWidth - el.clientWidth) * shared.x;
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight) * shared.y;
  }, [followingActive, shared, selected]);
  useEffect(() => { const frame = requestAnimationFrame(applyPosition); return () => cancelAnimationFrame(frame); }, [applyPosition]);
  const stop = () => { if (followingActive && shared) { setOrdinal(shared.pageOrdinal); setZoom(shared.zoom); } setFollowing(false); };
  const share = () => {
    if (!selected || !viewport.current || busy || revoked) return;
    const el = viewport.current;
    void controller.command({ action: "present", presenter: { pageOrdinal: selected.ordinal, zoom: shownZoom,
      x: el.scrollWidth > el.clientWidth ? Math.min(1, Math.max(0, el.scrollLeft / (el.scrollWidth - el.clientWidth))) : 0,
      y: el.scrollHeight > el.clientHeight ? Math.min(1, Math.max(0, el.scrollTop / (el.scrollHeight - el.clientHeight))) : 0 } });
  };
  if (revoked) return <p role="status">{bt("고정 입력본의 열람 권한을 다시 확인해야 합니다.", "Access to the pinned input must be rechecked.")}</p>;
  return <section className="space-y-3 rounded-lg border border-line p-3" aria-label={bt("고정 입력본 함께 보기", "View the pinned input together")}>
    <h4 className="font-semibold">{bt("고정 입력본", "Pinned input")}</h4>
    <p className="break-all text-xs text-fg-2">{input.revisionId}</p>
    <div className="flex flex-wrap gap-2">
      <label className="text-sm">{bt("페이지", "Page")}<select className={`${control} ml-2`} value={selected?.ordinal ?? ""} onChange={(event) => { stop(); setOrdinal(Number(event.target.value)); }}>
        <option value="" disabled>{bt("페이지 선택", "Select page")}</option>
        {pages.map((page) => <option key={page.ordinal} value={page.ordinal}>{page.ordinal + 1}</option>)}
      </select></label>
      <label className="text-sm">{bt("확대", "Zoom")}<select className={`${control} ml-2`} value={shownZoom} onChange={(event) => { stop(); setZoom(Number(event.target.value)); }}>
        {[0.5, 1, 1.5, 2, 3, 4].map((value) => <option key={value} value={value}>{value * 100}%</option>)}
      </select></label>
      <button type="button" className={control} disabled={!shared} aria-pressed={followingActive} onClick={() => { if (following) stop(); else setFollowing(true); }}>{followingActive ? bt("따라보기 중지", "Stop following") : bt("공유한 위치 따라보기", "Follow the shared position")}</button>
      {view.capabilities.edit && view.session.status === "active" ? <button type="button" className={control} disabled={busy || !selected} onClick={share}>{bt("이 페이지·위치 공유", "Share this page and position")}</button> : null}
    </div>
    <p className="text-xs text-fg-2">{bt("공유 버튼을 누른 위치를 주기적으로 확인합니다. 직접 스크롤·터치·페이지 선택하면 따라보기를 멈춥니다. 원고와 편집 도구는 변경하지 않습니다.", "The explicitly shared position refreshes periodically. Scrolling, touch or selecting a page stops following. Your manuscript and editor tools remain unchanged.")}</p>
    <div className="flex flex-wrap gap-2" role="group" aria-label={bt("미리보기 이동", "Pan preview")}>
      {([[-1, 0, "왼쪽", "Left"], [0, -1, "위", "Up"], [0, 1, "아래", "Down"], [1, 0, "오른쪽", "Right"]] as const).map(([x, y, ko, en]) =>
        <button type="button" className={control} key={en} onClick={() => { stop(); const el = viewport.current; if (el) { el.scrollLeft += x * el.clientWidth * 0.5; el.scrollTop += y * el.clientHeight * 0.5; } }}>{bt(ko, en)}</button>)}
    </div>
    <div ref={viewport} role="region" aria-label={bt("검수본 스크롤 영역", "Review scrolling area")}
      className="max-h-[50vh] overflow-auto rounded-lg border border-line bg-panel" onWheel={stop} onPointerDown={stop}
      onLoadCapture={applyPosition}>
      {selected ? <div style={{ width: `${shownZoom * 100}%` }}><StudioReviewImage key={selected.sha256} preview={selected}
        label={bt(`고정 입력본 ${selected.ordinal + 1}페이지`, `Pinned input page ${selected.ordinal + 1}`)} className="block h-auto w-full" figureClassName="m-0" /></div>
        : <p className="p-4 text-sm" role="status">{followingActive ? bt("공유된 페이지가 현재 미리보기 목록에 없습니다. 다음 목록을 확인하거나 개인 탐색으로 전환하세요.", "The shared page is not in the current preview list. Open another list or stop following.")
          : bt("미리보기를 불러오는 중이거나 확인할 수 없습니다.", "The preview is loading or unavailable.")}</p>}
    </div>
    <div className="flex flex-wrap gap-2">
      {previews.cursor ? <button type="button" className={control} onClick={() => { stop(); setOrdinal(null); previews.setCursor(null); }}>{bt("처음 페이지 목록", "First page list")}</button> : null}
      {previews.result?.ok && previews.result.nextCursor ? <button type="button" className={control} onClick={() => { stop(); setOrdinal(null); previews.setCursor(previews.result?.ok ? previews.result.nextCursor : null); }}>{bt("다음 페이지 목록", "Next page list")}</button> : null}
      <button type="button" className={control} onClick={previews.refresh}>{bt("미리보기 다시 확인", "Refresh preview")}</button>
    </div>
  </section>;
}
