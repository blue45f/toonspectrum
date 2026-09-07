import {
  Download,
  Gauge,
  Layers,
  PenLine,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { createCharacterExportPreflight, formatCharacterBytes } from "../export/character-export-preflight";
import { STUDIO_FOCUS_RING } from "../../studio-panel-ui";
import { useCharacterPlatformWorkbench } from "./use-character-platform-workbench";

import type { CharacterSlotKind } from "../../character-shaper/character-shaper-contract";
import type { CharacterShaperBinding } from "../../character-shaper/character-shaper-ui-contract";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";
import type { CharacterPoseRegion } from "../pose/character-pose-v2";
import type { ChangeEvent, ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

type WorkbenchTab = "quality" | "presets" | "pose" | "ink" | "render";
type ImportTarget = "manifest" | "presets" | "ink";

const BUTTON = cn(
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-[0.72rem] font-semibold text-fg-2",
  "transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
  STUDIO_FOCUS_RING,
);
const PRIMARY_BUTTON = cn(
  BUTTON,
  "border-accent/60 bg-accent text-on-accent hover:bg-accent-2 hover:text-on-accent",
);
const ICON_BUTTON = cn(
  "grid size-11 place-items-center rounded-xl border border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
  STUDIO_FOCUS_RING,
);

const TABS: readonly { readonly id: WorkbenchTab; readonly label: string; readonly icon: typeof ShieldCheck }[] = [
  { id: "quality", label: "품질", icon: ShieldCheck },
  { id: "presets", label: "프리셋", icon: Save },
  { id: "pose", label: "Pose 2.0", icon: WandSparkles },
  { id: "ink", label: "3D 펜선", icon: PenLine },
  { id: "render", label: "렌더", icon: Layers },
];

const POSE_REGIONS: readonly { readonly id: CharacterPoseRegion; readonly label: string }[] = [
  { id: "head", label: "머리" },
  { id: "torso", label: "몸통" },
  { id: "left-arm", label: "왼팔" },
  { id: "right-arm", label: "오른팔" },
  { id: "left-leg", label: "왼다리" },
  { id: "right-leg", label: "오른다리" },
  { id: "left-hand", label: "왼손" },
  { id: "right-hand", label: "오른손" },
];

function Section({ title, description, children }: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card/70 p-3">
      <h3 className="text-sm font-bold text-fg">{title}</h3>
      {description ? <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">{description}</p> : null}
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function downloadText(text: string, fileName: string): boolean {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return false;
  const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

async function readTextFile(file: File, maximumBytes: number): Promise<string> {
  if (file.size > maximumBytes) throw new Error(`파일은 ${Math.round(maximumBytes / 1024)} KiB 이하여야 합니다.`);
  return file.text();
}

function featureTone(status: "supported" | "partial" | "unsupported" | "unknown"): string {
  if (status === "supported") return "border-good/40 bg-good/10 text-good";
  if (status === "partial") return "border-warn/45 bg-warn/10 text-warn";
  if (status === "unsupported") return "border-bad/45 bg-bad/10 text-bad";
  return "border-line bg-raised text-fg-3";
}

function passTone(status: "available" | "conditional" | "unavailable"): string {
  if (status === "available") return "text-good";
  if (status === "conditional") return "text-warn";
  return "text-bad";
}

function hasSlotSelection(binding: CharacterShaperBinding, slot: CharacterSlotKind): boolean {
  const value = binding.recipe.slots[slot];
  return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.length > 0;
}

export function CharacterPlatformWorkbench({ h, binding }: {
  readonly h: StudioVrmPoserHost;
  readonly binding: CharacterShaperBinding;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<WorkbenchTab>("quality");
  const [importTarget, setImportTarget] = useState<ImportTarget>("manifest");
  const [presetSlot, setPresetSlot] = useState<CharacterSlotKind>("eyes");
  const [presetName, setPresetName] = useState("");
  const workbench = useCharacterPlatformWorkbench(h, binding);

  const captureCanvas = h.captureRef?.current?.gl?.domElement as HTMLCanvasElement | undefined;
  const exportSize = useMemo(() => ({
    width: Math.max(1, Math.round(captureCanvas?.width || 2048)),
    height: Math.max(1, Math.round(captureCanvas?.height || 2048)),
  }), [captureCanvas?.height, captureCanvas?.width]);
  const psdPreflight = useMemo(() => createCharacterExportPreflight({
    format: "psd",
    width: exportSize.width,
    height: exportSize.height,
    transparent: Boolean(h.transparentBackground),
    profile: binding.profile,
    compatibility: workbench.compatibility,
    hasSurfacePaint: Boolean(h.texturePaintCanUndo || h.texturePaintHasContent || h.texturePaintDirty),
    canonical: workbench.canonicalManifest !== null,
  }), [binding.profile, exportSize.height, exportSize.width, h.texturePaintCanUndo, h.texturePaintDirty, h.texturePaintHasContent, h.transparentBackground, workbench.canonicalManifest, workbench.compatibility]);

  const close = () => {
    workbench.surfaceInk.setActive(false);
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus({ preventScroll: true }), 0);
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  const requestImport = (target: ImportTarget) => {
    setImportTarget(target);
    fileInputRef.current?.click();
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    void (async () => {
      try {
        const maximum = importTarget === "manifest" ? 512 * 1024 : 4 * 1024 * 1024;
        const text = await readTextFile(file, maximum);
        if (importTarget === "manifest") workbench.importCanonicalManifest(text);
        else if (importTarget === "presets") workbench.importPresets(text);
        else workbench.surfaceInk.importJson(text);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "파일을 읽지 못했습니다.");
      }
    })();
  };

  const savePreset = () => {
    const name = presetName.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (!name) return;
    if (workbench.saveSlotPreset(presetSlot, name)) setPresetName("");
  };

  const qualityPanel = (
    <div className="space-y-3">
      <Section title={`${workbench.compatibility.label} · ${workbench.modelId}`} description={workbench.compatibility.summary}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-good/10 p-2"><strong className="block text-base text-good">{workbench.compatibility.supportedCount}</strong><span className="text-[0.64rem] text-fg-3">지원</span></div>
          <div className="rounded-xl bg-warn/10 p-2"><strong className="block text-base text-warn">{workbench.compatibility.partialCount}</strong><span className="text-[0.64rem] text-fg-3">일부</span></div>
          <div className="rounded-xl bg-bad/10 p-2"><strong className="block text-base text-bad">{workbench.compatibility.unsupportedCount}</strong><span className="text-[0.64rem] text-fg-3">미지원</span></div>
        </div>
        <ul className="space-y-1.5">
          {workbench.compatibility.features.map((feature) => (
            <li key={feature.id} className="rounded-xl border border-line bg-panel/70 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.72rem] font-semibold text-fg">{feature.label}</span>
                <span className={cn("rounded-full border px-1.5 py-0.5 text-[0.6rem] font-bold", featureTone(feature.status))}>{feature.status}</span>
              </div>
              <p className="mt-1 text-[0.64rem] leading-relaxed text-fg-3">{feature.reason}</p>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Canonical Character" description="검증된 토폴로지·리그·시맨틱 파츠·렌더 패스 계약을 현재 모델에 연결합니다.">
        {workbench.canonicalManifest ? (
          <div className="rounded-xl border border-good/40 bg-good/10 p-2.5 text-[0.7rem] text-good">
            <strong>{workbench.canonicalManifest.identity.topologyFamily}</strong>
            <span className="ml-2">v{workbench.canonicalManifest.identity.version}</span>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-2.5 text-[0.68rem] text-fg-3">현재 모델은 검증 가능한 호환 모드로 동작합니다.</p>
        )}
        {workbench.canonicalError ? <p role="alert" className="text-[0.66rem] text-bad">{workbench.canonicalError}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON} onClick={() => requestImport("manifest")}><Upload size={14} aria-hidden />매니페스트 연결</button>
          <button type="button" className={BUTTON} disabled={!workbench.canonicalManifest} onClick={() => {
            const json = workbench.exportCanonicalManifest();
            if (json) downloadText(json, `${workbench.modelId}-character-manifest.json`);
          }}><Download size={14} aria-hidden />내보내기</button>
          <button type="button" className={BUTTON} disabled={!workbench.canonicalManifest} onClick={workbench.removeCanonicalManifest}><Trash2 size={14} aria-hidden />연결 해제</button>
        </div>
      </Section>
    </div>
  );

  const presetsPanel = (
    <div className="space-y-3">
      <Section title="파츠 프리셋 저장" description="눈·입·헤어·의상·표정·포즈를 현재 모델과 분리해 다시 사용할 수 있습니다.">
        <label className="block text-[0.68rem] font-semibold text-fg-2">파츠
          <select value={presetSlot} onChange={(event) => setPresetSlot(event.currentTarget.value as CharacterSlotKind)} className={cn("mt-1 h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm", STUDIO_FOCUS_RING)}>
            {binding.catalog.slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
          </select>
        </label>
        <label className="block text-[0.68rem] font-semibold text-fg-2">이름
          <input value={presetName} maxLength={60} onChange={(event) => setPresetName(event.currentTarget.value)} placeholder="예: 차가운 고양이 눈" className={cn("mt-1 h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm", STUDIO_FOCUS_RING)} />
        </label>
        <button type="button" className={PRIMARY_BUTTON} disabled={!presetName.trim() || !hasSlotSelection(binding, presetSlot)} onClick={savePreset}><Save size={14} aria-hidden />현재 파츠 저장</button>
      </Section>
      <Section title={`내 프리셋 · ${workbench.presets.length}개`}>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON} onClick={() => requestImport("presets")}><Upload size={14} aria-hidden />불러오기</button>
          <button type="button" className={BUTTON} disabled={workbench.presets.length === 0} onClick={() => downloadText(workbench.exportPresets(), "toonstudio-character-presets.json")}><Download size={14} aria-hidden />백업</button>
        </div>
        {workbench.presetStoreMessage ? <p role="alert" className="text-[0.66rem] text-bad">{workbench.presetStoreMessage}</p> : null}
        {workbench.presets.length === 0 ? <p className="text-[0.68rem] text-fg-3">저장한 프리셋이 없습니다.</p> : (
          <ul className="space-y-2">
            {workbench.presets.map((preset) => (
              <li key={preset.presetId} className="flex items-center gap-2 rounded-xl border border-line bg-panel/70 p-2">
                <div className="min-w-0 flex-1"><p className="truncate text-[0.72rem] font-bold text-fg">{preset.name}</p><p className="text-[0.62rem] text-fg-3">{preset.payload.slot ?? preset.kind} · v{preset.version}</p></div>
                <button type="button" className={BUTTON} onClick={() => workbench.applyPreset(preset)}>적용</button>
                <button type="button" aria-label={`${preset.name} 삭제`} className={ICON_BUTTON} onClick={() => workbench.removePreset(preset.presetId)}><Trash2 size={14} aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );

  const posePanel = (
    <div className="space-y-3">
      <Section title="Pose 2.0 안정화" description="현재 포즈를 Quaternion으로 정규화하고 선택 영역, 관절 한계, 신뢰도, 접지 후보를 적용합니다.">
        <div role="group" aria-label="Pose 2.0 적용 부위" className="grid grid-cols-2 gap-2">
          {POSE_REGIONS.map((region) => {
            const checked = workbench.selectedPoseRegions.includes(region.id);
            return <button key={region.id} type="button" role="switch" aria-checked={checked} onClick={() => workbench.setSelectedPoseRegions(checked ? workbench.selectedPoseRegions.filter((item) => item !== region.id) : [...workbench.selectedPoseRegions, region.id])} className={cn(BUTTON, "justify-between", checked && "border-accent/50 bg-accent-soft text-accent")}><span>{region.label}</span><span aria-hidden>{checked ? "✓" : "—"}</span></button>;
          })}
        </div>
        <button type="button" className={PRIMARY_BUTTON} disabled={workbench.selectedPoseRegions.length === 0 || h.status !== "ready"} onClick={workbench.stabilizeCurrentPose}><WandSparkles size={14} aria-hidden />현재 포즈 안정화</button>
        <p className="text-[0.64rem] leading-relaxed text-fg-3">사진 포즈와 웹캠 후보는 기존 입력 도구에서 먼저 적용한 뒤 이 단계로 관절과 접지를 보정할 수 있습니다.</p>
      </Section>
      <Section title="Solver 계약">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[0.68rem]">
          <dt className="font-semibold text-fg-2">회전</dt><dd className="text-fg-3">Quaternion 정규화·Slerp</dd>
          <dt className="font-semibold text-fg-2">부분 적용</dt><dd className="text-fg-3">선택하지 않은 본 완전 유지</dd>
          <dt className="font-semibold text-fg-2">관절</dt><dd className="text-fg-3">팔꿈치·무릎·목 Swing 제한</dd>
          <dt className="font-semibold text-fg-2">접지</dt><dd className="text-fg-3">발 위치 기준 Root 오프셋 계산</dd>
          <dt className="font-semibold text-fg-2">접촉</dt><dd className="text-fg-3">손·소품 접점 오차 진단</dd>
        </dl>
      </Section>
    </div>
  );

  const inkPanel = (
    <div className="space-y-3">
      <Section title={`3D 펜선 · ${workbench.surfaceInk.strokeCount}획`} description="UV 픽셀이 아니라 배리센트릭 표면점과 스킨 웨이트를 가진 실제 리본 메시를 생성합니다.">
        <button type="button" role="switch" aria-checked={workbench.surfaceInk.active} onClick={() => workbench.surfaceInk.setActive(!workbench.surfaceInk.active)} className={cn(PRIMARY_BUTTON, workbench.surfaceInk.active && "bg-good text-on-accent hover:bg-good")}><PenLine size={14} aria-hidden />{workbench.surfaceInk.active ? "그리기 종료" : "뷰포트에 그리기"}</button>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel/70 px-3 py-2 text-[0.68rem] font-semibold text-fg-2">선 색
          <input type="color" value={workbench.surfaceInk.style.color} aria-label="3D 펜선 색" onChange={(event) => workbench.surfaceInk.setStyle({ color: event.currentTarget.value })} className="size-9 rounded-lg border border-line bg-card p-0.5" />
        </label>
        <label className="block text-[0.68rem] font-semibold text-fg-2">선 굵기 · {(workbench.surfaceInk.style.baseWidth * 1000).toFixed(1)}mm
          <input type="range" min="0.002" max="0.03" step="0.001" value={workbench.surfaceInk.style.baseWidth} onChange={(event) => workbench.surfaceInk.setStyle({ baseWidth: Number(event.currentTarget.value) })} className="h-11 w-full" />
        </label>
        <label className="block text-[0.68rem] font-semibold text-fg-2">불투명도 · {Math.round(workbench.surfaceInk.style.opacity * 100)}%
          <input type="range" min="0.1" max="1" step="0.05" value={workbench.surfaceInk.style.opacity} onChange={(event) => workbench.surfaceInk.setStyle({ opacity: Number(event.currentTarget.value) })} className="h-11 w-full" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" className={BUTTON} disabled={!workbench.surfaceInk.canUndo} onClick={workbench.surfaceInk.undo}>실행 취소</button>
          <button type="button" className={BUTTON} disabled={!workbench.surfaceInk.canRedo} onClick={workbench.surfaceInk.redo}>다시 실행</button>
          <button type="button" className={BUTTON} disabled={workbench.surfaceInk.strokeCount === 0} onClick={workbench.surfaceInk.clear}>전체 지우기</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON} onClick={() => requestImport("ink")}><Upload size={14} aria-hidden />불러오기</button>
          <button type="button" className={BUTTON} disabled={workbench.surfaceInk.strokeCount === 0} onClick={() => downloadText(workbench.surfaceInk.exportJson(), `${workbench.modelId}-surface-ink.json`)}><Download size={14} aria-hidden />백업</button>
        </div>
        {workbench.surfaceInk.notice ? <p role="status" className="text-[0.66rem] leading-relaxed text-accent">{workbench.surfaceInk.notice}</p> : null}
      </Section>
      <Section title="동작 방식">
        <p className="text-[0.68rem] leading-relaxed text-fg-3">선은 Hit Triangle의 배리센트릭 좌표와 보간된 Skin Weight를 저장합니다. 포즈는 GPU Skinning으로 따라가며, 토폴로지가 달라지면 원본 획을 지우지 않고 재투영 필요 상태로 보존합니다.</p>
      </Section>
    </div>
  );

  const renderPanel = (
    <div className="space-y-3">
      <Section title={`${workbench.renderGraph.mode === "canonical" ? "Canonical" : "Compatibility"} Render Graph`} description={`${workbench.renderGraph.enabled.length}개 패스가 현재 작업에 활성화됩니다.`}>
        <ul className="space-y-1.5">
          {workbench.renderGraph.passes.map((pass) => (
            <li key={pass.id} className="rounded-xl border border-line bg-panel/70 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2"><span className="text-[0.7rem] font-semibold text-fg">{pass.label}</span><span className={cn("text-[0.62rem] font-bold", passTone(pass.availability))}>{pass.availability}</span></div>
              {pass.reason ? <p className="mt-1 text-[0.62rem] leading-relaxed text-fg-3">{pass.reason}</p> : null}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="PSD 출력 Preflight" description={`${psdPreflight.width}×${psdPreflight.height} · ${psdPreflight.strategy === "tile-worker" ? "타일 Worker" : "직접 처리"}`}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-good/10 p-2"><strong className="block text-good">{psdPreflight.plannedCount}</strong><span className="text-[0.62rem] text-fg-3">생성</span></div>
          <div className="rounded-xl bg-warn/10 p-2"><strong className="block text-warn">{psdPreflight.conditionalCount}</strong><span className="text-[0.62rem] text-fg-3">조건부</span></div>
          <div className="rounded-xl bg-bad/10 p-2"><strong className="block text-bad">{psdPreflight.skippedCount}</strong><span className="text-[0.62rem] text-fg-3">생략</span></div>
        </div>
        <p className="text-[0.68rem] text-fg-3">예상 작업 메모리 {formatCharacterBytes(psdPreflight.estimatedResidentBytes)}</p>
        {psdPreflight.warnings.map((warning) => <p key={warning.code} className="rounded-lg border border-warn/35 bg-warn/10 p-2 text-[0.64rem] text-warn">{warning.message}</p>)}
        <p className="text-[0.64rem] leading-relaxed text-fg-3">실제 PNG·PSD 파일 생성은 아래 기존 내보내기 버튼에서 동일한 카메라·문서 상태를 사용합니다.</p>
      </Section>
    </div>
  );

  const panel = open ? createPortal(
    <>
      <div aria-hidden className="fixed inset-0 z-[94] bg-black/25" onPointerDown={close} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} className="fixed inset-y-2 right-2 z-[95] flex w-[min(31rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_24px_80px_oklch(0.04_0.01_70/0.65)] outline-none">
        <header className="flex items-center gap-3 border-b border-line px-3 py-2.5">
          <div className="min-w-0 flex-1"><p className="text-[0.62rem] font-bold tracking-wide text-accent">CHARACTER PLATFORM V2</p><h2 id={titleId} className="truncate text-base font-bold text-fg">캐릭터 품질 워크벤치</h2><p id={descriptionId} className="sr-only">공식 캐릭터, 파츠 프리셋, Pose 2.0, 3D 펜선, 렌더 패스를 관리합니다.</p></div>
          <button type="button" aria-label="캐릭터 품질 워크벤치 닫기" className={ICON_BUTTON} onClick={close}><X size={17} aria-hidden /></button>
        </header>
        <div role="tablist" aria-label="캐릭터 품질 기능" className="grid grid-cols-5 gap-1 border-b border-line px-2 py-2">
          {TABS.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={cn("flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.62rem] font-semibold", STUDIO_FOCUS_RING, tab === item.id ? "bg-accent-soft text-accent" : "text-fg-3 hover:bg-raised hover:text-fg")}><Icon size={15} aria-hidden /><span className="truncate">{item.label}</span></button>;
          })}
        </div>
        <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {tab === "quality" ? qualityPanel : tab === "presets" ? presetsPanel : tab === "pose" ? posePanel : tab === "ink" ? inkPanel : renderPanel}
        </div>
        {workbench.notice ? <p role="status" className="border-t border-line bg-card px-3 py-2 text-[0.68rem] font-semibold text-accent">{workbench.notice}</p> : null}
        <input ref={fileInputRef} type="file" accept="application/json,.json" tabIndex={-1} aria-label="캐릭터 품질 데이터 파일 선택" className="sr-only" onChange={onFileChange} />
      </div>
    </>,
    document.body,
  ) : null;

  return (
    <>
      <button ref={triggerRef} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className={cn("fixed bottom-20 right-4 z-[90] inline-flex min-h-11 items-center gap-2 rounded-full border border-accent/55 bg-panel/95 px-4 text-[0.72rem] font-bold text-accent shadow-lg backdrop-blur hover:bg-accent-soft", STUDIO_FOCUS_RING)}>
        <Gauge size={16} aria-hidden />
        품질 도구
        <span className="rounded-full bg-accent px-1.5 py-0.5 text-[0.58rem] text-on-accent">V2</span>
      </button>
      {panel}
    </>
  );
}
