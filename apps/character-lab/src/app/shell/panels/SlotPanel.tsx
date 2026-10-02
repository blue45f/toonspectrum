/**
 * SlotPanel: 15슬롯 탭 + 프리셋 카드 그리드 + undo/redo.
 *
 * - 활성 슬롯은 셸 UI 상태(`useUiState().activeSlot`)를 쓴다(SlotRail·thumbnail-driver와 공유).
 * - 카드 클릭 = `slot/apply` dispatch 1회. 현재 적용된 카드는 `aria-pressed`. 접근성 이름은 프리셋 한글 라벨(`aria-label`)이고
 *   배지·사유는 카드 안 텍스트와 `title`로 노출한다.
 * - 능력 `unavailable`은 카드 disabled + 사유(tooltip·텍스트). `partial`은 경고 배지 + 사유.
 * - 마지막 적용 플랜(`useApplyPlan`)의 `unsupported` 사유(requires 불충족 등)도 그 슬롯에 표시한다.
 * - 현재 레시피와 `conflictsWith` 충돌이 있는 후보 카드는 "겹침 주의" 배지(적용은 가능).
 * - 썸네일은 `LabState.thumbnails[presetId]`: ready면 래스터(ImageData 지원 환경), pending/failed는 배지.
 *   생성 요청은 셸의 thumbnail-driver가 활성 슬롯 기준으로 한다(패널은 요청하지 않는다).
 * - 스타일 클래스 접두는 `cl-slot-`이며 app/styles/character-lab.css(core)가 정의한다.
 */
import { useEffect, useRef } from "react";

import { CHARACTER_SLOT_KINDS, SLOT_GROUPS, SLOT_GROUP_LABELS_KO, SLOT_LABELS_KO } from "../../../contracts";
import { presetConflicts } from "../../../state/apply-plan";
import { useApplyPlan, useCatalog, useDispatch, useLabState, useUiActions, useUiState } from "../lab-store-context";

import type { CapturedRaster, PresetEntry, PresetId, SlotCapability, SlotGroup, SlotKind, ThumbnailEntry, UnsupportedSlot } from "../../../contracts";

/** 비울 수 있는 슬롯("없음" 카드 표시) */
export const NULLABLE_SLOTS: readonly SlotKind[] = ["accessory"];

const GROUP_ORDER: readonly SlotGroup[] = ["identity", "figure", "performance"];

function capabilityBadge(capability: SlotCapability): { readonly label: string; readonly className: string } | null {
  if (capability.status === "unavailable") return { label: "미지원", className: "cl-slot-badge cl-slot-badge--unavailable" };
  if (capability.status === "partial") return { label: "부분 지원", className: "cl-slot-badge cl-slot-badge--partial" };
  return null;
}

interface RasterThumbnailProps {
  readonly raster: CapturedRaster;
  readonly labelKo: string;
}

function RasterThumbnail({ raster, labelKo }: RasterThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const supported = typeof ImageData !== "undefined";
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !supported) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const bytes = new Uint8ClampedArray(raster.width * raster.height * 4);
    bytes.set(raster.rgba.subarray(0, bytes.length));
    context.putImageData(new ImageData(bytes, raster.width, raster.height), 0, 0);
  }, [raster, supported]);
  if (!supported) {
    return <span className="cl-slot-thumb cl-slot-thumb--text">썸네일 표시 불가(ImageData 미지원)</span>;
  }
  return <canvas ref={canvasRef} className="cl-slot-thumb" width={raster.width} height={raster.height} role="img" aria-label={`${labelKo} 썸네일`} />;
}

interface ThumbnailViewProps {
  readonly entry: ThumbnailEntry | undefined;
  readonly labelKo: string;
}

function ThumbnailView({ entry, labelKo }: ThumbnailViewProps) {
  if (!entry) return <span className="cl-slot-thumb cl-slot-thumb--text">썸네일 없음</span>;
  if (entry.status === "pending") return <span className="cl-slot-thumb cl-slot-thumb--pending">생성 중</span>;
  if (entry.status === "failed") {
    return (
      <span className="cl-slot-thumb cl-slot-thumb--failed" title={entry.reasonKo}>
        썸네일 실패: {entry.reasonKo ?? "사유 없음"}
      </span>
    );
  }
  if (!entry.raster) return <span className="cl-slot-thumb cl-slot-thumb--text">썸네일 데이터 없음</span>;
  return <RasterThumbnail raster={entry.raster} labelKo={labelKo} />;
}

interface PresetCardProps {
  readonly entry: PresetEntry;
  readonly selected: boolean;
  readonly capability: SlotCapability;
  readonly conflicts: readonly PresetEntry[];
  readonly unsupported: UnsupportedSlot | undefined;
  readonly thumbnail: ThumbnailEntry | undefined;
  readonly onApply: (presetId: PresetId) => void;
}

