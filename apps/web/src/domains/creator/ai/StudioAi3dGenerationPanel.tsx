import { useEffect, useMemo, useRef, useState } from "react";

import {
  Studio3dGenerationHttpClient,
  studioFileToGenerationInput,
  type Studio3dGenerationCreateInput,
  type Studio3dGenerationJob,
  type Studio3dGenerationMode,
} from "./studio-3d-generation-client";

const TERMINAL = new Set(["ready", "failed", "cancelled", "expired"]);

const MODE_LABELS: Readonly<Record<Studio3dGenerationMode, string>> = Object.freeze({
  "text-to-3d": "텍스트 → 3D",
  "image-to-3d": "이미지 → 3D",
  "multiview-to-3d": "멀티뷰 → 3D",
  "texture-only": "모델 재질 생성",
});

const STATE_LABELS: Readonly<Record<Studio3dGenerationJob["state"], string>> = Object.freeze({
  queued: "대기 중",
  uploading: "입력 전송 중",
  "generating-geometry": "형상 생성 중",
  "generating-texture": "재질 생성 중",
  downloading: "결과 수집 중",
  validating: "안전성 검증 중",
  importing: "내부 자산 등록 중",
  ready: "사용 준비 완료",
  failed: "생성 실패",
  cancelled: "취소됨",
  expired: "기한 만료",
});

export interface StudioAi3dGenerationPanelProps {
  readonly client: Studio3dGenerationHttpClient;
  readonly onInsertArtifact?: (job: Studio3dGenerationJob, blob: Blob) => Promise<void> | void;
  readonly onSaveArtifact?: (job: Studio3dGenerationJob, blob: Blob) => Promise<void> | void;
  readonly onOpenTextureEditor?: (job: Studio3dGenerationJob, blob: Blob) => Promise<void> | void;
  readonly className?: string;
}

function uniqueRequestKey(): string {
  return `studio-3d-${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]?.toString(36) ?? "0"}`;
}

