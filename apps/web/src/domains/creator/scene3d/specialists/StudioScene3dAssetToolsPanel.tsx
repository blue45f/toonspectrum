import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { SPECIALIST_LIMITS, SpecialistError } from "./specialist-contract";
import { runScene3dSpecialistInWorker } from "./specialist-client";
import type {
  SpecialistOptions,
  SpecialistResult,
} from "./specialist-contract";

const Preview = lazy(() =>
  import("./StudioScene3dArtifactPreview").then((module) => ({
    default: module.StudioScene3dArtifactPreview,
  })),
);
const BUTTON =
  "min-h-11 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold hover:bg-raised disabled:opacity-45";

export function StudioScene3dAssetToolsPanel({
  disabled = false,
}: {
  readonly disabled?: boolean;
}) {
  const t = useBilingual("scene3d-specialists");
  const source = useRef<ArrayBuffer | null>(null);
  const secondary = useRef<ArrayBuffer | null>(null);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [name, setName] = useState("");
  const [secondName, setSecondName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SpecialistResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<readonly string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [operation, setOperation] = useState<
    "union" | "subtract" | "intersect"
  >("subtract");
  const [backend, setBackend] = useState<"preview" | "solid">("preview");
  const [start, setStart] = useState([-2, 0, -2]);
  const [end, setEnd] = useState([2, 0, 2]);
  const [cellSize, setCellSize] = useState(0.2);
  const [textureMode, setTextureMode] = useState<"uastc" | "etc1s">("uastc");
  const [maxTextureSize, setMaxTextureSize] = useState<512 | 1024 | 2048>(2048);
  const nodeListId = useId();
  const [nodeNames, setNodeNames] = useState<readonly string[]>([]);
  const [rootName, setRootName] = useState("");
  const [tipName, setTipName] = useState("");
  const [ikTarget, setIkTarget] = useState([1, 1.2, 0.3]);
  const [angleLimit, setAngleLimit] = useState(150);
  useEffect(
    () => () => {
      generation.current++;
      active.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (disabled) active.current?.abort();
  }, [disabled]);
  useEffect(() => {
    const urls =
      result?.artifacts.map((artifact) =>
        URL.createObjectURL(
          new Blob([artifact.bytes], { type: artifact.mime }),
        ),
      ) ?? [];
    setLinks(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [result]);
  function cancel() {
    active.current?.abort();
    // File.arrayBuffer is not abortable; invalidate its completion as well.
    if (!active.current) {
      generation.current++;
      setBusy(false);
      setError(t("작업을 취소했습니다.", "The job was cancelled."));
    }
  }
  async function load(file: File | undefined, second: boolean) {
    if (!file) return;
    const ticket = ++generation.current;
    active.current?.abort();
    setBusy(true);
    setResult(null);
    setError(null);
    if (second) {
      secondary.current = null;
      setSecondName("");
    } else {
      source.current = null;
      setName("");
      setNodeNames([]);
    }
    try {
      if (file.size > SPECIALIST_LIMITS.inputBytes)
        throw new SpecialistError(
          "budget",
          t(
            "입력 파일은 256MiB 이하로 준비하세요.",
            "Input files must not exceed 256 MiB.",
          ),
        );
      const bytes = await file.arrayBuffer();
      if (ticket !== generation.current) return;
      if (second) {
        secondary.current = bytes;
        setSecondName(file.name);
      } else {
        source.current = bytes;
        setName(file.name);
      }
    } catch (error) {
      if (ticket === generation.current)
        setError(error instanceof Error ? error.message : "File read failed.");
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  async function run(options: SpecialistOptions) {
    if (!source.current || busy || disabled) return;
    const ticket = ++generation.current;
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    setBusy(true);
    setResult(null);
    setError(null);
    setPreviewIndex(0);
    try {
      const next = await runScene3dSpecialistInWorker(
        {
          version: 1,
          id: ticket,
          source: source.current,
          ...(secondary.current ? { secondary: secondary.current } : {}),
          options,
        },
        controller.signal,
      );
      if (ticket === generation.current) {
        setResult(next);
        setNodeNames(next.sourceNodeNames ?? []);
      }
    } catch (error) {
      if (ticket === generation.current)
        setError(
          controller.signal.aborted
            ? t("작업을 취소했습니다.", "The job was cancelled.")
            : error instanceof Error
              ? error.message
              : "Processing failed.",
        );
    } finally {
      if (ticket === generation.current) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  const locked = disabled || busy || !name;
  const preview = result?.artifacts[previewIndex];
  return (
    <section
      className="space-y-3 rounded-xl border border-line bg-card p-3"
      aria-label={t("3D 자산 고급 가공", "Advanced 3D asset processing")}
    >
      <h3 className="text-sm font-bold">
        {t("3D 자산 고급 가공", "Advanced 3D asset processing")}
      </h3>
      <p className="text-xs leading-relaxed text-fg-2">
        {t(
          "자체 포함 GLB를 브라우저 안에서 가공합니다. 원본을 덮어쓰거나 업로드하지 않습니다. 파생 GLB는 에셋 라이브러리로 다시 가져올 수 있습니다.",
          "Process self-contained GLBs locally in your browser. Originals are never overwritten or uploaded. Import derived GLBs through the asset library.",
        )}
      </p>
      <label className="block text-xs">
        {t("원본 GLB", "Source GLB")}
        <input
          aria-label={t("원본 GLB", "Source GLB")}
          type="file"
          accept=".glb,model/gltf-binary"
          disabled={disabled || busy}
          className="mt-1 block w-full"
          onChange={(event) => {
            void load(event.currentTarget.files?.[0], false);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {name && <p className="break-all text-xs text-fg-3">{name}</p>}
      <button
        className={BUTTON}
        disabled={locked}
        onClick={() => void run({ kind: "inspect" })}
      >
        {t("모델·관절 구조 확인", "Inspect model and joint hierarchy")}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          className={BUTTON}
          disabled={locked}
          onClick={() => void run({ kind: "compress" })}
        >
          {t("Meshopt 압축", "Meshopt compression")}
        </button>
        <button
          className={BUTTON}
          disabled={locked}
          onClick={() => void run({ kind: "lod", error: 0.01 })}
        >
          {t("LOD 3단계 생성", "Generate 3 LODs")}
        </button>
        <button
          className={BUTTON}
          disabled={locked}
          onClick={() => void run({ kind: "tangents" })}
        >
          {t("Mikk 호환 접선 생성", "Mikk-compatible tangents")}
        </button>
        <button
          className={BUTTON}
          disabled={locked}
          onClick={() => void run({ kind: "animation" })}
        >
          {t("애니메이션 키 최적화", "Optimize animation keys")}
        </button>
      </div>
      <details className="rounded-lg border border-line p-2">
        <summary className="cursor-pointer py-2 text-xs font-semibold">{t("KTX2 텍스처·LOD 릴리스 생성", "KTX2 texture and LOD release")}</summary>
        <p className="my-2 text-xs text-fg-3">{t("색상·노멀 맵의 색 공간을 구분해 KTX2를 생성합니다. 릴리스는 정적 모델의 LOD 3종과 검증 보고서를 만듭니다. 원본·카탈로그 승인은 변경하지 않습니다.", "Encode transfer-aware KTX2 textures. Release mode generates three static-model LODs and a receipt. Originals and catalog approval remain unchanged.")}</p>
        <label className="my-2 block text-xs">{t("색상 텍스처 품질", "Color texture quality")}<select value={textureMode} disabled={locked} onChange={(event) => setTextureMode(event.currentTarget.value as typeof textureMode)} className="ml-2 bg-panel p-2"><option value="uastc">UASTC · {t("고품질", "High quality")}</option><option value="etc1s">ETC1S · {t("작은 파일", "Smaller files")}</option></select></label>
        <label className="my-2 block text-xs">{t("텍스처 최대 한 변", "Texture maximum edge")}<select value={maxTextureSize} disabled={locked} onChange={(event) => setMaxTextureSize(Number(event.currentTarget.value) as typeof maxTextureSize)} className="ml-2 bg-panel p-2">{[512,1024,2048].map((size)=><option key={size} value={size}>{size}px</option>)}</select></label>
        <div className="flex flex-wrap gap-2"><button className={BUTTON} disabled={locked} onClick={() => void run({kind:"textures", textureMode, maxTextureSize})}>{t("KTX2 파생본 생성", "Generate KTX2 derivative")}</button>
        <button className={BUTTON} disabled={locked} onClick={() => void run({kind:"release", textureMode, maxTextureSize, error:0.01})}>{t("LOD+KTX2 릴리스 생성", "Generate LOD+KTX2 release")}</button></div>
      </details>
      <details className="rounded-lg border border-line p-2">
        <summary className="cursor-pointer py-2 text-xs font-semibold">
          {t("관절 체인 IK 포즈 가공", "Joint-chain IK pose processing")}
        </summary>
        <p className="my-2 text-xs text-fg-3">
          {t(
            "구조 확인에서 노드 이름을 읽은 뒤, 시작 관절과 끝 관절을 선택하세요. 애니메이션 없는 GLB의 3~16개 노드 체인을 처리합니다. 관통·전신 균형은 보장하지 않습니다.",
            "Inspect the hierarchy, then choose a root and endpoint name. Supports 3–16-node chains in GLBs without animation clips. Body contact and whole-body balance are not guaranteed.",
          )}
        </p>
        <datalist id={nodeListId}>
          {[...new Set(nodeNames)].filter(Boolean).map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <label className="my-2 block text-xs">
          {t("시작 관절 이름", "Root joint name")}
          <input
            list={nodeListId}
            value={rootName}
            disabled={locked}
            onChange={(event) => setRootName(event.currentTarget.value)}
            className="mt-1 block min-h-11 w-full rounded border border-line bg-panel px-2"
          />
        </label>
        <label className="my-2 block text-xs">
          {t("끝 관절 이름", "Endpoint name")}
          <input
            list={nodeListId}
            value={tipName}
            disabled={locked}
            onChange={(event) => setTipName(event.currentTarget.value)}
            className="mt-1 block min-h-11 w-full rounded border border-line bg-panel px-2"
          />
        </label>
        <fieldset className="mb-2">
          <legend className="text-xs">
            {t("목표 월드 XYZ", "Target world XYZ")}
          </legend>
          <div className="grid grid-cols-3 gap-1">
            {[0, 1, 2].map((axis) => (
              <input
                key={axis}
                type="number"
                step="0.1"
                aria-label={`IK ${["X", "Y", "Z"][axis]}`}
                value={ikTarget[axis]}
                disabled={locked}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  setIkTarget((old) =>
                    old.map((n, i) => (i === axis ? value : n)),
                  );
                }}
                className="min-h-11 min-w-0 rounded border border-line bg-panel px-2"
              />
            ))}
          </div>
        </fieldset>
        <label className="my-2 block text-xs">
          {t("각 축 회전 제한 ±°", "Per-axis rotation limit ±°")}
          <input
            type="number"
            value={angleLimit}
            min="1"
            max="180"
            step="5"
            disabled={locked}
            onChange={(event) =>
              setAngleLimit(Number(event.currentTarget.value))
            }
            className="ml-2 w-20 bg-panel p-2"
          />
        </label>
        <button
          className={BUTTON}
          disabled={locked || !rootName || !tipName}
          onClick={() =>
            void run({
              kind: "ik",
              rootName,
              tipName,
              target: [ikTarget[0]!, ikTarget[1]!, ikTarget[2]!],
              angleLimitDegrees: angleLimit,
              tolerance: 0.005,
            })
          }
        >
          {t("IK 포즈 파생본 생성", "Generate IK pose derivative")}
        </button>
      </details>
      <details className="rounded-lg border border-line p-2">
        <summary className="cursor-pointer py-2 text-xs font-semibold">
          {t(
            "불리언 합치기·빼기·교집합",
            "Boolean union, difference and intersection",
          )}
        </summary>
        <p className="my-2 text-xs text-fg-3">
          {t(
            "각 GLB는 텍스처 없는 정적 메시 1개여야 하며 두 파일 합계는 128MiB 이하입니다. 월드 좌표로 연산하며 결과는 형상 전용입니다.",
            "Each GLB must contain one untextured static mesh; combined input must not exceed 128 MiB. Operations use world coordinates and export geometry only.",
          )}
        </p>
        <label className="block text-xs">
          {t("두 번째 GLB", "Second GLB")}
          <input
            aria-label={t("두 번째 GLB", "Second GLB")}
            type="file"
            accept=".glb"
            disabled={disabled || busy}
            className="my-1 block w-full"
            onChange={(event) => {
              void load(event.currentTarget.files?.[0], true);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {secondName && <p className="break-all text-xs">{secondName}</p>}
        <label className="my-2 block text-xs">
          {t("연산", "Operation")}
          <select
            value={operation}
            disabled={locked}
            onChange={(event) =>
              setOperation(event.currentTarget.value as typeof operation)
            }
            className="ml-2 bg-panel p-2"
          >
            <option value="union">{t("합치기", "Union")}</option>
            <option value="subtract">{t("빼기", "Subtract")}</option>
            <option value="intersect">{t("교집합", "Intersect")}</option>
          </select>
        </label>
        <label className="my-2 block text-xs">
          {t("처리기", "Processor")}
          <select
            value={backend}
            disabled={locked}
            onChange={(event) =>
              setBackend(event.currentTarget.value as typeof backend)
            }
            className="ml-2 bg-panel p-2"
          >
            <option value="preview">BVH preview</option>
            <option value="solid">Manifold solid</option>
          </select>
        </label>
        <button
          className={BUTTON}
          disabled={locked || !secondName}
          onClick={() => void run({ kind: "csg", operation, backend })}
        >
          {t("불리언 파생본 생성", "Generate Boolean derivative")}
        </button>
      </details>
      <details className="rounded-lg border border-line p-2">
        <summary className="cursor-pointer py-2 text-xs font-semibold">
          {t(
            "Recast 이동 표면·경로 생성",
            "Generate Recast navigation surface and path",
          )}
        </summary>
        <p className="my-2 text-xs text-fg-3">
          {t(
            "미터 단위·Y-up 정적 배경용입니다. 아직 가상 공간의 실시간 이동 제어기는 아닙니다.",
            "For static environments in meters with Y-up. This is not a live virtual-space movement controller.",
          )}
        </p>
        {(["start", "end"] as const).map((key) => (
          <fieldset key={key} className="mb-2">
            <legend className="text-xs">
              {key === "start"
                ? t("출발 XYZ", "Start XYZ")
                : t("도착 XYZ", "End XYZ")}
            </legend>
            <div className="grid grid-cols-3 gap-1">
              {[0, 1, 2].map((axis) => (
                <input
                  key={axis}
                  type="number"
                  step="0.1"
                  disabled={locked}
                  aria-label={`${key} ${["X", "Y", "Z"][axis]}`}
                  value={(key === "start" ? start : end)[axis]}
                  className="min-h-11 min-w-0 rounded border border-line bg-panel px-2"
                  onChange={(event) => {
                    const value = Number(event.currentTarget.value);
                    (key === "start" ? setStart : setEnd)((old) =>
                      old.map((n, i) => (i === axis ? value : n)),
                    );
                  }}
                />
              ))}
            </div>
          </fieldset>
        ))}
        <label className="my-2 block text-xs">
          {t("셀 크기(m)", "Cell size (m)")}
          <input
            type="number"
            min="0.05"
            max="2"
            step="0.05"
            value={cellSize}
            disabled={locked}
            className="ml-2 w-20 bg-panel p-2"
            onChange={(event) => setCellSize(Number(event.currentTarget.value))}
          />
        </label>
        <button
          className={BUTTON}
          disabled={locked}
          onClick={() =>
            void run({
              kind: "navigation",
              start: [start[0]!, start[1]!, start[2]!],
              end: [end[0]!, end[1]!, end[2]!],
              cellSize,
              agentRadius: 0.3,
              agentHeight: 1.8,
            })
          }
        >
          {t("이동 경로 생성", "Generate navigation path")}
        </button>
      </details>
      {busy && (
        <div role="status" className="flex items-center gap-2 text-xs">
          <span>{t("Worker에서 가공 중…", "Processing in a worker…")}</span>
          <button className={BUTTON} onClick={cancel}>
            {t("취소", "Cancel")}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="break-words text-xs text-danger">
          {t("처리 결과", "Processing result")}: {error}
        </p>
      )}
      {result && (
        <div className="space-y-2">
          <p role="status" className="text-xs font-semibold">
            {t("파생본 생성 완료", "Derivatives generated")} ·{" "}
            {t("원본 삼각형", "Source triangles")}: {result.before.triangles}
          </p>
          {result.artifacts.map((artifact, index) => (
            <div
              key={artifact.name}
              className="flex flex-wrap items-center gap-2 rounded border border-line p-2 text-xs"
            >
              <a
                href={links[index]}
                download={artifact.name}
                className="min-h-11 content-center font-semibold underline"
              >
                {artifact.name}
              </a>
              <span>
                {artifact.bytes.length.toLocaleString()} B
                {artifact.stats
                  ? ` · ${artifact.stats.triangles.toLocaleString()} △`
                  : ""}
              </span>
              {artifact.mime === "model/gltf-binary" && (
                <button
                  className={BUTTON}
                  onClick={() => setPreviewIndex(index)}
                >
                  {t("미리보기", "Preview")}
                </button>
              )}
            </div>
          ))}
          {preview?.mime === "model/gltf-binary" && (
            <Suspense
              fallback={
                <p role="status" className="text-xs">
                  {t("미리보기 준비 중", "Loading preview")}
                </p>
              }
            >
              <Preview artifact={preview} />
            </Suspense>
          )}
          <p className="text-xs text-fg-3">
            {t(
              "자동 품질 승인은 수행하지 않습니다. KTX2 변환은 해당 도구에서만 수행하며 결과를 검토한 뒤 사용하세요.",
              "No automatic quality approval is performed. KTX2 conversion runs only through its explicit tool. Review the artifacts before use.",
            )}
          </p>
          <details>
            <summary className="cursor-pointer py-2 text-xs">
              {t("기술 보고서·제약사항", "Technical report and limitations")}
            </summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[10px]">
              {JSON.stringify(
                {
                  ...result,
                  artifacts: result.artifacts.map(({ bytes, ...artifact }) => ({
                    ...artifact,
                    byteLength: bytes.length,
                  })),
                },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      )}
    </section>
  );
}
