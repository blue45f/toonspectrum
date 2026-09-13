import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadBlob } from "../export/studio-export";
import { studioPageToCrdtPage } from "../live/studio-crdt-page-payload";
import { useStudioModalSheet } from "../useStudioModalSheet";
import { importStudioColorProofProfile, loadStudioColorProofProfile, transformStudioColorProofPixels, type StudioRgbIccTransform } from "./studio-rgb-icc-transform";
import { encodeStudioColorProofPng } from "./studio-color-proof-png";
import type { StudioColorProofHost } from "./StudioColorProofContext";
import type { PageState } from "../studio-page-state";

const CONTROL = "min-h-11 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
type Preview = Awaited<ReturnType<typeof transformStudioColorProofPixels>> & { width: number; height: number; source: PageState; original: Uint8ClampedArray; transform: StudioRgbIccTransform };
function PixelPreview({ pixels, width, height }: { pixels: Uint8ClampedArray; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext("2d", { colorSpace: "srgb" });
    if (!context) return;
    context.putImageData(new ImageData(Uint8ClampedArray.from(pixels), width, height), 0, 0);
  }, [pixels, width, height]);
  return <canvas ref={ref} width={width} height={height} role="img" aria-label="선택한 ICC 프로필의 소프트 프루프" className="max-h-[45dvh] max-w-full object-contain" style={{ background: "repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 50% / 16px 16px" }} />;
}

