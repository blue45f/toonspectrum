import { StudioColorSwatches } from "./StudioColorSwatches";
import { Copy, Pipette } from "lucide-react";
import { lazy, Suspense, useEffect, useLayoutEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { getTintsAndShades } from "../studio-color-harmony-engine";
import { normalizeHexColor } from "../studio-color-utils";
import { createPalette } from "../studio-palette-library";
import { getProductStudioPaletteSqliteRepository } from "../studio-palette-sqlite-repository";
import { StudioColorQuickPicker } from "../StudioColorQuickPicker";
import { StudioColorDiscPicker } from "../StudioColorDiscPicker";
import { StudioColorSlidersPanel } from "../StudioColorSlidersPanel";
import { StudioColorHarmoniesPanel } from "../StudioColorHarmoniesPanel";
import { StudioWebtoonCelShadePanel } from "../StudioWebtoonCelShadePanel";
import type { StudioColorSession } from "./studio-color-session";
import type { StudioPalette } from "../studio-color-palettes";

const PaletteLibrary = lazy(() => import("../StudioPaletteLibraryPanel").then((module) => ({ default: module.StudioPaletteLibraryPanel })));
const tabs = [{ id: "select", label: "선택" }, { id: "palettes", label: "팔레트" }, { id: "harmony", label: "배색" }] as const;
type Tab = (typeof tabs)[number]["id"];
const button = "min-h-11 rounded-lg border border-line px-3 text-xs text-fg hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50";

export interface StudioColorEditorProps {
  readonly session: StudioColorSession;
  readonly onChange: (raw: string) => void;
  readonly onGestureCommit: () => void;
  readonly onApplyRequest: () => void;
  readonly onCancelRequest: () => void;
  readonly recentColors: readonly string[];
  readonly documentColors?: readonly string[];
  readonly initialView?: string;
  readonly libraryContent?: ReactNode;
  readonly compact?: boolean;
  readonly error?: string;
  readonly historyStatus?: "loading" | "saving" | "saved" | "session-only";
  readonly onRetryHistory?: () => void;
  readonly onRequestCanvasEyedropper?: () => void;
}

function uniqueColors(colors: readonly string[], max = 24): string[] {
  const normalized = colors.map((color) => normalizeHexColor(color)).filter((color): color is string => color !== null);
  return [...new Set(normalized)].slice(0, max);
}

export function StudioColorEditor({ session, onChange: publishRaw, onGestureCommit, onApplyRequest, onCancelRequest,
  recentColors, documentColors = [], initialView = "quick", libraryContent, compact = false, error,
  historyStatus = "saved", onRetryHistory, onRequestCanvasEyedropper,
}: StudioColorEditorProps) {
  const id = useId();
  const initialTab: Tab = initialView === "palettes" || initialView === "library" ? "palettes"
    : initialView === "harmonies" || initialView === "cel-shade" ? "harmony" : "select";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [focusedTab, setFocusedTab] = useState<Tab>(initialTab);
  const [picker, setPicker] = useState(initialView === "wheel" ? "wheel" : "rectangle");
  const [harmony, setHarmony] = useState(initialView === "cel-shade" ? "cel" : "harmony");
  const [paletteId, setPaletteId] = useState("");
  const [palettes, setPalettes] = useState<StudioPalette[]>([]);
  const [paletteFailure, setPaletteFailure] = useState(false);
  const [paletteRetry, setPaletteRetry] = useState(0);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [showInvalid, setShowInvalid] = useState(false);
  const saveRef = useRef(false);
  const aliveRef = useRef(true);
  const ownerRef = useRef(session.targetKey);
  const gestureRef = useRef<{ id: number; raw: string; ending?: boolean } | null>(null);
  const recent = useMemo(() => uniqueColors(recentColors), [recentColors]);
  const authored = useMemo(() => uniqueColors(documentColors), [documentColors]);
  const shades = useMemo(() => uniqueColors(getTintsAndShades(session.color, 9)), [session.color]);
  useLayoutEffect(() => { ownerRef.current = session.targetKey; gestureRef.current = null; }, [session.targetKey]);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);
  useEffect(() => {
    if (tab !== "palettes") return;
    let active = true;
    setPaletteFailure(false);
    void import("../studio-color-palettes").then((module) => {
      if (active) setPalettes(module.STUDIO_PALETTES);
    }).catch(() => { if (active) setPaletteFailure(true); });
    return () => { active = false; };
  }, [tab, paletteRetry]);

  const onChange = (raw: string) => { if (aliveRef.current && ownerRef.current === session.targetKey) publishRaw(raw); };
  const choose = (raw: string) => { onChange(raw); setShowInvalid(false); onGestureCommit(); };
  const save = async (name: string, colors: readonly string[]) => {
    if (saveRef.current) return;
    const key = session.targetKey;
    saveRef.current = true; setSaving(true); setNotice("");
    try {
      await getProductStudioPaletteSqliteRepository().save(createPalette(name, uniqueColors(colors)));
      if (aliveRef.current && ownerRef.current === key) setNotice("내 팔레트에 저장했습니다.");
    } catch {
      if (aliveRef.current && ownerRef.current === key) setNotice("팔레트를 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally { saveRef.current = false; if (aliveRef.current) setSaving(false); }
  };
  const swatches = (title: string, colors: readonly string[]) => <StudioColorSwatches
    key={title} title={title} colors={colors} value={session.color} onChoose={choose} />;

  return <div role="presentation" data-studio-color-editor="true" data-studio-shortcut-boundary="true"
    data-studio-color-editor-compact={compact || undefined} className="space-y-3 text-[13px]"
    onKeyDown={(event) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancelRequest(); }
    }}>
    <div className="flex items-center gap-2 text-xs text-fg-2">
      <button type="button" aria-label={`이전 색상 ${session.initialColor}로 되돌리기`} onClick={() => choose(session.initialColor)}
        className="flex min-h-11 items-center gap-1 rounded-md px-1 focus-visible:ring-2 focus-visible:ring-accent">
        <span className="size-6 rounded border border-line-strong" style={{ background: session.initialColor }} aria-hidden />이전
      </button>
      <span className="size-6 rounded border border-line-strong" style={{ background: session.color }} aria-hidden />
      <output className="font-mono text-xs text-fg" aria-label="선택 중인 색상">{session.color.toUpperCase()}</output>
      <span className="ml-auto">{session.color !== session.initialColor ? "미리보기" : "현재 색"}</span>
    </div>
    <div role="tablist" aria-label="색상 작업 방식" className="grid grid-cols-3 gap-1 border-b border-line pb-1">
      {tabs.map((item, index) => <button key={item.id} type="button" role="tab" id={`${id}-tab-${item.id}`}
        aria-controls={`${id}-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={focusedTab === item.id ? 0 : -1}
        onClick={() => { setTab(item.id); setFocusedTab(item.id); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          const target = tabs[next]!.id; setFocusedTab(target); document.getElementById(`${id}-tab-${target}`)?.focus();
        }} className={`${button} ${tab === item.id ? "border-accent bg-accent-soft text-accent" : "border-transparent"}`}>
        {item.label}
      </button>)}
    </div>
    <div id={`${id}-panel-select`} role="tabpanel" aria-labelledby={`${id}-tab-select`} hidden={tab !== "select"} className="space-y-3">
      {tab === "select" ? <>
        <label className="flex items-center justify-between gap-2 text-xs text-fg-2">색상 선택 방식
          <select aria-label="색상 선택 방식" value={picker} onChange={(event) => setPicker(event.currentTarget.value)} className={`${button} bg-card`}>
            <option value="rectangle">사각형</option><option value="wheel">색상환</option>
          </select>
        </label>
        <div role="presentation" className={compact ? "[&_[data-studio-quick-color-picker]>button]:h-24" : ""}
          onPointerDownCapture={(event) => {
            if (event.button !== 0) return;
            if (gestureRef.current && gestureRef.current.id !== event.pointerId) { event.preventDefault(); event.stopPropagation(); return; }
            gestureRef.current = { id: event.pointerId, raw: session.raw };
          }}
          onPointerMoveCapture={(event) => { if (gestureRef.current && gestureRef.current.id !== event.pointerId) event.stopPropagation(); }}
          onPointerUp={(event) => { if (gestureRef.current?.id === event.pointerId) { gestureRef.current = null; onGestureCommit(); } }}
          onPointerCancel={(event) => { if (gestureRef.current?.id === event.pointerId) { const original = gestureRef.current.raw; gestureRef.current = null; onChange(original); } }}
          onLostPointerCapture={(event) => { if (gestureRef.current?.id === event.pointerId && !gestureRef.current.ending) { const original = gestureRef.current.raw; gestureRef.current = null; onChange(original); } }}
          onPointerUpCapture={(event) => { if (gestureRef.current?.id === event.pointerId) gestureRef.current.ending = true; }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.type === "number") {
              event.preventDefault(); event.stopPropagation(); onGestureCommit();
            }
          }}
          onKeyUp={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) onGestureCommit();
          }}
          onBlur={(event) => {
            if (event.relatedTarget instanceof Element && event.relatedTarget.closest('[data-studio-color-cancel]')) return;
            if (event.target instanceof HTMLInputElement && ["number", "range"].includes(event.target.type)) onGestureCommit();
          }}>
          {picker === "wheel" ? <StudioColorDiscPicker value={session.color} onChange={onChange} size={compact ? 168 : 224} />
            : <StudioColorQuickPicker value={session.color} onPreview={onChange} onCommit={() => onGestureCommit()} />}
          <details className="mt-2 rounded-lg border border-line p-2" open={initialView === "sliders" ? true : undefined}>
            <summary className="min-h-9 cursor-pointer text-xs font-semibold">정밀 수치 · RGB / HSV / HSL</summary>
            <StudioColorSlidersPanel value={session.color} onChange={onChange} />
          </details>
        </div>
      </> : null}
    </div>
    <div id={`${id}-panel-palettes`} role="tabpanel" aria-labelledby={`${id}-tab-palettes`} hidden={tab !== "palettes"} className="space-y-3">
      {tab === "palettes" ? <>
        {swatches("문서 사용 색", authored)}
        <details className="rounded-lg border border-line p-2">
          <summary className="min-h-9 cursor-pointer text-xs font-semibold">추천 팔레트</summary>
          {paletteFailure ? <p role="alert" className="text-xs text-warn">추천 팔레트를 불러오지 못했습니다. <button type="button" className={button} onClick={() => setPaletteRetry((value) => value + 1)}>다시 불러오기</button></p>
            : !palettes.length ? <p role="status" className="text-xs">추천 팔레트를 불러오는 중…</p> : <>
              <select aria-label="추천 팔레트 종류" value={paletteId || palettes[0]?.id} className={`${button} mb-2 w-full bg-card`}
                onChange={(event) => setPaletteId(event.currentTarget.value)}>{palettes.map((palette) => <option key={palette.id} value={palette.id}>{palette.label}</option>)}</select>
              {swatches("추천 색", (palettes.find((palette) => palette.id === paletteId) ?? palettes[0])?.colors ?? [])}
            </>}
        </details>
        <section aria-label="내 팔레트" className="space-y-2">
          <h4 className="text-xs font-semibold">내 팔레트 · 이름 / 가져오기 / 내보내기</h4>
          <button type="button" className={button} disabled={saving}
            onClick={() => void save(`작업 색 ${session.color}`, [session.color, ...recent])}>현재 색 모음을 내 팔레트에 저장</button>
          {libraryContent ?? <Suspense fallback={<p role="status" className="text-xs">내 팔레트를 불러오는 중…</p>}>
            <PaletteLibrary onPickColor={choose} seedColors={[session.color, ...recent]} />
          </Suspense>}
        </section>
      </> : null}
    </div>
    <div id={`${id}-panel-harmony`} role="tabpanel" aria-labelledby={`${id}-tab-harmony`} hidden={tab !== "harmony"} className="space-y-3">
      {tab === "harmony" ? <>
        <select aria-label="배색 방식" value={harmony} onChange={(event) => setHarmony(event.currentTarget.value)} className={`${button} w-full bg-card`}>
          <option value="harmony">색상 조화</option><option value="cel">웹툰 음영</option>
        </select>
        {harmony === "harmony" ? <StudioColorHarmoniesPanel saveFeedbackExternally value={session.color} onSelectColor={choose} onSaveAsPalette={(name, colors) => { void save(name, colors); }} />
          : <StudioWebtoonCelShadePanel saveFeedbackExternally value={session.color} onSelectColor={choose} onSaveAsPalette={(name, colors) => { void save(name, colors); }} />}
        {swatches("밝기와 음영 단계", shades)}
      </> : null}
    </div>
    <div className="space-y-1 border-t border-line pt-3">
      <label htmlFor={`${id}-hex`} className="block text-xs font-semibold text-fg-2">HEX 색상 코드</label>
      <div className="flex items-center gap-1.5">
        <input id={`${id}-hex`} data-studio-color-hex="true" type="text" value={session.raw}
          aria-label="헥스 색상 코드" aria-invalid={!session.valid || undefined} aria-describedby={!session.valid ? `${id}-invalid` : undefined}
          spellCheck={false} autoComplete="off" autoCapitalize="off" maxLength={40}
          onFocus={(event) => {
            const input = event.currentTarget;
            requestAnimationFrame(() => {
              const scroller = input.closest<HTMLElement>('[data-studio-color-scroll]');
              if (!scroller || !input.isConnected) return;
              const box = input.getBoundingClientRect(); const visible = scroller.getBoundingClientRect();
              if (box.bottom > visible.bottom - 8) scroller.scrollTop += box.bottom - visible.bottom + 8;
              else if (box.top < visible.top + 8) scroller.scrollTop -= visible.top - box.top + 8;
            });
          }}
          onChange={(event) => { onChange(event.currentTarget.value); setShowInvalid(false); }}
          onBlur={(event) => {
            if (event.relatedTarget instanceof Element && event.relatedTarget.closest('[data-studio-color-cancel]')) return;
            setShowInvalid(!session.valid); if (session.valid) onGestureCommit();
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); setShowInvalid(!session.valid); onApplyRequest(); }
          }} className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-card px-3 font-mono text-sm text-fg focus-visible:ring-2 focus-visible:ring-accent" />
        <button type="button" className={`${button} grid size-11 shrink-0 place-items-center p-0`} disabled={!session.valid} aria-label="색상 코드 복사" onClick={() => {
          const key = session.targetKey;
          if (!navigator.clipboard) { setNotice("이 브라우저에서는 복사를 사용할 수 없습니다."); return; }
          void navigator.clipboard.writeText(session.color).then(() => {
            if (aliveRef.current && ownerRef.current === key) setNotice("색상 코드를 복사했습니다.");
          }).catch(() => { if (aliveRef.current && ownerRef.current === key) setNotice("색상 코드 복사에 실패했습니다."); });
        }}><Copy size={16} aria-hidden /></button>
        {onRequestCanvasEyedropper ? <button type="button" className={`${button} grid size-11 shrink-0 place-items-center p-0`} aria-label="캔버스에서 정밀 색 가져오기"
          onClick={onRequestCanvasEyedropper}><Pipette size={16} aria-hidden /></button> : null}
      </div>
      {!session.valid ? <p id={`${id}-invalid`} role={showInvalid || error ? "alert" : undefined} className="text-xs text-warn">#RGB 또는 #RRGGBB 형식으로 입력하세요. 입력 내용은 유지됩니다.</p> : null}
      {error && session.valid ? <p role="alert" className="text-xs text-warn">{error}</p> : null}
    </div>
    {swatches("최근 선택 색", recent)}
    {historyStatus === "loading" ? <p role="status" className="text-xs text-fg-2">최근 색을 불러오는 중…</p>
      : historyStatus === "saving" ? <p role="status" className="text-xs text-fg-2">최근 색 저장 중…</p>
        : historyStatus === "session-only" ? <p role="status" className="text-xs text-warn">최근 색을 저장하지 못했습니다. 이 세션에서는 사용할 수 있습니다.
          {onRetryHistory ? <button type="button" className={button} onClick={onRetryHistory}>저장 다시 시도</button> : null}</p> : null}
    <details className="rounded-lg border border-line p-2">
      <summary className="min-h-9 cursor-pointer text-xs font-semibold">시스템 색상 선택기</summary>
      <p className="mb-2 text-xs text-fg-2">시스템 창에서 고른 뒤 색 적용으로 확정합니다.</p>
      <div className="flex items-center gap-2"><input type="color" aria-label="시스템 색상 선택" value={session.color}
        onChange={(event) => onChange(event.currentTarget.value)} className="h-11 w-16 cursor-pointer" />
        <button type="button" className={button} onClick={onApplyRequest}>색 적용</button></div>
    </details>
    {notice ? <p role="status" aria-label="색상 작업 결과" className={notice.includes("못") || notice.includes("실패") ? "text-xs text-warn" : "text-xs text-fg-2"}>{notice}</p> : null}
  </div>;
}
