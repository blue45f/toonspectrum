import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { SectionArt } from "@/shared/components/section-art";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { downloadConversion, prepareCharacterImage } from "./conversion-browser";
import { CHARACTER_VIEWS, CONVERSION_STYLES, DEFAULT_CONVERSION_SETTINGS, PASS_LABELS, QUALITY_PROFILES, VIEW_LABELS, validateReferenceSet, type CharacterRender, type CharacterView, type ConversionSettings, type PreparedCharacterImage, type RenderPass, type ShapeEngine } from "./conversion-contract";
import { buildCharacterKit } from "./conversion-kit";
import { ConversionFilePicker } from "./ConversionFilePicker";
import { Studio3dIllustration } from "../studio-3d-ui/Studio3dIllustration";
import "../studio-3d-ui/studio-3d-illustrated-chrome.css";

// 계약 파일의 한글 라벨을 손대지 않고 페이지에서 영문 쌍을 매핑한다.
const VIEW_LABELS_EN: Record<CharacterView, string> = { front: "Front", left: "Left", back: "Back", right: "Right" };
const PASS_LABELS_EN: Record<RenderPass, string> = {
  beauty: "Base color",
  cel: "Cel shading",
  depth: "Depth",
  normal: "Normals",
  lineart: "Line art",
  mask: "Silhouette",
};
const CONVERSION_STYLE_LABELS_EN: Record<keyof typeof CONVERSION_STYLES, string> = {
  webtoon: "Color webtoon",
  anime: "Anime cel",
  ink: "Black & white manga",
  watercolor: "Watercolor illustration",
};
const QUALITY_PROFILE_LABELS_EN: Record<keyof typeof QUALITY_PROFILES, string> = {
  draft: "Draft",
  balanced: "Balanced",
  detail: "Detailed",
};