function PresetCard({ entry, selected, capability, conflicts, unsupported, thumbnail, onApply }: PresetCardProps) {
  const disabled = capability.status === "unavailable";
  const badge = capabilityBadge(capability);
  const reason = capability.status !== "available" ? capability.reasonKo : undefined;
  const conflictText = conflicts.length > 0 ? `겹침 주의: ${conflicts.map((c) => c.labelKo).join(", ")}` : undefined;
  const unsupportedText = unsupported ? `미적용: ${unsupported.reasonKo}` : undefined;
  const title = [reason, unsupportedText, conflictText].filter((text): text is string => Boolean(text)).join(" / ");
  return (
    <button
      type="button"
      className={`cl-slot-card${selected ? " cl-slot-card--selected" : ""}${disabled ? " cl-slot-card--disabled" : ""}`}
      aria-label={entry.labelKo}
      aria-pressed={selected}
      disabled={disabled}
      title={title || undefined}
      data-preset-id={entry.id}
      onClick={() => onApply(entry.id)}
    >
      <span className="cl-slot-card-thumb">
        <ThumbnailView entry={thumbnail} labelKo={entry.labelKo} />
      </span>
      <span className="cl-slot-card-label">{entry.labelKo}</span>
      {badge ? <span className={badge.className}>{badge.label}</span> : null}
      {unsupportedText ? <span className="cl-slot-badge cl-slot-badge--unsupported">미적용</span> : null}
      {conflictText ? <span className="cl-slot-badge cl-slot-badge--conflict">겹침 주의</span> : null}
      {reason ? <span className="cl-slot-card-reason">{reason}</span> : null}
      {unsupportedText ? <span className="cl-slot-card-reason">{unsupportedText}</span> : null}
    </button>
  );
}

export function SlotPanel() {
  const state = useLabState();
  const dispatch = useDispatch();
  const catalog = useCatalog();
  const { activeSlot: slot } = useUiState();
  const { setActiveSlot } = useUiActions();
  const plan = useApplyPlan();

  const entries = catalog.bySlot(slot);
  const capability = state.capabilities[slot];
  const selectedId = state.recipe.slots[slot];
  const { recipe, thumbnails, history } = state;
  const unsupportedForSlot = plan?.unsupported.find((item) => item.slot === slot);

  const apply = (presetId: PresetId | null): void => {
    dispatch({ type: "slot/apply", slot, presetId });
  };

  return (
    <section className="cl-slot-panel" aria-label="슬롯 프리셋">
      <header className="cl-slot-toolbar">
        <h2 className="cl-slot-title">프리셋</h2>
        <div className="cl-slot-history" role="group" aria-label="되돌리기">
          <button type="button" className="cl-slot-undo" disabled={!history.canUndo} onClick={() => dispatch({ type: "history/undo" })}>
            실행 취소
          </button>
          <button type="button" className="cl-slot-redo" disabled={!history.canRedo} onClick={() => dispatch({ type: "history/redo" })}>
            다시 실행
          </button>
          <span className="cl-slot-history-depth" aria-label="히스토리 깊이">
            {history.depth}단계
          </span>
        </div>
      </header>

      <div className="cl-slot-tabs" role="tablist" aria-label="슬롯">
        {GROUP_ORDER.map((group) => (
          <div key={group} className="cl-slot-tab-group" role="presentation">
            <span className="cl-slot-tab-group-label">{SLOT_GROUP_LABELS_KO[group]}</span>
            {SLOT_GROUPS[group].map((kind) => {
              const kindCapability = state.capabilities[kind];
              const kindBadge = capabilityBadge(kindCapability);
              return (
                <button
                  key={kind}
                  type="button"
                  role="tab"
                  id={`cl-slot-tab-${kind}`}
                  aria-selected={kind === slot}
                  aria-controls={`cl-slot-grid-${kind}`}
                  className={`cl-slot-tab${kind === slot ? " cl-slot-tab--active" : ""}`}
                  title={kindCapability.reasonKo}
                  onClick={() => setActiveSlot(kind)}
                >
                  {SLOT_LABELS_KO[kind]}
                  {kindBadge ? <span className={kindBadge.className}>{kindBadge.label}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div id={`cl-slot-grid-${slot}`} role="tabpanel" aria-labelledby={`cl-slot-tab-${slot}`} className="cl-slot-grid-wrap">
        <p className="cl-slot-grid-caption">
          {SLOT_LABELS_KO[slot]} · {entries.length}개
          {capability.status !== "available" ? <span className="cl-slot-grid-reason"> — {capability.reasonKo ?? "사유 없음"}</span> : null}
        </p>
        {unsupportedForSlot ? (
          <p className="cl-slot-grid-unsupported" role="status">
            현재 선택이 적용되지 않았습니다: {unsupportedForSlot.reasonKo}
          </p>
        ) : null}
        <div className="cl-slot-grid" role="group" aria-label={`${SLOT_LABELS_KO[slot]} 프리셋`}>
          {NULLABLE_SLOTS.includes(slot) ? (
            <button
              type="button"
              className={`cl-slot-card cl-slot-card--none${selectedId === null ? " cl-slot-card--selected" : ""}`}
              aria-pressed={selectedId === null}
              data-preset-id=""
              onClick={() => apply(null)}
            >
              <span className="cl-slot-card-label">없음</span>
            </button>
          ) : null}
          {entries.map((entry) => (
            <PresetCard
              key={entry.id}
              entry={entry}
              selected={selectedId === entry.id}
              capability={capability}
              conflicts={presetConflicts(entry, recipe, catalog)}
              unsupported={unsupportedForSlot && unsupportedForSlot.presetId === entry.id ? unsupportedForSlot : undefined}
              thumbnail={thumbnails[entry.id]}
              onApply={apply}
            />
          ))}
          {entries.length === 0 ? <p className="cl-slot-empty">이 슬롯에 등록된 프리셋이 없습니다.</p> : null}
        </div>
      </div>
      <p className="cl-slot-footer">
        슬롯 {CHARACTER_SLOT_KINDS.length}개 · 프리셋 {catalog.entries.length}개
      </p>
    </section>
  );
}