export default function StudioColorProofDialog({ host, onClose }: { host: StudioColorProofHost; onClose: () => void }) {
  const [authorized, setAuthorized] = useState(false);
  const [transform, setTransform] = useState<StudioRgbIccTransform | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [view, setView] = useState<"original" | "proof" | "gamut">("proof");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hostRef = useRef(host); hostRef.current = host;
  const formRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLElement | null>(typeof document === "undefined" ? null : document.body);
  const titleId = useId();
  const dismiss = () => { abortRef.current?.abort(); onClose(); };
  useStudioModalSheet({ activeKey: `color-proof:${host.page.id}`, dialogRef: formRef, rootRef: bodyRef, onDismiss: dismiss });
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    let current = true; setTransform(null); setPreview(null);
    if (host.page.colorProof) void loadStudioColorProofProfile(host.page.colorProof).then(value => {
      if (current) { setTransform(value); setError(null); }
    }, cause => { if (current) setError(cause instanceof Error ? cause.message : "ICC 프로필을 읽지 못했습니다."); });
    return () => { current = false; abortRef.current?.abort(); };
  }, [host.page.colorProof]);

  async function operation(action: (signal: AbortSignal) => Promise<void>) {
    if (abortRef.current) return;
    const controller = new AbortController(); abortRef.current = controller; setBusy(true); setError(null);
    try { await action(controller.signal); }
    catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "ICC 작업에 실패했습니다."); }
    finally { if (abortRef.current === controller) { abortRef.current = null; setBusy(false); } }
  }
  async function importFile(file: File) {
    await operation(async signal => {
      if (file.size > 4096) throw new Error("현재 페이지 설정은 원본 4KiB 이하 RGB ICC 파일을 지원합니다. 파일을 축소하지 않았습니다.");
      const source = hostRef.current.getCurrentPage();
      if (!source || hostRef.current.disabled) throw new Error("현재 문서에서 ICC 설정을 변경할 수 없습니다.");
      const admitted = await importStudioColorProofProfile(new Uint8Array(await file.arrayBuffer()), file.name, authorized);
      signal.throwIfAborted();
      studioPageToCrdtPage({ ...source, colorProof: admitted.document });
      if (!hostRef.current.commitProfile(source, admitted.document)) throw new Error("문서가 바뀌어 ICC 설정을 적용하지 않았습니다. 다시 선택해 주세요.");
      setTransform(admitted.transform); setPreview(null);
    });
  }
  async function preparePreview() {
    await operation(async signal => {
      const source = hostRef.current.getCurrentPage();
      if (!source?.colorProof) throw new Error("먼저 ICC 프로필을 선택해 주세요.");
      const currentTransform = await loadStudioColorProofProfile(source.colorProof); signal.throwIfAborted();
      const canvases = await hostRef.current.capture(); signal.throwIfAborted();
      if (hostRef.current.getCurrentPage() !== source) throw new Error("캡처 중 원고가 바뀌었습니다. 최신 페이지를 다시 확인해 주세요.");
      const canvas = canvases[0]; if (!canvas || canvases.length !== 1) throw new Error("현재 페이지의 캡처를 만들지 못했습니다.");
      if (canvas.width * canvas.height > 16_777_216) throw new Error("ICC 미리보기·출력은 최대 16메가픽셀입니다. 내보내기 배율을 줄여 주세요.");
      const context = canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true });
      if (!context) throw new Error("sRGB 캡처를 읽을 수 없습니다.");
      const original = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const converted = await transformStudioColorProofPixels(original, currentTransform, signal);
      if (hostRef.current.getCurrentPage() !== source) throw new Error("계산 중 원고가 바뀌었습니다. 최신 페이지를 다시 확인해 주세요.");
      signal.throwIfAborted(); setPreview({ ...converted, original, width: canvas.width, height: canvas.height, source, transform: currentTransform });
    });
  }
  const stale = preview !== null && preview.source !== host.page;
  const selected = /^#[a-f\d]{6}$/iu.test(host.color) && transform
    ? transform.convertRgb([1, 3, 5].map(index => Number.parseInt(host.color.slice(index, index + 2), 16))) : null;
  if (typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/45 p-2 sm:p-4" data-studio-color-proof="true">
    <div ref={formRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-studio-shortcut-boundary="true" className="max-h-[calc(100dvh-1rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-line bg-card p-4 text-fg shadow-2xl">
      <h2 id={titleId} className="text-lg font-semibold">ICC 색상 확인·출력</h2>
      <p className="mt-2 text-sm text-fg-2">원고는 sRGB로 유지합니다. 선택한 RGB 프로필의 상대색도 변환 결과를 확인하고, 원본 ICC가 포함된 RGB 8비트 PNG로 내보냅니다.</p>
      <p className="mt-2 text-xs text-fg-3">현재 범위: 4KiB 이하 RGB matrix/TRC, 최대 16메가픽셀. CMYK LUT·인쇄용 잉크량·HDR 출력은 지원하지 않습니다. 일반 이미지 다운로드는 기존 sRGB입니다.</p>
      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={authorized} onChange={event => setAuthorized(event.target.checked)} />이 ICC 파일을 변환과 출력 파일에 포함할 권한이 있습니다.</label>
      <label className="block text-sm">ICC 프로필 선택<input type="file" accept=".icc,.icm,application/vnd.iccprofile" className={`${CONTROL} mt-1 w-full`} disabled={busy || host.disabled || !authorized} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importFile(file); }} /></label>
      {host.page.colorProof ? <div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span>{host.page.colorProof.profile.name} · {transform?.profile.description || "프로필 확인 중"}</span><button className={CONTROL} type="button" disabled={busy || host.disabled} onClick={() => { if (!host.commitProfile(host.page, undefined)) setError("현재 문서의 설정을 변경할 수 없습니다."); }}>프로필 해제</button></div> : null}
      {selected ? <p className="mt-2 text-sm" role="status">현재 선택 색 {host.color}: {selected.outOfGamut ? "대상 프로필 색역 밖 — 출력 시 색역 경계로 제한됩니다." : "대상 프로필 색역 안"}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={CONTROL} disabled={busy || !transform} onClick={() => void preparePreview()}>현재 페이지로 소프트 프루프</button>
        {preview ? <label className="text-sm">비교<select className={`${CONTROL} ml-2`} value={view} onChange={event => setView(event.target.value as typeof view)}><option value="original">sRGB 원본</option><option value="proof">ICC 소프트 프루프</option><option value="gamut">색역 경고 (자홍)</option></select></label> : null}</div>
      {preview ? <div className="mt-3"><PixelPreview pixels={view === "original" ? preview.original : preview[view]} width={preview.width} height={preview.height} /><p className="mt-2 text-sm">색역 밖 {preview.outOfGamutPixels} / 표시 픽셀 {preview.visiblePixels} · 알파 유지</p></div> : null}
      {stale ? <p role="status" className="mt-2 text-sm">원고가 변경되었습니다. 소프트 프루프를 새로 만들어 주세요.</p> : null}
      {error ? <p role="alert" className="mt-2 text-sm text-bad">{error}</p> : null}
      {busy ? <p role="status" className="mt-2 text-sm">색상 계산 중…</p> : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" className={CONTROL} disabled={busy || !preview || stale} onClick={() => void operation(async signal => {
        if (!preview || hostRef.current.getCurrentPage() !== preview.source) throw new Error("최신 페이지를 다시 확인해 주세요.");
        const blob = await encodeStudioColorProofPng({ rgba: preview.target, width: preview.width, height: preview.height, profileBytes: preview.transform.bytes, signal });
        signal.throwIfAborted(); if (hostRef.current.getCurrentPage() !== preview.source) throw new Error("출력 중 원고가 바뀌어 파일을 생성하지 않았습니다.");
        downloadBlob(blob, "studio-icc-rgb.png");
      })}>ICC 포함 PNG 다운로드</button><button type="button" className={CONTROL} onClick={dismiss}>{busy ? "취소하고 닫기" : "닫기"}</button></div>
    </div>
  </div>, document.body);
}
