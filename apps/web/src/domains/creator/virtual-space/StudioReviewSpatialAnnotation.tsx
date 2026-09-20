import { useId, useState, type ReactNode, type PointerEvent } from "react";
import { createStudioReviewSpatialAnchor, validateStudioReviewSpatialAnchor, type ReviewAnchor, type StudioReviewMappedPage, type StudioReviewSpatialAnchor,
  type StudioReviewSpatialSelection } from "@toonspectrum/studio-project-model";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export interface StudioReviewAnnotationSelection {
  readonly anchor: StudioReviewSpatialAnchor;
  readonly mapping: StudioReviewMappedPage;
  readonly sha256: string;
  readonly expiresAt: number;
}
export interface StudioReviewAnnotationControl {
  readonly selected: StudioReviewAnnotationSelection | null;
  readonly onSelect: (selection: StudioReviewAnnotationSelection | null) => void;
  readonly disabled: boolean;
  readonly commentInputId?: string;
}
type Mode = StudioReviewSpatialSelection["kind"];
export interface StudioReviewAnnotationNote { readonly id: string; readonly body: string; readonly anchor: ReviewAnchor }
const controlClass = "min-h-11 rounded-lg border border-line bg-card px-3 text-sm disabled:opacity-50";

export function StudioReviewAnnotationLocation({ anchor, mapping }: { readonly anchor: { readonly kind: string; readonly source?: StudioReviewSpatialAnchor["source"]; readonly x?: number; readonly y?: number }; readonly mapping?: StudioReviewMappedPage }) {
  const bt = useBilingual("StudioReviewAnnotationLocation");
  if (!anchor.source) return <span>{anchor.kind === "artifact" ? bt("전체 검수본", "Whole review")
    : bt("기존 의견 위치 · 페이지 연결 미확인", "Legacy note location · page mapping unverified")}</span>;
  const frameIndex = mapping?.page.frames.findIndex((frame) => frame.id === anchor.source?.frameId) ?? -1;
  const elementIndex = mapping?.page.elements.findIndex((element) => element.id === anchor.source?.elementId) ?? -1;
  const kind = anchor.kind === "panel" ? frameIndex >= 0 ? bt(`컷 ${frameIndex + 1}`, `Cut ${frameIndex + 1}`) : bt("선택한 컷", "Selected cut")
    : anchor.kind === "object" ? elementIndex >= 0 ? bt(`요소 ${elementIndex + 1}`, `Object ${elementIndex + 1}`) : bt("선택한 요소", "Selected object")
    : anchor.kind === "coordinate" ? bt("지정 위치", "Point") : anchor.kind === "region" ? bt("지정 영역", "Region") : bt("페이지", "Page");
  return <span>{bt(`${anchor.source.pageOrdinal + 1}페이지`, `Page ${anchor.source.pageOrdinal + 1}`)} · {kind}
    {anchor.x !== undefined && anchor.y !== undefined ? ` (${Math.round(anchor.x)}, ${Math.round(anchor.y)} px)` : ""}</span>;
}

