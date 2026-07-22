import {
  AlertTriangle,
  ChevronDown,
  Loader2,
  PackageOpen,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";

import type { Bg3dModelImportItem, Bg3dModelLibraryEntry } from "./bg3d-model-library";

const ASSET_BATCH_SIZE = 12;
const MODEL_FILE_ACCEPT =
  ".glb,.gltf,.obj,.fbx,.dae,.stl,.ply,.3ds,.mtl,.bin,.png,.jpg,.jpeg,.webp,model/gltf-binary,model/gltf+json,model/obj,model/stl";

const CONTROL_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-9";

type AssetFilter = "all" | "usable" | "review";
type ImportRights = NonNullable<Bg3dModelImportItem["rights"]>;
type ImportRightsStatus = NonNullable<ImportRights["status"]>;

const ASSET_FILTERS: ReadonlyArray<{ id: AssetFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "usable", label: "사용 가능" },
  { id: "review", label: "확인 필요" },
];

const RIGHTS_PRESETS: ReadonlyArray<{
  id: ImportRightsStatus;
  label: string;
  description: string;
}> = [
  { id: "owned", label: "직접 제작", description: "내가 만든 모델" },
  { id: "licensed", label: "구매·허가", description: "ACON·웨어하우스 등" },
  { id: "public-domain", label: "공개 이용", description: "퍼블릭 도메인" },
  { id: "unknown", label: "확인 전", description: "상업 이용 보류" },
];

