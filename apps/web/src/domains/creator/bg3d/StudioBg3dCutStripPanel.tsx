import { ChevronDown, ChevronUp, FileDown, Film, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  CUT_ASPECT_RATIO_UI,
  Studio3DStoryboardCutStrip,
  getCutAspectRatioUi,
  type CutAspectRatio,
  type PsdMultiPassExportManifest,
  type StoryboardCut,
} from "../scene-3d/studio-3d-storyboard-cut-strip";

const CUT_ASPECT_IDS = Object.keys(CUT_ASPECT_RATIO_UI) as CutAspectRatio[];

const DEFAULT_CUT_CAMERA = Object.freeze({
  position: [0, 1.6, 6] as const,
  target: [0, 1.4, 0] as const,
  fovDegrees: 45,
  rollDegrees: 0,
});

export interface StudioBg3dCutStripPanelProps {
  readonly cuts: readonly StoryboardCut[];
  /** 웹툰 표준 문서 너비(px). 기본 800. */
  readonly documentWidth?: number;
  readonly disabled?: boolean;
  readonly onAddCut: (cut: StoryboardCut) => void;
  readonly onRemoveCut: (cutId: string) => void;
  readonly onMoveCut: (cutId: string, direction: "up" | "down") => void;
  readonly onUpdateCutAspect: (cutId: string, aspectRatio: CutAspectRatio) => void;
  /**
   * PSD 명세 내보내기. 제공되지 않으면 패널이 JSON 파일로 직접 다운로드합니다.
   */
  readonly onExportPsdManifest?: (manifest: PsdMultiPassExportManifest) => void;
}