const BUTTON = "min-h-11 rounded-xl bg-raised px-4 py-2 text-sm font-semibold ring-1 ring-fg/15 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40";
const FIELD = "mt-1 block min-h-11 w-full rounded-lg bg-bg px-3 py-2 text-sm text-fg ring-1 ring-fg/20";
const CARD = "studio-character-conversion__card rounded-2xl bg-raised p-5 ring-1 ring-fg/10";
function PreviewPng({ bytes, label }: { bytes: Uint8Array; label: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { const next = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" })); setUrl(next); return () => URL.revokeObjectURL(next); }, [bytes]);
  return url ? <img src={url} alt={label} className="aspect-square w-full rounded-xl bg-bg object-contain" /> : null;
}
export function StudioCharacterConversionPage() {
  const bt = useBilingual("StudioCharacterConversionPage");
  useDocumentTitle(bt("캐릭터 2D ↔ 3D", "Character 2D ↔ 3D"));
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
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState(bt("원화 또는 GLB를 선택해 주세요.", "Select original art or a GLB file.")); const [error, setError] = useState<string>();
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { const previous = active.current; active.current = null; previous?.abort(); }, []);
  function reset() { setImages([]); setRenders([]); setModelSha(undefined); setError(undefined); setStatus(bt("설정을 확인하고 준비를 실행해 주세요.", "Check the settings and run the preparation.")); }
  function updateSettings(patch: Partial<ConversionSettings>) { if (patch.quality && patch.quality !== settings.quality) reset(); setSettings((previous) => ({ ...previous, ...patch })); }
  async function perform(action: (signal: AbortSignal) => Promise<void>) {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError(undefined);
    try { await action(controller.signal); }
    catch (cause) { if (active.current === controller) { if (controller.signal.aborted) setStatus(bt("취소했습니다. 원본 파일은 변경하지 않았습니다.", "Cancelled. The original files were not changed.")); else setError(cause instanceof Error ? cause.message : bt("작업을 완료하지 못했습니다.", "Couldn't finish the task.")); } }
    finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  async function prepare(signal: AbortSignal) {
    if (kind === "shape") {
      if (!files.front) throw new Error(bt("정면 원화를 먼저 선택해 주세요.", "Select the front artwork first."));
      const selected = engine === "triposr" ? ["front" as const] : CHARACTER_VIEWS;
      const result: PreparedCharacterImage[] = [];
      for (const view of selected) {
        const file = files[view]; if (!file) continue;
        setStatus(bt(`${VIEW_LABELS[view]} 원화의 비율·여백을 준비하고 있습니다.`, `Preparing the aspect ratio and margins of the ${VIEW_LABELS_EN[view]} artwork…`));
        result.push(await prepareCharacterImage(file, view, QUALITY_PROFILES[settings.quality].size, signal, crop));
      }
      signal.throwIfAborted(); validateReferenceSet(engine, result); setImages(result);
    } else {
      if (!model) throw new Error(bt("캐릭터 GLB를 먼저 선택해 주세요.", "Select a character GLB first."));
      setStatus(bt("GLB 무결성·메모리 예산을 검사하고 있습니다.", "Checking GLB integrity and the memory budget…"));
      const { renderCharacterGlb } = await import("./conversion-renderer"); signal.throwIfAborted();
      const result = await renderCharacterGlb(model, QUALITY_PROFILES[settings.quality].size, fourViews ? CHARACTER_VIEWS : ["front"], camera, signal, (view) => setStatus(bt(`${VIEW_LABELS[view]} 렌더 패스를 만들고 있습니다.`, `Building the ${VIEW_LABELS_EN[view]} render passes…`)));
      signal.throwIfAborted(); setRenders(result.renders); setModelSha(result.sha256);
    }
    setStatus(bt("준비 완료 · AI 추론은 아직 실행하지 않았습니다.", "Ready — AI inference has not run yet."));
  }
  async function exportKit(signal: AbortSignal) {
    setStatus(bt("원화·렌더·설정·실행기를 하나의 키트로 묶고 있습니다.", "Packing artwork, renders, settings, and the runner into one kit…"));
    const bytes = await buildCharacterKit({ kind, engine, settings, images, renders, modelSha256: modelSha, camera: kind === "image" ? camera : undefined }, signal);
    signal.throwIfAborted(); downloadConversion(bytes, "toonstudio-character-ai-kit.zip", "application/zip");
    setStatus(bt("AI 실행 키트 저장 완료 · README의 사전 검사 후 로컬에서 추론을 실행해 주세요.", "AI kit saved — run inference locally after the README pre-checks."));
  }
  const ready = kind === "shape" ? images.length > 0 : renders.length > 0;
  return <section aria-labelledby="character-conversion-title" className="studio-character-conversion min-h-dvh bg-bg px-4 py-8 text-fg sm:px-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl min-w-0 flex-1"><p className="text-xs font-semibold tracking-widest text-fg-3">TOONSTUDIO · CHARACTER LAB</p>
          <h1 id="character-conversion-title" className="mt-2 text-3xl font-bold">{bt("캐릭터 2D ↔ 3D", "Character 2D ↔ 3D")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-fg-2">{bt("원화의 실루엣과 3D 모델의 구도를 준비하고, 로컬 AI 실행 키트로 변환합니다. 브라우저 렌더는 바로 사용할 수 있으며, AI 추론에는 별도 모델·실행 환경이 필요합니다.", "Prepare original-art silhouettes and 3D model compositions, then convert with a local AI kit. Browser renders are ready to use; AI inference needs a separate model and runtime.")}</p>
        </div>
        <div className="hidden w-52 shrink-0 self-center xl:block" aria-hidden="true">
          <SectionArt image="studio-lobby" className="aspect-[16/10] w-full rounded-2xl border border-line object-cover" />
        </div>
        <nav aria-label={bt("관련 스튜디오 도구", "Related studio tools")} className="flex flex-wrap gap-2"><Link className={BUTTON} to="/studio/lift3d">{bt("설치 없이 기하 입체화", "Lift 2D to 3D, no install")}</Link><Link className={BUTTON} to="/studio">{bt("스튜디오로", "To Studio")}</Link></nav>
      </header>
      <div role="group" aria-label={bt("변환 방향", "Conversion direction")} className="flex flex-wrap gap-2">
        {([["shape", bt("2D 원화 → AI 3D", "2D art → AI 3D")], ["image", bt("3D 모델 → 2D / AI 일러스트", "3D model → 2D / AI illustration")]] as const).map(([value, label]) => <button key={value} type="button" disabled={busy} aria-pressed={kind === value} className={BUTTON} onClick={() => { setKind(value); reset(); }}>{label}</button>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-[23rem_1fr]">
        <fieldset disabled={busy} className="space-y-4"><legend className="sr-only">{bt("변환 입력과 설정", "Conversion input and settings")}</legend>
          <div className={CARD}><h2 className="mb-4 font-semibold">{bt("1. 원본 준비", "1. Prepare the source")}</h2>
            {kind === "shape" ? <div className="space-y-4">
              <label className="block text-sm">{bt("AI 엔진", "AI engine")}<select className={FIELD} value={engine} onChange={(event) => { setEngine(event.target.value as ShapeEngine); reset(); }}><option value="triposr">{bt("TripoSR · 정면 1장 · MIT", "TripoSR · front view only · MIT")}</option><option value="trellis">{bt("TRELLIS · 1~4장 · MIT · CUDA 필요", "TRELLIS · 1–4 views · MIT · CUDA required")}</option></select></label>
              {(engine === "triposr" ? ["front" as const] : CHARACTER_VIEWS).map((view) => <ConversionFilePicker key={view}
                label={`${bt(VIEW_LABELS[view], VIEW_LABELS_EN[view])} ${bt("원화", "artwork")} ${view === "front" ? bt("(필수)", "(required)") : bt("(선택)", "(optional)")}`}
                accept="image/png,image/jpeg,image/webp" fileName={files[view]?.name}
                hint={bt("PNG · JPEG · WebP / 최대 16MiB", "PNG · JPEG · WebP / up to 16MiB")}
                onFile={(file) => { setFiles((previous) => ({ ...previous, [view]: file })); reset(); }} />)}
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={crop} onChange={(event) => { setCrop(event.target.checked); reset(); }} />{bt("투명 영역을 정리하고 10% 여백 보존", "Trim transparent areas and keep a 10% margin")}</label>
              <p className="text-xs leading-relaxed text-fg-3">{bt("실제 다른 시점 원화를 사용해 주세요. TripoSR은 정면 한 장만 사용하며, 불투명 배경은 자동으로 제거하지 않습니다.", "Use real artwork for each view. TripoSR only uses the front view and does not remove opaque backgrounds automatically.")}</p>
            </div> : <div className="space-y-4">
              <ConversionFilePicker label={bt("캐릭터 GLB", "Character GLB")} accept=".glb,model/gltf-binary" fileName={model?.name}
                hint={bt("최대 64MiB. 텍스처를 내장한 GLB 2.0을 사용해 주세요. 외부 참조·미지원 압축은 차단합니다.", "Up to 64MiB. Use GLB 2.0 with embedded textures. External references and unsupported compression are rejected.")}
                onFile={(file) => { setModel(file); reset(); }} />
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={fourViews} onChange={(event) => { setFourViews(event.target.checked); reset(); }} />{bt("정면·좌·후면·우 4방향 만들기", "Build front, left, back, and right views")}</label>
              <label className="block text-sm">{bt("기준 회전", "Base rotation")} {camera.yaw}°<input className="mt-2 w-full" type="range" min={-180} max={180} step={5} value={camera.yaw} onChange={(event) => { setCamera({ ...camera, yaw: Number(event.target.value) }); reset(); }} /></label>
              <label className="block text-sm">{bt("카메라 높이", "Camera height")} {camera.pitch}°<input className="mt-2 w-full" type="range" min={-60} max={60} step={5} value={camera.pitch} onChange={(event) => { setCamera({ ...camera, pitch: Number(event.target.value) }); reset(); }} /></label>
              <label className="block text-sm">{bt("첫 애니메이션 시점 (초, 0은 기본 포즈)", "First animation frame (seconds, 0 = default pose)")}<input className={FIELD} type="number" min={0} max={60} step={0.1} value={camera.animationTime} onChange={(event) => { setCamera({ ...camera, animationTime: Number(event.target.value) }); reset(); }} /></label>
            </div>}
          </div>
          <div className={CARD}><h2 className="mb-4 font-semibold">{bt("2. 품질과 AI 설정", "2. Quality and AI settings")}</h2><div className="space-y-4">
            <label className="block text-sm">{bt("품질", "Quality")}<select className={FIELD} value={settings.quality} onChange={(event) => updateSettings({ quality: event.target.value as ConversionSettings["quality"] })}>{Object.entries(QUALITY_PROFILES).map(([key, value]) => <option key={key} value={key}>{bt(value.label, QUALITY_PROFILE_LABELS_EN[key as keyof typeof QUALITY_PROFILE_LABELS_EN])} · {value.size}px</option>)}</select></label>
            <label className="block text-sm">{bt("고정 시드", "Fixed seed")}<input className={FIELD} type="number" min={0} max={2147483647} step={1} value={settings.seed} onChange={(event) => updateSettings({ seed: Number(event.target.value) })} /></label>
            {kind === "image" ? <>
              <label className="block text-sm">{bt("AI 그림 스타일", "AI illustration style")}<select className={FIELD} value={settings.style} onChange={(event) => updateSettings({ style: event.target.value as ConversionSettings["style"] })}>{Object.entries(CONVERSION_STYLES).map(([key, value]) => <option key={key} value={key}>{bt(value.label, CONVERSION_STYLE_LABELS_EN[key as keyof typeof CONVERSION_STYLE_LABELS_EN])}</option>)}</select></label>
              <label className="block text-sm">{bt("재해석 강도", "Reinterpretation strength")} {settings.strength.toFixed(2)}<input type="range" min={0.15} max={0.75} step={0.05} className="mt-2 w-full" value={settings.strength} onChange={(event) => updateSettings({ strength: Number(event.target.value) })} /></label>
              <p className="text-xs leading-relaxed text-fg-3">{bt("낮은 강도부터 원본과 비교해 주세요. 높은 강도는 얼굴·의상·실루엣을 바꿀 수 있습니다.", "Start low and compare against the original. High strength can change the face, clothes, and silhouette.")}</p>
              <label className="block text-sm">{bt("추가 지시", "Extra instructions")}<textarea className={FIELD} rows={3} maxLength={1200} value={settings.prompt} onChange={(event) => updateSettings({ prompt: event.target.value })} /></label>
              <label className="block text-sm">{bt("제외할 요소", "Elements to exclude")}<textarea className={FIELD} rows={2} maxLength={800} value={settings.negative} onChange={(event) => updateSettings({ negative: event.target.value })} /></label>
              <label className="block text-sm">{bt("설치된 SDXL 체크포인트", "Installed SDXL checkpoint")}<input className={FIELD} value={settings.checkpoint} onChange={(event) => updateSettings({ checkpoint: event.target.value })} spellCheck={false} /></label>
              <label className="block text-sm">{bt("SDXL용 depth ControlNet 파일 (선택)", "Depth ControlNet file for SDXL (optional)")}<input className={FIELD} value={settings.controlNet} onChange={(event) => updateSettings({ controlNet: event.target.value })} placeholder={bt("설치한 .safetensors 파일 이름", "Installed .safetensors file name")} spellCheck={false} /></label>
              {settings.controlNet ? <label className="block text-sm">{bt("깊이 제어", "Depth control")} {settings.controlStrength.toFixed(1)}<input className="mt-2 w-full" type="range" min={0} max={1.5} step={0.1} value={settings.controlStrength} onChange={(event) => updateSettings({ controlStrength: Number(event.target.value) })} /></label> : null}
            </> : <p className="text-xs leading-relaxed text-fg-3">{bt("생성한 뒷면·손가락·의상은 검수가 필요합니다. TripoSR은 vertex-color GLB, TRELLIS는 텍스처 GLB를 내보냅니다. 자동 리깅은 제공하지 않습니다.", "Generated backs, fingers, and clothes need review. TripoSR exports vertex-color GLB; TRELLIS exports textured GLB. Automatic rigging is not provided.")}</p>}
          </div></div>
        </fieldset>
        <div className="space-y-4">
          <section className={CARD}><h2 className="font-semibold">{bt("3. 미리보기와 실행 준비", "3. Preview and run")}</h2>
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={BUTTON} disabled={busy} onClick={() => { void perform(prepare); }}>{kind === "shape" ? bt("원화 준비", "Prepare artwork") : bt("로컬 렌더 만들기", "Render locally")}</button><button type="button" className={BUTTON} disabled={busy || !ready || Boolean(error)} onClick={() => { void perform(exportKit); }}>{bt("AI 실행 키트 저장", "Save AI kit")}</button>{busy ? <button type="button" className={BUTTON} onClick={() => { active.current?.abort(); setStatus(bt("안전하게 취소하고 있습니다.", "Cancelling safely…")); }}>{bt("취소", "Cancel")}</button> : null}</div>
            <p role="status" aria-live="polite" className="mt-4 text-sm text-fg-2">{status}</p>
            {error ? <p role="alert" className="mt-3 rounded-lg bg-bg p-3 text-sm">{error}</p> : null}
          </section>
          {kind === "shape" && images.length > 0 ? <section className={CARD}><h3 className="mb-4 font-semibold">{bt("비율과 여백을 보존한 입력", "Aspect-ratio-safe inputs")}</h3>
            <div className="grid grid-cols-2 gap-4">{images.map((image) => <figure key={image.view}><PreviewPng bytes={image.png} label={bt(`${VIEW_LABELS[image.view]} AI 입력 원화`, `${VIEW_LABELS_EN[image.view]} AI input artwork`)} /><figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">{bt(VIEW_LABELS[image.view], VIEW_LABELS_EN[image.view])} · {image.width}px<button type="button" className={BUTTON} onClick={() => downloadConversion(image.png, `character-${image.view}.png`, "image/png")}>{bt("PNG 저장", "Save PNG")}</button></figcaption></figure>)}</div>
            {Array.from(new Set(images.flatMap((image) => image.notices))).map((notice) => <p key={notice} className="mt-3 text-xs leading-relaxed text-fg-3">{notice}</p>)}
          </section> : null}
          {kind === "image" && renders.length > 0 ? <section className={CARD}><h3 className="font-semibold">{bt("브라우저 렌더 · AI 생성 결과 아님", "Browser render — not AI output")}</h3>
            <div role="group" aria-label={bt("렌더 패스", "Render passes")} className="my-4 flex flex-wrap gap-2">{(Object.keys(PASS_LABELS) as RenderPass[]).map((value) => <button key={value} type="button" className={BUTTON} aria-pressed={pass === value} onClick={() => setPass(value)}>{bt(PASS_LABELS[value], PASS_LABELS_EN[value])}</button>)}</div>
            <div className="grid gap-4 sm:grid-cols-2">{renders.map((render) => <figure key={render.view}><PreviewPng bytes={render.passes[pass]} label={bt(`${VIEW_LABELS[render.view]} ${PASS_LABELS[pass]}`, `${VIEW_LABELS_EN[render.view]} ${PASS_LABELS_EN[pass]}`)} /><figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">{bt(VIEW_LABELS[render.view], VIEW_LABELS_EN[render.view])}<button type="button" className={BUTTON} onClick={() => downloadConversion(render.passes[pass], `character-${render.view}-${pass}.png`, "image/png")}>{bt("PNG 저장", "Save PNG")}</button></figcaption></figure>)}</div>
            <p className="mt-4 text-xs leading-relaxed text-fg-3">{bt("깊이는 가까울수록 흰색입니다. 원본 재질·셀 채색·법선·선화 PNG는 투명도를 보존합니다. AI 입력은 흰 배경으로 합성하며 모든 패스를 키트에 포함합니다.", "Depth is whiter when closer. Base-color, cel, normal, and line-art PNGs preserve transparency. AI inputs are composited on white; every pass ships in the kit.")}</p>
          </section> : null}
          {!ready && !busy ? <Studio3dIllustration compact /> : null}
          <aside className={CARD} aria-labelledby="character-local-ai-guide"><h3 id="character-local-ai-guide" className="font-semibold">{bt("로컬 AI 실행 안내", "Local AI run guide")}</h3>
            <p className="mt-3 text-sm leading-relaxed text-fg-2">{bt("키트의 README에 따라 공식 모델 환경을 준비한 뒤, 먼저 사전 검사를 실행합니다. 원화·모델은 이 화면에서 서버로 업로드하지 않습니다. 유료 API 호출과 자동 모델 설치는 없습니다.", "Set up the official model environment from the kit's README, then run the pre-checks first. Artwork and models never leave this screen for a server. No paid API calls or automatic model installs.")}</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-bg p-3 text-xs"><code>python3 run-character-ai.py . --check</code></pre>
            <p className="mt-3 text-xs leading-relaxed text-fg-3">{bt("TripoSR은 공식 Python 환경, TRELLIS는 Linux/CUDA 환경, 3D→2D AI는 SDXL 모델이 설치된 로컬 ComfyUI가 필요합니다. 체크포인트·보조 모델의 라이선스와 장비 요구사항을 확인해 주세요. 실제 추론 성공은 실행 후 receipt.json에 기록됩니다.", "TripoSR needs the official Python environment, TRELLIS needs Linux/CUDA, and 3D→2D AI needs a local ComfyUI with SDXL models installed. Check checkpoint and auxiliary-model licenses and hardware requirements. Successful inference is recorded to receipt.json after the run.")}</p>
            <p className="mt-3 text-xs leading-relaxed text-fg-3">{bt("권한이 있는 원화·모델만 사용해 주세요. 생성한 GLB는 3D→2D 탭에서 다시 확인할 수 있습니다. 외형·뒷면·얼굴 일치와 자동 리깅은 보장하지 않습니다.", "Only use artwork and models you have rights to. Generated GLBs can be re-checked in the 3D→2D tab. Appearance, back-view, and face consistency plus automatic rigging are not guaranteed.")}</p>
          </aside>
        </div>
      </div>
    </div>
  </section>;
}