export function StudioAi3dGenerationPanel({
  client,
  onInsertArtifact,
  onSaveArtifact,
  onOpenTextureEditor,
  className = "",
}: StudioAi3dGenerationPanelProps) {
  const [mode, setMode] = useState<Studio3dGenerationMode>("text-to-3d");
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<readonly File[]>([]);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [transport, setTransport] = useState<"server" | "byok">("server");
  const [preset, setPreset] = useState<"blockout" | "webtoon" | "line-tone" | "character" | "quality">("webtoon");
  const [advanced, setAdvanced] = useState(false);
  const [seed, setSeed] = useState(73);
  const [targetFaceCount, setTargetFaceCount] = useState(20_000);
  const [job, setJob] = useState<Studio3dGenerationJob | null>(null);
  const [history, setHistory] = useState<readonly Studio3dGenerationJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const options = useMemo<Studio3dGenerationCreateInput["options"]>(() => {
    const presets = {
      blockout: { tier: "Gen-2.5-Medium", meshMode: "Raw", material: "None", textureResolution: 2048, targetFaceCount: 5_000 },
      webtoon: { tier: "Gen-2.5-Medium", meshMode: "Raw", material: "PBR", textureResolution: 2048, targetFaceCount: 20_000 },
      "line-tone": { tier: "Gen-2.5-Medium", meshMode: "Quad", material: "Shaded", textureResolution: 2048, targetFaceCount: 30_000 },
      character: { tier: "Gen-2.5-Medium", meshMode: "Quad", material: "PBR", textureResolution: 4096, targetFaceCount: 60_000, pose: "T-pose" },
      quality: { tier: "Gen-2.5-High", meshMode: "Quad", material: "PBR", textureResolution: 4096, targetFaceCount: 100_000 },
    } as const;
    return Object.freeze({
      ...presets[preset],
      geometryFormat: "GLB",
      seed,
      symmetry: true,
      ...(advanced ? { targetFaceCount } : {}),
    });
  }, [advanced, preset, seed, targetFaceCount]);

  const expectedFileCount = mode === "image-to-3d" ? 1 : mode === "multiview-to-3d" ? 2 : mode === "texture-only" ? 1 : 0;
  const inputValid =
    (mode !== "text-to-3d" || prompt.trim().length > 0) &&
    (mode === "text-to-3d" || files.length >= expectedFileCount) &&
    (mode !== "multiview-to-3d" || files.length <= 5) &&
    (mode !== "texture-only" || modelFile !== null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    void client.list(controller.signal).then((items) => {
      if (!alive) return;
      setHistory(items);
      const active = items.find((item) => !TERMINAL.has(item.state));
      if (active) setJob(active);
    }).catch(() => undefined);
    return () => {
      alive = false;
      controller.abort();
      abortRef.current?.abort();
    };
  }, [client]);

  useEffect(() => {
    if (!job || TERMINAL.has(job.state)) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(() => {
      void client.advance(job.id, controller.signal).then((next) => {
        setJob(next);
        setHistory((current) => [next, ...current.filter((item) => item.id !== next.id)]);
        setStatusMessage(STATE_LABELS[next.state]);
      }).catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : String(caught));
      });
    }, 4_000);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [client, job]);

  const create = async () => {
    if (!inputValid || busy) return;
    setBusy(true);
    setError(null);
    setStatusMessage("입력 검증 및 제출 중");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const encodedImages = await Promise.all(
        files.map((file, index) => studioFileToGenerationInput(file, 25 * 1024 * 1024, `view-${index + 1}`)),
      );
      const encodedModel = modelFile
        ? await studioFileToGenerationInput(modelFile, 200 * 1024 * 1024)
        : undefined;
      const next = await client.create(
        {
          mode,
          ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
          ...(encodedImages.length > 0 ? { images: encodedImages } : {}),
          ...(encodedModel ? { model: encodedModel } : {}),
          transport,
          options,
          estimatedCredits: preset === "quality" ? 4 : preset === "character" ? 3 : preset === "blockout" ? 1 : 2,
        },
        uniqueRequestKey(),
        controller.signal,
      );
      setJob(next);
      setHistory((current) => [next, ...current.filter((item) => item.id !== next.id)]);
      setStatusMessage(STATE_LABELS[next.state]);
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!job || TERMINAL.has(job.state)) return;
    abortRef.current?.abort();
    setBusy(true);
    try {
      const next = await client.cancel(job.id);
      setJob(next);
      setHistory((current) => [next, ...current.filter((item) => item.id !== next.id)]);
      setStatusMessage("3D 생성 작업을 취소했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const withArtifact = async (
    action: ((job: Studio3dGenerationJob, blob: Blob) => Promise<void> | void) | undefined,
  ) => {
    if (!job?.artifactRevision || !action) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await client.downloadArtifact(job.artifactRevision.id);
      await action(job, blob);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="AI 3D 생성"
      className={`flex min-h-0 flex-col gap-3 rounded-xl border border-line bg-card p-3 text-fg ${className}`}
      data-studio-ai-3d-generation-panel="true"
    >
      <header>
        <h3 className="text-sm font-bold">AI 3D 생성</h3>
        <p className="mt-1 text-[0.63rem] leading-relaxed text-fg-3">
          입력은 실행 전 확인 후 Hyper3D/Rodin으로 전송됩니다. API 키는 브라우저 번들·작업 기록·오류 로그에 저장하지 않습니다.
        </p>
      </header>

      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="3D 생성 입력 방식">
        {(Object.keys(MODE_LABELS) as Studio3dGenerationMode[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mode === item}
            onClick={() => {
              setMode(item);
              setFiles([]);
              setModelFile(null);
              setError(null);
            }}
            className="min-h-11 shrink-0 rounded-full border border-line px-3 text-xs aria-selected:border-accent aria-selected:bg-accent/10"
          >
            {MODE_LABELS[item]}
          </button>
        ))}
      </div>

      {mode === "text-to-3d" || mode === "texture-only" ? (
        <label className="grid gap-1 text-xs font-semibold">
          생성 설명
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.currentTarget.value.slice(0, 1_024))}
            rows={3}
            placeholder={mode === "texture-only" ? "예: 따뜻한 목재와 황동 장식" : "예: 웹툰 교실 배경용 단정한 학생 책상"}
            className="min-h-24 rounded-lg border border-line bg-panel p-2 font-normal"
          />
        </label>
      ) : null}

      {mode !== "text-to-3d" ? (
        <label className="grid gap-1 text-xs font-semibold">
          {mode === "multiview-to-3d" ? "참조 이미지 2–5장" : "참조 이미지 1장"}
          <input
            type="file"
            accept="image/*"
            multiple={mode === "multiview-to-3d"}
            onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []).slice(0, mode === "multiview-to-3d" ? 5 : 1))}
            className="min-h-11 rounded-lg border border-line bg-panel p-2"
          />
        </label>
      ) : null}

      {mode === "texture-only" ? (
        <label className="grid gap-1 text-xs font-semibold">
          원본 3D 모델
          <input
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            onChange={(event) => setModelFile(event.currentTarget.files?.[0] ?? null)}
            className="min-h-11 rounded-lg border border-line bg-panel p-2"
          />
        </label>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold">
          품질 프리셋
          <select value={preset} onChange={(event) => setPreset(event.currentTarget.value as typeof preset)} className="min-h-11 rounded-lg border border-line bg-panel px-2">
            <option value="blockout">빠른 블록아웃</option>
            <option value="webtoon">웹툰 기본</option>
            <option value="line-tone">선화·톤용</option>
            <option value="character">캐릭터·포즈용</option>
            <option value="quality">고품질 소재</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          처리 경로
          <select value={transport} onChange={(event) => setTransport(event.currentTarget.value as typeof transport)} className="min-h-11 rounded-lg border border-line bg-panel px-2">
            <option value="server">서버 관리 키</option>
            <option value="byok">내 API 키 · 세션 한정</option>
          </select>
        </label>
      </div>

      <details onToggle={(event) => setAdvanced(event.currentTarget.open)} className="rounded-lg border border-line bg-panel/50">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-xs font-bold">고급 형상 설정</summary>
        <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs">Seed<input type="number" min={0} max={65535} value={seed} onChange={(event) => setSeed(Math.max(0, Math.min(65_535, Number(event.currentTarget.value))))} className="min-h-11 rounded-lg border border-line bg-card px-2" /></label>
          <label className="grid gap-1 text-xs">목표 face 수<input type="number" min={500} max={2000000} value={targetFaceCount} onChange={(event) => setTargetFaceCount(Math.max(500, Math.min(2_000_000, Number(event.currentTarget.value))))} className="min-h-11 rounded-lg border border-line bg-card px-2" /></label>
        </div>
      </details>

      <div className="rounded-lg border border-warn/30 bg-warn/10 p-2 text-[0.63rem] leading-relaxed text-fg-2">
        <strong>실행 전 확인</strong> · 외부 전송 있음 · 예상 비용 {preset === "quality" ? "높음" : preset === "blockout" ? "낮음" : "보통"} · 결과 URL은 장기 저장하지 않고 서버가 즉시 내부 자산 revision으로 수집합니다.
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void create()} disabled={!inputValid || busy || Boolean(job && !TERMINAL.has(job.state))} className="min-h-11 flex-1 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent disabled:opacity-50">
          {busy ? "처리 중…" : "3D 생성 시작"}
        </button>
        {job && !TERMINAL.has(job.state) ? (
          <button type="button" onClick={() => void cancel()} className="min-h-11 rounded-lg border border-bad/40 px-4 text-xs font-bold text-bad">취소</button>
        ) : null}
      </div>

      <div aria-live="polite" role="status" className="text-xs text-fg-2">
        {job ? `${STATE_LABELS[job.state]} · ${job.request.tier} · 예상 ${job.estimatedCredits} credit` : statusMessage}
      </div>
      {error ? <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-2 text-xs text-bad">{error}</p> : null}

      {job?.state === "ready" && job.artifactRevision ? (
        <div className="grid gap-2 rounded-xl border border-good/35 bg-good/10 p-3">
          <strong className="text-xs text-good">검증된 GLB revision 준비 완료</strong>
          <span className="break-all font-mono text-[0.58rem] text-fg-3">{job.artifactRevision.contentHashSha256}</span>
          <div className="flex flex-wrap gap-2">
            {onInsertArtifact ? <button type="button" onClick={() => void withArtifact(onInsertArtifact)} className="min-h-11 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent">장면에 삽입</button> : null}
            {onSaveArtifact ? <button type="button" onClick={() => void withArtifact(onSaveArtifact)} className="min-h-11 rounded-lg border border-line px-3 text-xs font-bold">소재로 저장</button> : null}
            {onOpenTextureEditor ? <button type="button" onClick={() => void withArtifact(onOpenTextureEditor)} className="min-h-11 rounded-lg border border-line px-3 text-xs font-bold">텍스처 편집</button> : null}
          </div>
        </div>
      ) : null}

      {history.length > 0 ? (
        <details className="rounded-lg border border-line">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-xs font-bold">생성 작업 내역 {history.length}건</summary>
          <ul className="max-h-48 overflow-y-auto border-t border-line p-2 text-xs">
            {history.slice(0, 20).map((item) => (
              <li key={item.id} className="flex min-h-11 items-center justify-between gap-2 border-b border-line/50 last:border-0">
                <button type="button" onClick={() => setJob(item)} className="min-h-11 min-w-0 flex-1 truncate text-left">{MODE_LABELS[item.request.mode]} · {STATE_LABELS[item.state]}</button>
                <span className="shrink-0 text-fg-3">{item.actualCredits ?? item.estimatedCredits} cr</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