function makeCutId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cut-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function downloadManifestJson(manifest: PsdMultiPassExportManifest): void {
  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "webtoon-cut-strip-manifest.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * 컷 스트립 — 세로 스크롤 웹툰 원고의 컷 순서·화면비를 잡는 패널.
 * 컷 데이터 자체는 외부(SceneDocument 등 권위 소스)가 소유하고,
 * 이 패널은 추가/삭제/순서 변경/화면비 변경과 PSD 명세 계산을 담당합니다.
 */
export function StudioBg3dCutStripPanel({
  cuts,
  documentWidth = 800,
  disabled = false,
  onAddCut,
  onRemoveCut,
  onMoveCut,
  onUpdateCutAspect,
  onExportPsdManifest,
}: StudioBg3dCutStripPanelProps) {
  const [newCutAspect, setNewCutAspect] = useState<CutAspectRatio>("9:16-vertical-climax");
  const [notice, setNotice] = useState<string | null>(null);

  const strip = useMemo(() => {
    const engine = new Studio3DStoryboardCutStrip(cuts);
    engine.setDocumentWidth(documentWidth);
    return engine;
  }, [cuts, documentWidth]);

  const dimensionsByCutId = useMemo(() => {
    const map = new Map<string, { readonly width: number; readonly height: number }>();
    for (const cut of cuts) {
      map.set(cut.id, strip.evaluateCutPixelDimensions(cut.aspectRatio));
    }
    return map;
  }, [cuts, strip]);

  const totalHeight = strip.evaluateTotalStripHeight();

  const handleAddCut = () => {
    onAddCut({
      id: makeCutId(),
      cutNumber: cuts.length + 1,
      title: `컷 ${cuts.length + 1}`,
      aspectRatio: newCutAspect,
      cameraPosition: [...DEFAULT_CUT_CAMERA.position],
      cameraTarget: [...DEFAULT_CUT_CAMERA.target],
      cameraFovDeg: DEFAULT_CUT_CAMERA.fovDegrees,
      cameraRollDeg: DEFAULT_CUT_CAMERA.rollDegrees,
      characterIds: [],
    });
    setNotice(null);
  };

  const handleExportManifest = () => {
    const manifest = strip.generatePsdExportManifest();
    if (onExportPsdManifest) {
      onExportPsdManifest(manifest);
    } else {
      downloadManifestJson(manifest);
    }
    setNotice(
      `PSD 명세 준비 완료 — ${manifest.cuts.length}컷, ${manifest.documentWidth}×${manifest.documentHeight}px`,
    );
  };

  return (
    <div
      className="flex flex-col gap-3 p-3 text-xs text-fg"
      data-testid="bg3d-cut-strip-panel"
      aria-labelledby="bg3d-cut-strip-title"
    >
      <div className="flex items-start gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-panel text-accent">
          <Film size={15} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="bg3d-cut-strip-title" className="text-xs font-bold text-fg">
            컷 스트립
          </h2>
          <p className="mt-1 text-[0.625rem] leading-relaxed text-fg-3">
            세로 스크롤 웹툰 원고의 컷 순서와 화면비를 잡습니다. 컷을 추가하고
            순서를 맞춘 뒤, PSD 명세로 내보내면 합성·마감 작업에 바로 쓸 수
            있어요.
          </p>
        </div>
      </div>

      {notice ? (
        <p className="rounded-lg border border-good/40 bg-good/10 px-2.5 py-1.5 text-[0.625rem] text-good" role="status">
          {notice}
        </p>
      ) : null}

      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 text-[0.625rem] font-semibold text-fg-3">
          새 컷 화면비
          <select
            value={newCutAspect}
            disabled={disabled}
            onChange={(event) => setNewCutAspect(event.target.value as CutAspectRatio)}
            title={getCutAspectRatioUi(newCutAspect)?.tooltipKo ?? ""}
            className="mt-1 min-h-8 w-full rounded border border-line bg-raised px-2 text-fg"
          >
            {CUT_ASPECT_IDS.map((aspectId) => {
              const ui = getCutAspectRatioUi(aspectId)!;
              return (
                <option key={aspectId} value={aspectId} title={ui.tooltipKo}>
                  {ui.labelKo}
                </option>
              );
            })}
          </select>
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={handleAddCut}
          className="flex min-h-8 shrink-0 items-center gap-1 rounded bg-accent/15 px-2.5 py-1 text-[0.68rem] font-bold text-accent transition-all hover:bg-accent/25 disabled:opacity-45"
        >
          <Plus className="size-3.5" aria-hidden />
          컷 추가
        </button>
      </div>
      <p className="text-[0.625rem] text-fg-3">
        {getCutAspectRatioUi(newCutAspect)?.descriptionKo}
      </p>

      {cuts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[0.65rem] leading-relaxed text-fg-3">
          아직 컷이 없습니다. 화면비를 고르고 “컷 추가”를 눌러 첫 컷을 만들어
          보세요.
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5" aria-label="컷 순서">
          {cuts.map((cut, index) => {
            const ui = getCutAspectRatioUi(cut.aspectRatio);
            const dims = dimensionsByCutId.get(cut.id);
            return (
              <li
                key={cut.id}
                className="flex items-center gap-2 rounded-lg border border-line bg-card px-2 py-1.5"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded bg-raised text-[0.65rem] font-bold text-fg-2">
                  {cut.cutNumber}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.68rem] font-semibold text-fg">
                    {cut.title}
                  </p>
                  <p className="truncate text-[0.6rem] text-fg-3">
                    {ui?.labelKo}
                    {dims ? ` · ${dims.width}×${dims.height}px` : ""}
                  </p>
                </div>
                <label className="sr-only" htmlFor={`cut-aspect-${cut.id}`}>
                  {cut.title} 화면비
                </label>
                <select
                  id={`cut-aspect-${cut.id}`}
                  value={cut.aspectRatio}
                  disabled={disabled}
                  onChange={(event) =>
                    onUpdateCutAspect(cut.id, event.target.value as CutAspectRatio)
                  }
                  title={ui?.tooltipKo ?? ""}
                  className="min-h-8 shrink-0 rounded border border-line bg-raised px-1.5 text-[0.62rem] text-fg"
                >
                  {CUT_ASPECT_IDS.map((aspectId) => (
                    <option key={aspectId} value={aspectId}>
                      {getCutAspectRatioUi(aspectId)?.labelKo}
                    </option>
                  ))}
                </select>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    disabled={disabled || index === 0}
                    onClick={() => onMoveCut(cut.id, "up")}
                    aria-label={`${cut.title} 위로 이동`}
                    className="grid min-h-7 min-w-7 place-items-center rounded border border-line bg-raised text-fg-2 hover:text-fg disabled:opacity-40"
                  >
                    <ChevronUp size={13} aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === cuts.length - 1}
                    onClick={() => onMoveCut(cut.id, "down")}
                    aria-label={`${cut.title} 아래로 이동`}
                    className="grid min-h-7 min-w-7 place-items-center rounded border border-line bg-raised text-fg-2 hover:text-fg disabled:opacity-40"
                  >
                    <ChevronDown size={13} aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onRemoveCut(cut.id)}
                    aria-label={`${cut.title} 삭제`}
                    className="grid min-h-7 min-w-7 place-items-center rounded border border-line bg-raised text-fg-2 hover:text-bad disabled:opacity-40"
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <dl className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-card p-2.5 text-[0.625rem]">
        <div>
          <dt className="text-fg-3">전체 컷 수</dt>
          <dd className="numeral mt-0.5 text-[0.72rem] font-bold text-fg">
            {cuts.length}컷
          </dd>
        </div>
        <div>
          <dt className="text-fg-3">스트립 예상 높이</dt>
          <dd className="numeral mt-0.5 text-[0.72rem] font-bold text-fg">
            {documentWidth} × {totalHeight}px
          </dd>
        </div>
      </dl>

      <button
        type="button"
        disabled={disabled || cuts.length === 0}
        onClick={handleExportManifest}
        title="컷 구성·픽셀 치수·PSD 레이어 채널 명세를 JSON으로 내보냅니다"
        className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-[0.68rem] font-bold text-on-accent shadow-sm transition-all hover:bg-accent/90 disabled:opacity-45"
      >
        <FileDown className="size-3.5" aria-hidden />
        PSD 명세 내보내기
      </button>
    </div>
  );
}
