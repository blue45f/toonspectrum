import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { downloadConversion, prepareCharacterImage } from "./conversion-browser";
import { CHARACTER_VIEWS, CONVERSION_STYLES, DEFAULT_CONVERSION_SETTINGS, PASS_LABELS, QUALITY_PROFILES, VIEW_LABELS, validateReferenceSet, type CharacterRender, type CharacterView, type ConversionSettings, type PreparedCharacterImage, type RenderPass, type ShapeEngine } from "./conversion-contract";
import { buildCharacterKit } from "./conversion-kit";

const BUTTON = "min-h-11 rounded-xl bg-raised px-4 py-2 text-sm font-semibold ring-1 ring-fg/15 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40";
const FIELD = "mt-1 block min-h-11 w-full rounded-lg bg-bg px-3 py-2 text-sm text-fg ring-1 ring-fg/20";
const CARD = "rounded-2xl bg-raised p-5 ring-1 ring-fg/10";
function PreviewPng({ bytes, label }: { bytes: Uint8Array; label: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { const next = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" })); setUrl(next); return () => URL.revokeObjectURL(next); }, [bytes]);
  return url ? <img src={url} alt={label} className="aspect-square w-full rounded-xl bg-bg object-contain" /> : null;
}
export function StudioCharacterConversionPage() {
  useDocumentTitle("캐릭터 2D ↔ 3D | ToonStudio");
  const [kind, setKind] = useState<"shape" | "image">("shape");
  const [engine, setEngine] = useState<ShapeEngine>("triposr");
  const [files, setFiles] = useState<Partial<Record<CharacterView, File>>>({});
  const [model, setModel] = useState<File>();
  const [settings, setSettings] = useState<ConversionSettings>(DEFAULT_CONVERSION_SETTINGS);
  const [crop, setCrop] = useState(true); const [fourViews, setFourViews] = useState(false);
  const [camera, setCamera] = useState({ yaw: 0, pitch: 0, animationTime: 0 });
  const [images, setImages] = useState<PreparedCharacterImage[]>([]);
  const [renders, setRenders] = useState<CharacterRender[]>([]); const [modelSha, setModelSha] = useState<string>();
  const [pass, setPass] = useState<RenderPass>("beauty");
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState("원화 또는 GLB를 선택해 주세요."); const [error, setError] = useState<string>();
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { const previous = active.current; active.current = null; previous?.abort(); }, []);
  function reset() { setImages([]); setRenders([]); setModelSha(undefined); setError(undefined); setStatus("설정을 확인하고 준비를 실행해 주세요."); }
  function updateSettings(patch: Partial<ConversionSettings>) { if (patch.quality && patch.quality !== settings.quality) reset(); setSettings((previous) => ({ ...previous, ...patch })); }
  async function perform(action: (signal: AbortSignal) => Promise<void>) {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError(undefined);
    try { await action(controller.signal); }
    catch (cause) { if (active.current === controller) { if (controller.signal.aborted) setStatus("취소했습니다. 원본 파일은 변경하지 않았습니다."); else setError(cause instanceof Error ? cause.message : "작업을 완료하지 못했습니다."); } }
    finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  async function prepare(signal: AbortSignal) {
    if (kind === "shape") {
      if (!files.front) throw new Error("정면 원화를 먼저 선택해 주세요.");
      const selected = engine === "triposr" ? ["front" as const] : CHARACTER_VIEWS;
      const result: PreparedCharacterImage[] = [];
      for (const view of selected) {
        const file = files[view]; if (!file) continue;
        setStatus(`${VIEW_LABELS[view]} 원화의 비율·여백을 준비하고 있습니다.`);
        result.push(await prepareCharacterImage(file, view, QUALITY_PROFILES[settings.quality].size, signal, crop));
      }
      signal.throwIfAborted(); validateReferenceSet(engine, result); setImages(result);
    } else {
      if (!model) throw new Error("캐릭터 GLB를 먼저 선택해 주세요.");
      setStatus("GLB 무결성·메모리 예산을 검사하고 있습니다.");
      const { renderCharacterGlb } = await import("./conversion-renderer"); signal.throwIfAborted();
      const result = await renderCharacterGlb(model, QUALITY_PROFILES[settings.quality].size, fourViews ? CHARACTER_VIEWS : ["front"], camera, signal, (view) => setStatus(`${VIEW_LABELS[view]} 렌더 패스를 만들고 있습니다.`));
      signal.throwIfAborted(); setRenders(result.renders); setModelSha(result.sha256);
    }
    setStatus("준비 완료 · AI 추론은 아직 실행하지 않았습니다.");
  }
  async function exportKit(signal: AbortSignal) {
    setStatus("원화·렌더·설정·실행기를 하나의 키트로 묶고 있습니다.");
    const bytes = await buildCharacterKit({ kind, engine, settings, images, renders, modelSha256: modelSha, camera: kind === "image" ? camera : undefined }, signal);
    signal.throwIfAborted(); downloadConversion(bytes, "toonstudio-character-ai-kit.zip", "application/zip");
    setStatus("AI 실행 키트 저장 완료 · README의 사전 검사 후 로컬에서 추론을 실행해 주세요.");
  }
  const ready = kind === "shape" ? images.length > 0 : renders.length > 0;
  return <section aria-labelledby="character-conversion-title" className="min-h-dvh bg-bg px-4 py-8 text-fg sm:px-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl"><p className="text-xs font-semibold tracking-widest text-fg-3">TOONSTUDIO · CHARACTER LAB</p>
          <h1 id="character-conversion-title" className="mt-2 text-3xl font-bold">캐릭터 2D ↔ 3D</h1>
          <p className="mt-3 text-sm leading-relaxed text-fg-2">원화의 실루엣과 3D 모델의 구도를 준비하고, 로컬 AI 실행 키트로 변환합니다. 브라우저 렌더는 바로 사용할 수 있으며, AI 추론에는 별도 모델·실행 환경이 필요합니다.</p>
        </div><nav aria-label="관련 스튜디오 도구" className="flex flex-wrap gap-2"><Link className={BUTTON} to="/studio/lift3d">설치 없이 기하 입체화</Link><Link className={BUTTON} to="/studio">스튜디오로</Link></nav>
      </header>
      <div role="group" aria-label="변환 방향" className="flex flex-wrap gap-2">
        {([["shape", "2D 원화 → AI 3D"], ["image", "3D 모델 → 2D / AI 일러스트"]] as const).map(([value, label]) => <button key={value} type="button" disabled={busy} aria-pressed={kind === value} className={BUTTON} onClick={() => { setKind(value); reset(); }}>{label}</button>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-[23rem_1fr]">
        <fieldset disabled={busy} className="space-y-4"><legend className="sr-only">변환 입력과 설정</legend>
          <div className={CARD}><h2 className="mb-4 font-semibold">1. 원본 준비</h2>
            {kind === "shape" ? <div className="space-y-4">
              <label className="block text-sm">AI 엔진<select className={FIELD} value={engine} onChange={(event) => { setEngine(event.target.value as ShapeEngine); reset(); }}><option value="triposr">TripoSR · 정면 1장 · MIT</option><option value="trellis">TRELLIS · 1~4장 · MIT · CUDA 필요</option></select></label>
              {(engine === "triposr" ? ["front" as const] : CHARACTER_VIEWS).map((view) => <label key={view} className="block text-sm">{VIEW_LABELS[view]} 원화 {view === "front" ? "(필수)" : "(선택)"}<input type="file" accept="image/png,image/jpeg,image/webp" className={FIELD} onChange={(event) => { const file = event.target.files?.[0]; setFiles((previous) => ({ ...previous, [view]: file })); reset(); }} /><span className="mt-1 block break-all text-xs text-fg-3">{files[view]?.name ?? "PNG · JPEG · WebP / 최대 16MiB"}</span></label>)}
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={crop} onChange={(event) => { setCrop(event.target.checked); reset(); }} />투명 영역을 정리하고 10% 여백 보존</label>
              <p className="text-xs leading-relaxed text-fg-3">실제 다른 시점 원화를 사용해 주세요. TripoSR은 정면 한 장만 사용하며, 불투명 배경은 자동으로 제거하지 않습니다.</p>
            </div> : <div className="space-y-4">
              <label className="block text-sm">캐릭터 GLB<input type="file" accept=".glb,model/gltf-binary" className={FIELD} onChange={(event) => { setModel(event.target.files?.[0]); reset(); }} /></label>
              <p className="text-xs text-fg-3">최대 64MiB. 텍스처를 내장한 GLB 2.0을 사용해 주세요. 외부 참조·미지원 압축은 차단합니다.</p>
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={fourViews} onChange={(event) => { setFourViews(event.target.checked); reset(); }} />정면·좌·후면·우 4방향 만들기</label>
              <label className="block text-sm">기준 회전 {camera.yaw}°<input className="mt-2 w-full" type="range" min={-180} max={180} step={5} value={camera.yaw} onChange={(event) => { setCamera({ ...camera, yaw: Number(event.target.value) }); reset(); }} /></label>
              <label className="block text-sm">카메라 높이 {camera.pitch}°<input className="mt-2 w-full" type="range" min={-60} max={60} step={5} value={camera.pitch} onChange={(event) => { setCamera({ ...camera, pitch: Number(event.target.value) }); reset(); }} /></label>
              <label className="block text-sm">첫 애니메이션 시점 (초, 0은 기본 포즈)<input className={FIELD} type="number" min={0} max={60} step={0.1} value={camera.animationTime} onChange={(event) => { setCamera({ ...camera, animationTime: Number(event.target.value) }); reset(); }} /></label>
            </div>}
          </div>
          <div className={CARD}><h2 className="mb-4 font-semibold">2. 품질과 AI 설정</h2><div className="space-y-4">
            <label className="block text-sm">품질<select className={FIELD} value={settings.quality} onChange={(event) => updateSettings({ quality: event.target.value as ConversionSettings["quality"] })}>{Object.entries(QUALITY_PROFILES).map(([key, value]) => <option key={key} value={key}>{value.label} · {value.size}px</option>)}</select></label>
            <label className="block text-sm">고정 시드<input className={FIELD} type="number" min={0} max={2147483647} step={1} value={settings.seed} onChange={(event) => updateSettings({ seed: Number(event.target.value) })} /></label>
            {kind === "image" ? <>
              <label className="block text-sm">AI 그림 스타일<select className={FIELD} value={settings.style} onChange={(event) => updateSettings({ style: event.target.value as ConversionSettings["style"] })}>{Object.entries(CONVERSION_STYLES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
              <label className="block text-sm">재해석 강도 {settings.strength.toFixed(2)}<input type="range" min={0.15} max={0.75} step={0.05} className="mt-2 w-full" value={settings.strength} onChange={(event) => updateSettings({ strength: Number(event.target.value) })} /></label>
              <p className="text-xs leading-relaxed text-fg-3">낮은 강도부터 원본과 비교해 주세요. 높은 강도는 얼굴·의상·실루엣을 바꿀 수 있습니다.</p>
              <label className="block text-sm">추가 지시<textarea className={FIELD} rows={3} maxLength={1200} value={settings.prompt} onChange={(event) => updateSettings({ prompt: event.target.value })} /></label>
              <label className="block text-sm">제외할 요소<textarea className={FIELD} rows={2} maxLength={800} value={settings.negative} onChange={(event) => updateSettings({ negative: event.target.value })} /></label>
              <label className="block text-sm">설치된 SDXL 체크포인트<input className={FIELD} value={settings.checkpoint} onChange={(event) => updateSettings({ checkpoint: event.target.value })} spellCheck={false} /></label>
              <label className="block text-sm">SDXL용 depth ControlNet 파일 (선택)<input className={FIELD} value={settings.controlNet} onChange={(event) => updateSettings({ controlNet: event.target.value })} placeholder="설치한 .safetensors 파일 이름" spellCheck={false} /></label>
              {settings.controlNet ? <label className="block text-sm">깊이 제어 {settings.controlStrength.toFixed(1)}<input className="mt-2 w-full" type="range" min={0} max={1.5} step={0.1} value={settings.controlStrength} onChange={(event) => updateSettings({ controlStrength: Number(event.target.value) })} /></label> : null}
            </> : <p className="text-xs leading-relaxed text-fg-3">생성한 뒷면·손가락·의상은 검수가 필요합니다. TripoSR은 vertex-color GLB, TRELLIS는 텍스처 GLB를 내보냅니다. 자동 리깅은 제공하지 않습니다.</p>}
          </div></div>
        </fieldset>
        <div className="space-y-4">
          <div className={CARD}><h2 className="font-semibold">3. 미리보기와 실행 준비</h2>
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={BUTTON} disabled={busy} onClick={() => { void perform(prepare); }}>{kind === "shape" ? "원화 준비" : "로컬 렌더 만들기"}</button><button type="button" className={BUTTON} disabled={busy || !ready || Boolean(error)} onClick={() => { void perform(exportKit); }}>AI 실행 키트 저장</button>{busy ? <button type="button" className={BUTTON} onClick={() => { active.current?.abort(); setStatus("안전하게 취소하고 있습니다."); }}>취소</button> : null}</div>
            <p role="status" aria-live="polite" className="mt-4 text-sm text-fg-2">{status}</p>
            {error ? <p role="alert" className="mt-3 rounded-lg bg-bg p-3 text-sm">{error}</p> : null}
          </div>
          {kind === "shape" && images.length > 0 ? <div className={CARD}><h3 className="mb-4 font-semibold">비율과 여백을 보존한 입력</h3>
            <div className="grid grid-cols-2 gap-4">{images.map((image) => <figure key={image.view}><PreviewPng bytes={image.png} label={`${VIEW_LABELS[image.view]} AI 입력 원화`} /><figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">{VIEW_LABELS[image.view]} · {image.width}px<button type="button" className={BUTTON} onClick={() => downloadConversion(image.png, `character-${image.view}.png`, "image/png")}>PNG 저장</button></figcaption></figure>)}</div>
            {Array.from(new Set(images.flatMap((image) => image.notices))).map((notice) => <p key={notice} className="mt-3 text-xs leading-relaxed text-fg-3">{notice}</p>)}
          </div> : null}
          {kind === "image" && renders.length > 0 ? <div className={CARD}><h3 className="font-semibold">브라우저 렌더 · AI 생성 결과 아님</h3>
            <div role="group" aria-label="렌더 패스" className="my-4 flex flex-wrap gap-2">{(Object.keys(PASS_LABELS) as RenderPass[]).map((value) => <button key={value} type="button" className={BUTTON} aria-pressed={pass === value} onClick={() => setPass(value)}>{PASS_LABELS[value]}</button>)}</div>
            <div className="grid gap-4 sm:grid-cols-2">{renders.map((render) => <figure key={render.view}><PreviewPng bytes={render.passes[pass]} label={`${VIEW_LABELS[render.view]} ${PASS_LABELS[pass]}`} /><figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">{VIEW_LABELS[render.view]}<button type="button" className={BUTTON} onClick={() => downloadConversion(render.passes[pass], `character-${render.view}-${pass}.png`, "image/png")}>PNG 저장</button></figcaption></figure>)}</div>
            <p className="mt-4 text-xs leading-relaxed text-fg-3">깊이는 가까울수록 흰색입니다. 원본 재질·셀 채색·법선·선화 PNG는 투명도를 보존합니다. AI 입력은 흰 배경으로 합성하며 모든 패스를 키트에 포함합니다.</p>
          </div> : null}
          <aside className={CARD} aria-labelledby="character-local-ai-guide"><h3 id="character-local-ai-guide" className="font-semibold">로컬 AI 실행 안내</h3>
            <p className="mt-3 text-sm leading-relaxed text-fg-2">키트의 README에 따라 공식 모델 환경을 준비한 뒤, 먼저 사전 검사를 실행합니다. 원화·모델은 이 화면에서 서버로 업로드하지 않습니다. 유료 API 호출과 자동 모델 설치는 없습니다.</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-bg p-3 text-xs"><code>python3 run-character-ai.py . --check</code></pre>
            <p className="mt-3 text-xs leading-relaxed text-fg-3">TripoSR은 공식 Python 환경, TRELLIS는 Linux/CUDA 환경, 3D→2D AI는 SDXL 모델이 설치된 로컬 ComfyUI가 필요합니다. 체크포인트·보조 모델의 라이선스와 장비 요구사항을 확인해 주세요. 실제 추론 성공은 실행 후 receipt.json에 기록됩니다.</p>
            <p className="mt-3 text-xs leading-relaxed text-fg-3">권한이 있는 원화·모델만 사용해 주세요. 생성한 GLB는 3D→2D 탭에서 다시 확인할 수 있습니다. 외형·뒷면·얼굴 일치와 자동 리깅은 보장하지 않습니다.</p>
          </aside>
        </div>
      </div>
    </div>
  </section>;
}