type StudioBg3dAssetLibraryPanelProps = {
  entries: readonly Bg3dModelLibraryEntry[];
  libraryStatus: "idle" | "loading" | "ready" | "error";
  deletingModelId: string | null;
  isUploading: boolean;
  importProgress: {
    readonly completedModels: number;
    readonly totalModels: number;
  } | null;
  isRestoringScene: boolean;
  deviceProfileLabel: "모바일" | "데스크톱";
  onFileChange: (event: ChangeEvent<HTMLInputElement>, rights: ImportRights) => void;
  onCancelImport: () => void;
  onAdd: (id: string) => void;
  onDelete: (id: string) => void;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function StudioBg3dAssetLibraryPanel({
  entries,
  libraryStatus,
  deletingModelId,
  isUploading,
  importProgress,
  isRestoringScene,
  deviceProfileLabel,
  onFileChange,
  onCancelImport,
  onAdd,
  onDelete,
}: StudioBg3dAssetLibraryPanelProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [visibleCount, setVisibleCount] = useState(ASSET_BATCH_SIZE);
  const [rightsStatus, setRightsStatus] = useState<ImportRightsStatus>("unknown");
  const [commercialUse, setCommercialUse] = useState(false);
  const [attributionRequired, setAttributionRequired] = useState(false);
  const [licenseName, setLicenseName] = useState("");
  const [attribution, setAttribution] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trimmedLicenseName = licenseName.trim();
  const trimmedAttribution = attribution.trim();
  const rightsAreComplete =
    (rightsStatus !== "licensed" || trimmedLicenseName.length > 0) &&
    (!attributionRequired || trimmedAttribution.length > 0);
  const importRights: ImportRights = {
    status: rightsStatus,
    commercialUse: rightsStatus === "unknown" ? false : commercialUse,
    attributionRequired,
    ...(trimmedLicenseName ? { licenseName: trimmedLicenseName } : {}),
    ...(trimmedAttribution ? { attribution: trimmedAttribution } : {}),
  };

  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  const filteredEntries = entries.filter((entry) => {
    if (filter === "usable" && !entry.canUse) return false;
    if (filter === "review" && entry.canUse) return false;
    if (!normalizedQuery) return true;
    return [entry.name, entry.format, entry.statusMessage].some((value) =>
      value.toLocaleLowerCase("ko-KR").includes(normalizedQuery),
    );
  });
  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const hiddenEntryCount = Math.max(0, filteredEntries.length - visibleEntries.length);

  return (
    <section aria-labelledby="bg3d-asset-library-title" aria-busy={libraryStatus === "loading" || isUploading}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 id="bg3d-asset-library-title" className="flex items-center gap-1.5 text-sm font-bold text-fg">
          <PackageOpen size={15} className="text-accent" aria-hidden />
          3D 모델
        </h3>
        <span className="text-right text-[0.68rem] text-fg-3" aria-live="polite">
          표시 {visibleEntries.length}/{filteredEntries.length}개 · {deviceProfileLabel} 기준
        </span>
      </div>

      <input
        ref={fileInputRef}
        accept={MODEL_FILE_ACCEPT}
        aria-label="3D 모델 및 연결 파일 선택"
        className="sr-only"
        multiple
        type="file"
        onChange={(event) => onFileChange(event, importRights)}
      />
      <button
        type="button"
        className={cx(CONTROL_BUTTON, "w-full border-accent/50 bg-accent text-on-accent hover:bg-accent/90")}
        disabled={!isUploading && !rightsAreComplete}
        onClick={() => {
          if (isUploading) onCancelImport();
          else fileInputRef.current?.click();
        }}
      >
        {isUploading ? <X size={14} aria-hidden /> : <Upload size={14} aria-hidden />}
        {isUploading
          ? importProgress?.totalModels
            ? `가져오기 취소 · ${importProgress.completedModels}/${importProgress.totalModels}`
            : "가져오기 취소"
          : "3D 모델 및 연결 파일 가져오기"}
      </button>
      <details className="group mt-2 rounded-xl border border-line bg-card/60 open:bg-card">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-bold text-fg marker:content-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-9">
          <ShieldCheck size={14} className="shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1 truncate">이용 권리 기록</span>
          <span className="shrink-0 text-[0.65rem] font-semibold text-fg-3">
            {RIGHTS_PRESETS.find((preset) => preset.id === rightsStatus)?.label}
          </span>
          <ChevronDown
            size={14}
            className="shrink-0 text-fg-3 transition-transform duration-200 group-open:rotate-180"
            aria-hidden
          />
        </summary>

        <div className="border-t border-line px-3 pb-3 pt-2.5">
          <p className="text-[0.68rem] leading-relaxed text-fg-3">
            모델 파일은 외부로 전송하지 않습니다. 출처의 원본 라이선스를 확인하고, 작업에 함께 보관할 권리 정보를 선택하세요.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="가져올 3D 모델 이용 권리">
            {RIGHTS_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={rightsStatus === preset.id}
                className={cx(
                  "min-h-11 rounded-lg border px-2 py-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-10",
                  rightsStatus === preset.id
                    ? "border-accent/55 bg-accent-soft text-accent"
                    : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                )}
                onClick={() => {
                  setRightsStatus(preset.id);
                  if (preset.id === "unknown") setCommercialUse(false);
                }}
              >
                <span className="block text-[0.68rem] font-bold">{preset.label}</span>
                <span className="mt-0.5 block text-[0.62rem] font-medium text-fg-3">{preset.description}</span>
              </button>
            ))}
          </div>

          {rightsStatus === "licensed" ? (
            <label className="mt-2 block text-[0.68rem] font-bold text-fg-2">
              라이선스·구매처 이름 <span className="text-accent">필수</span>
              <input
                type="text"
                value={licenseName}
                maxLength={160}
                placeholder="예: ACON3D 구매 라이선스"
                aria-invalid={!trimmedLicenseName || undefined}
                className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-fg placeholder:text-fg-3 focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-9"
                onChange={(event) => setLicenseName(event.target.value)}
              />
            </label>
          ) : null}

          <label className="mt-2 flex min-h-11 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-[0.68rem] font-semibold text-fg-2 sm:min-h-9">
            <input
              type="checkbox"
              checked={rightsStatus !== "unknown" && commercialUse}
              disabled={rightsStatus === "unknown"}
              className="size-4 accent-[var(--color-accent)]"
              onChange={(event) => setCommercialUse(event.target.checked)}
            />
            상업 작품에 사용할 수 있음
          </label>
          <label className="mt-1.5 flex min-h-11 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-[0.68rem] font-semibold text-fg-2 sm:min-h-9">
            <input
              type="checkbox"
              checked={attributionRequired}
              className="size-4 accent-[var(--color-accent)]"
              onChange={(event) => setAttributionRequired(event.target.checked)}
            />
            작품에 출처 표기가 필요함
          </label>
          {attributionRequired ? (
            <label className="mt-2 block text-[0.68rem] font-bold text-fg-2">
              출처 표기 문구 <span className="text-accent">필수</span>
              <input
                type="text"
                value={attribution}
                maxLength={160}
                placeholder="예: 모델 제작자 · 라이선스명"
                aria-invalid={!trimmedAttribution || undefined}
                className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-fg placeholder:text-fg-3 focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-9"
                onChange={(event) => setAttribution(event.target.value)}
              />
            </label>
          ) : null}
          {!rightsAreComplete ? (
            <p className="mt-2 text-[0.66rem] font-semibold leading-relaxed text-accent" role="alert">
              필수 권리 정보를 입력하면 파일을 선택할 수 있습니다.
            </p>
          ) : null}
        </div>
      </details>
      <p className="mt-2 rounded-xl border border-line bg-card/60 px-3 py-2 text-xs leading-relaxed text-fg-3">
        SketchUp에서 내보낸 DAE·OBJ를 포함해 GLB·glTF·FBX·STL·PLY·3DS를 지원합니다. glTF의 BIN/텍스처나 OBJ의 MTL/텍스처도 함께 선택하세요.
        외부 네트워크 참조 없이 자체 포함 GLB로 변환하고, Worker에서 SHA-256·파일 구조와 기기별
        삼각형/텍스처 예산을 검사한 뒤 로컬 라이브러리에 저장합니다. Meshopt 압축은 별도 WASM
        Worker에서 풀며 디코딩 후 메모리도 같은 기기 예산으로 제한합니다. KTX2/Basis 텍스처는
        전체 mip 선행 검사 뒤 현재 3D 렌더러에 맞는 형식으로 변환합니다.
      </p>

      {libraryStatus === "error" ? (
        <p className="mt-2 rounded-xl border border-line bg-card/70 px-3 py-2 text-xs leading-relaxed text-fg-3" role="alert">
          <AlertTriangle className="mr-1 inline align-[-2px] text-accent" size={14} aria-hidden />
          저장된 3D 모델 목록을 불러오지 못했습니다.
        </p>
      ) : null}

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-3" aria-hidden />
        <input
          type="search"
          value={query}
          aria-label="3D 모델 라이브러리 검색"
          placeholder="모델 이름·형식 검색…"
          spellCheck={false}
          className="min-h-11 w-full rounded-lg border border-line bg-card py-1.5 pl-8 pr-2 text-xs text-fg placeholder:text-fg-3 focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-9"
          onChange={(event) => {
            setQuery(event.target.value);
            setVisibleCount(ASSET_BATCH_SIZE);
          }}
        />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5" role="group" aria-label="3D 모델 상태 필터">
        {ASSET_FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={filter === option.id}
            className={cx(
              "min-h-11 rounded-lg border px-2 text-[0.68rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-9",
              filter === option.id
                ? "border-accent/55 bg-accent-soft text-accent"
                : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
            )}
            onClick={() => {
              setFilter(option.id);
              setVisibleCount(ASSET_BATCH_SIZE);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {libraryStatus === "loading" ? (
          <div className="col-span-2 rounded-xl border border-line bg-card/60 px-3 py-4 text-center text-xs text-fg-3">
            저장된 3D 모델을 불러오는 중입니다.
          </div>
        ) : null}

        {libraryStatus === "ready" && entries.length === 0 ? (
          <div className="col-span-2 rounded-xl border border-dashed border-line bg-card/45 px-3 py-4 text-center text-xs leading-relaxed text-fg-3">
            가져온 3D 모델이 아직 없습니다. GLB를 선택하거나 모델과 연결 리소스를 함께 선택해 보세요.
          </div>
        ) : null}

        {entries.length > 0 && filteredEntries.length === 0 ? (
          <div className="col-span-2 rounded-xl border border-line bg-card/60 px-3 py-4 text-center text-xs text-fg-3">
            검색·필터와 일치하는 3D 모델이 없습니다.
          </div>
        ) : null}

        {visibleEntries.map((entry) => {
          const isDeleting = deletingModelId === entry.id;
          return (
            <div key={entry.id} className="relative overflow-hidden rounded-xl border border-line bg-card transition-colors hover:bg-raised">
              <button
                type="button"
                aria-label={`${entry.name} 장면에 추가`}
                aria-describedby={`bg3d-model-status-${entry.id}`}
                className="grid min-h-[7.75rem] w-full grid-rows-[3rem_auto] gap-2 px-2.5 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55"
                disabled={!entry.canUse || isDeleting || isUploading || isRestoringScene}
                onClick={() => onAdd(entry.id)}
              >
                <span className="grid h-12 place-items-center overflow-hidden rounded-lg border border-line/80 bg-panel">
                  {entry.thumbnail ? (
                    <img alt="" className="h-full w-full object-contain" src={entry.thumbnail} />
                  ) : (
                    <PackageOpen size={20} className="text-fg-3" aria-hidden />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-fg">{entry.name}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <span className="inline-flex rounded-full bg-raised px-1.5 py-0.5 text-[0.64rem] font-bold uppercase text-fg-3">
                      {entry.format}
                    </span>
                    <span
                      className={cx(
                        "inline-flex rounded-full px-1.5 py-0.5 text-[0.64rem] font-bold",
                        entry.commercialUse
                          ? "bg-[oklch(0.80_0.15_150/0.14)] text-good"
                          : "bg-raised text-fg-3",
                      )}
                    >
                      {entry.commercialUse ? "상업 이용 가능" : "상업 이용 확인 필요"}
                    </span>
                  </span>
                  <span id={`bg3d-model-status-${entry.id}`} className="mt-1 line-clamp-2 block text-[0.64rem] leading-snug text-fg-3">
                    {entry.statusMessage}
                  </span>
                </span>
              </button>

              {entry.source === "indexed-db" ? (
                <button
                  type="button"
                  aria-label={`${entry.name} 삭제`}
                  className="absolute right-1.5 top-1.5 grid size-11 place-items-center rounded-lg border border-line bg-panel/90 text-fg-3 transition-colors hover:bg-raised hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45 sm:size-7"
                  disabled={isDeleting}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(entry.id);
                  }}
                >
                  {isDeleting ? <Loader2 className="animate-spin" size={13} aria-hidden /> : <Trash2 size={13} aria-hidden />}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {hiddenEntryCount > 0 ? (
        <button
          type="button"
          className={cx(CONTROL_BUTTON, "mt-3 w-full border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}
          onClick={() => setVisibleCount((count) => count + ASSET_BATCH_SIZE)}
        >
          모델 {Math.min(ASSET_BATCH_SIZE, hiddenEntryCount)}개 더 보기
          <span className="text-fg-3">· {hiddenEntryCount}개 남음</span>
        </button>
      ) : filteredEntries.length > ASSET_BATCH_SIZE ? (
        <button
          type="button"
          className={cx(CONTROL_BUTTON, "mt-3 w-full border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}
          onClick={() => setVisibleCount(ASSET_BATCH_SIZE)}
        >
          처음 {ASSET_BATCH_SIZE}개만 보기
        </button>
      ) : null}
    </section>
  );
}