/** All pointer and keyboard placements lower through the same immutable source validator. */
export function StudioReviewSpatialAnnotation({ mapping, sha256, expiresAt, control, children, notes = [], editable = true }: {
  readonly mapping: StudioReviewMappedPage; readonly sha256: string; readonly expiresAt: number;
  readonly control: StudioReviewAnnotationControl; readonly children: ReactNode;
  readonly notes?: readonly StudioReviewAnnotationNote[]; readonly editable?: boolean;
}) {
  const bt = useBilingual("StudioReviewSpatialAnnotation"), id = useId();
  const [mode, setMode] = useState<Mode>("page"), [frameId, setFrameId] = useState(""), [elementId, setElementId] = useState("");
  const [numbers, setNumbers] = useState({ x: "50", y: "50", width: "10", height: "10" });
  const [start, setStart] = useState<{ x: number; y: number; pointerId: number } | null>(null);
  const [error, setError] = useState("");
  const [highlighted, setHighlighted] = useState<ReviewAnchor | null>(null);
  const { page } = mapping;
  const chosen = control.selected?.sha256 === sha256 && control.selected.anchor.source.pageOrdinal === page.ordinal ? control.selected.anchor : null;
  const selected = highlighted ?? chosen;
  const pageNotes = notes.filter((note) => note.anchor && validateStudioReviewSpatialAnchor(mapping, note.anchor));
  const frame = page.frames.find((value) => value.id === selected?.source?.frameId);
  const clear = () => { setStart(null); setError(""); setHighlighted(null); control.onSelect(null); };
  const choose = (selection: StudioReviewSpatialSelection) => {
    if (control.disabled || expiresAt <= Date.now()) return;
    const anchor = createStudioReviewSpatialAnchor(mapping, selection);
    if (!anchor) { control.onSelect(null); setError(bt("페이지와 선택한 컷 안의 위치를 골라 주세요.", "Choose a position inside the page and selected cut.")); return; }
    setError(""); setHighlighted(null); control.onSelect({ anchor, mapping, sha256, expiresAt });
  };
  const apply = () => {
    if (mode === "page") choose({ kind: "page" });
    else if (mode === "panel") choose({ kind: "panel", frameId });
    else if (mode === "object") choose({ kind: "object", elementId });
    else {
      const values = Object.fromEntries(Object.entries(numbers).map(([key, value]) => [key, value.trim() ? Number(value) : NaN]));
      choose({ kind: mode, ...(frameId ? { frameId } : {}), x: values.x! / 100 * page.width, y: values.y! / 100 * page.height,
        ...(mode === "region" ? { width: values.width! / 100 * page.width, height: values.height! / 100 * page.height } : {}) });
    }
  };
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const image = event.currentTarget.querySelector("img");
    if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return null;
    return { x: (event.clientX - rect.left) / rect.width * page.width, y: (event.clientY - rect.top) / rect.height * page.height };
  };
  return <section className="mt-4 rounded-xl border border-line p-3" aria-label={bt(`${page.ordinal + 1}페이지 의견 위치`, `Page ${page.ordinal + 1} annotation placement`)}>
    <div className="relative mx-auto" style={{ width: `min(100%, ${70 * page.renderWidth / page.renderHeight}vh)`, touchAction: mode === "coordinate" || mode === "region" ? "none" : "auto" }}
      onPointerDown={(event) => {
        if (control.disabled || (mode !== "coordinate" && mode !== "region") || event.button !== 0) return;
        const value = point(event); if (!value) return;
        event.currentTarget.setPointerCapture?.(event.pointerId); setStart({ ...value, pointerId: event.pointerId });
      }} onPointerUp={(event) => {
        if (!start || start.pointerId !== event.pointerId || control.disabled) return;
        const end = point(event); setStart(null); event.currentTarget.releasePointerCapture?.(event.pointerId);
        if (!end) { clear(); return; }
        if (mode === "coordinate") choose({ kind: "coordinate", ...(frameId ? { frameId } : {}), x: end.x, y: end.y });
        else if (mode === "region") choose({ kind: "region", ...(frameId ? { frameId } : {}), x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) });
      }} onPointerCancel={() => { if (start) clear(); }}>
      {children}
      {selected ? <svg className="pointer-events-none absolute inset-0 h-full w-full text-accent" viewBox={`0 0 ${page.width} ${page.height}`} preserveAspectRatio="none" aria-hidden="true">
        {selected.kind === "page" ? <rect x="0" y="0" width={page.width} height={page.height} fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth={Math.max(page.width, page.height) * 0.008} />
          : selected.kind === "coordinate" ? <circle cx={selected.x} cy={selected.y} r={Math.max(page.width, page.height) * 0.008} fill="currentColor" stroke="white" strokeWidth={Math.max(page.width, page.height) * 0.002} />
          : selected.kind === "region" ? <rect x={selected.x} y={selected.y} width={selected.width} height={selected.height} fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth={Math.max(page.width, page.height) * 0.004} />
            : frame ? frame.polygon ? <polygon points={frame.polygon.map((value) => `${value.x},${value.y}`).join(" ")} fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth={Math.max(page.width, page.height) * 0.004} />
              : <rect {...frame.bounds} fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth={Math.max(page.width, page.height) * 0.004} /> : null}
      </svg> : null}
    </div>
    {editable ? <fieldset disabled={control.disabled} className="mt-3 space-y-3">
      <legend className="font-semibold">{bt("의견을 남길 위치", "Where to leave a note")}</legend>
      <label className="flex flex-wrap items-center gap-2" htmlFor={`${id}-mode`}>{bt("위치 방식", "Placement")}
        <select id={`${id}-mode`} className={controlClass} value={mode} onChange={(event) => { clear(); setMode(event.target.value as Mode); }}>
          <option value="page">{bt("이 페이지", "This page")}</option><option value="panel">{bt("컷", "Cut")}</option>
          <option value="object">{bt("요소", "Object")}</option><option value="coordinate">{bt("점", "Point")}</option><option value="region">{bt("영역", "Region")}</option>
        </select>
      </label>
      {mode === "panel" || mode === "coordinate" || mode === "region" ? <label className="flex flex-wrap items-center gap-2" htmlFor={`${id}-frame`}>{bt("연결할 컷", "Cut to attach")}
        <select id={`${id}-frame`} className={controlClass} value={frameId} onChange={(event) => { clear(); setFrameId(event.target.value); }}>
          <option value="">{mode === "panel" ? bt("컷을 선택해 주세요", "Choose a cut") : bt("페이지 전체 범위", "Anywhere on this page")}</option>
          {page.frames.map((value, index) => <option key={value.id} value={value.id}>{bt(`컷 ${index + 1}`, `Cut ${index + 1}`)}</option>)}
        </select>
      </label> : null}
      {mode === "object" ? <label className="flex flex-wrap items-center gap-2" htmlFor={`${id}-element`}>{bt("연결할 요소", "Object to attach")}
        <select id={`${id}-element`} className={controlClass} value={elementId} onChange={(event) => { clear(); setElementId(event.target.value); }}>
          <option value="">{bt("요소를 선택해 주세요", "Choose an object")}</option>
          {page.elements.map((value, index) => <option key={value.id} value={value.id}>{bt(`요소 ${index + 1}`, `Object ${index + 1}`)}{value.origin === "master" ? bt(" · 공통 요소", " · Master object") : ""}</option>)}
        </select>
      </label> : null}
      {mode === "coordinate" || mode === "region" ? <>
        <p className="text-sm text-fg-2">{mode === "region" ? bt("이미지에서 영역을 드래그하거나 아래 비율을 입력해 주세요.", "Drag a region on the image or enter percentages below.") : bt("이미지의 위치를 누르거나 아래 비율을 입력해 주세요.", "Click a point on the image or enter percentages below.")}</p>
        <div className="flex flex-wrap gap-3">{(["x", "y", ...(mode === "region" ? ["width", "height"] : [])] as const).map((key) => <label key={key} className="text-sm">
          {key === "x" ? bt("가로 위치 (%)", "Horizontal position (%)") : key === "y" ? bt("세로 위치 (%)", "Vertical position (%)") : key === "width" ? bt("너비 (%)", "Width (%)") : bt("높이 (%)", "Height (%)")}
          <input type="number" inputMode="decimal" min="0" max="100" step="0.1" className={`${controlClass} ml-2 w-24`} value={numbers[key as keyof typeof numbers]}
            onChange={(event) => { clear(); setNumbers((value) => ({ ...value, [key]: event.target.value })); }} />
        </label>)}</div>
      </> : null}
      <button type="button" className={controlClass} disabled={mode === "panel" && !frameId || mode === "object" && !elementId} onClick={apply}>{bt("이 위치에 의견 연결", "Attach note to this location")}</button>
    </fieldset> : null}
    {pageNotes.length ? <ol className="mt-3 space-y-2" aria-label={bt("이 페이지의 위치 의견", "Notes attached to this page")}>{pageNotes.map((note, index) => <li key={note.id} className="rounded-lg border border-line p-2 text-sm">
      <button type="button" className="min-h-11 text-left underline" onClick={() => setHighlighted(note.anchor)}>{bt(`의견 ${index + 1} 위치 보기`, `Show note ${index + 1} location`)} · <StudioReviewAnnotationLocation anchor={note.anchor} mapping={mapping} /></button>
      <p className="whitespace-pre-wrap break-words">{note.body}</p>
    </li>)}</ol> : null}
    {error ? <p role="alert" className="mt-2 text-sm">{error}</p> : null}
    {highlighted ? <p role="status" className="mt-2 text-sm"><StudioReviewAnnotationLocation anchor={highlighted} mapping={mapping} /> · {bt("저장된 의견 위치", "Saved note location")}</p> : null}
    {chosen ? <p role="status" className="mt-2 text-sm"><StudioReviewAnnotationLocation anchor={chosen} mapping={mapping} /> · {control.commentInputId
      ? <a className="inline-flex min-h-11 items-center underline" href={`#${control.commentInputId}`}>{bt("의견 작성으로 이동", "Go to note editor")}</a>
      : bt("아래에 의견을 작성해 주세요.", "Write your note below.")}</p> : null}
  </section>;
}
