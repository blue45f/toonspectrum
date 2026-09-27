import { useId, useState } from "react";

import { STUDIO_FOCUS_RING } from "../../studio-panel-ui";
import { type CharacterPoseEffectorBone } from "./character-pose-runtime-adapter";
import type { CharacterPoseRuntime } from "./use-character-pose-runtime";

import { cn } from "@/shared/lib/utils";
import { useT } from "@/shared/lib/i18n";

const BUTTON = cn("min-h-11 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg hover:bg-raised disabled:opacity-40 disabled:cursor-not-allowed", STUDIO_FOCUS_RING);
const LABELS: Record<CharacterPoseEffectorBone, string> = { leftHand: "왼손", rightHand: "오른손", leftFoot: "왼발", rightFoot: "오른발" };

export function CharacterPoseV3Panel({ runtime }: { readonly runtime: CharacterPoseRuntime }) {
  const t = useT();
  const id = useId();
  const [selected, setSelected] = useState<CharacterPoseEffectorBone>("leftHand");
  const [offset, setOffset] = useState<readonly [number, number, number]>([0, 0, 0]);
  const effector = runtime.effectors.includes(selected) ? selected : runtime.effectors[0];
  const disabled = !runtime.ready || runtime.blockedByPreview;
  return <section className="space-y-3 rounded-2xl border border-line bg-card/70 p-3" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} className="text-sm font-bold text-fg">{t("studio.character.poseV3.title", "포즈 · 관절과 발 고정")}</h3>
    <p className="text-xs leading-relaxed text-fg-3">{t("studio.character.poseV3.description", "선택한 부위만 실제 뼈대에서 보정합니다. 관절 한계와 팔다리 길이를 유지하며, 미리보기 후 저장할 수 있습니다.")}</p>
    {!runtime.supported ? <p role="status" className="text-xs text-fg-2">{runtime.reason}</p> : null}
    {runtime.pending ? <p role="status" aria-live="polite" className="text-xs text-fg-2">{t("studio.character.poseV3.pending", "포즈를 화면에 적용하는 중입니다.")}</p> : null}
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-fg">
      <input type="checkbox" className={cn("size-5 accent-accent", STUDIO_FOCUS_RING)} checked={runtime.preserveFootPlant} disabled={runtime.blockedByPreview} onChange={(event) => runtime.setPreserveFootPlant(event.currentTarget.checked)} />
      {t("studio.character.poseV3.footPlant", "현재 발 위치 고정")}
    </label>
    <p className="text-xs text-fg-3">{t("studio.character.poseV3.footPlantHelp", "발 고정은 현재 발목 접점을 유지합니다. 모델의 발바닥 형태를 자동 추정하지 않습니다. 발을 이동하려면 고정을 해제하세요.")}</p>
    <button type="button" className={cn(BUTTON, "w-full")} disabled={disabled} onClick={runtime.previewStabilization}>{t("studio.character.poseV3.stabilize", "선택 부위 자연스럽게 보정 · 미리보기")}</button>
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-xs font-semibold text-fg">{t("studio.character.poseV3.target", "손·발 위치 수정")}</legend>
      <label htmlFor={`${id}-effector`} className="text-xs text-fg-2">{t("studio.character.poseV3.part", "끝 관절")}</label>
      <select id={`${id}-effector`} className={cn(BUTTON, "w-full")} value={effector ?? ""} onChange={(event) => {
        const value = runtime.effectors.find((bone) => bone === event.currentTarget.value);
        if (value) setSelected(value);
      }}>
        {runtime.effectors.map((bone) => <option key={bone} value={bone}>{t(`studio.character.poseV3.${bone}`, LABELS[bone])}</option>)}
      </select>
      {([0, 1, 2] as const).map((axis) => <label key={axis} className="block text-xs text-fg-2">
        {t(`studio.character.poseV3.offset${axis}`, ["좌우 이동", "높이 이동", "앞뒤 이동"][axis])}: {Math.round(offset[axis] * 100)} cm
        <input aria-label={t(`studio.character.poseV3.offset${axis}`, ["좌우 이동", "높이 이동", "앞뒤 이동"][axis])} type="range" className={cn("min-h-11 w-full accent-accent", STUDIO_FOCUS_RING)} min={-0.4} max={0.4} step={0.01} value={offset[axis]} onChange={(event) => {
          const next: [number, number, number] = [...offset];
          next[axis] = Number(event.currentTarget.value); setOffset(next);
        }} />
      </label>)}
      <button type="button" className={cn(BUTTON, "w-full")} disabled={!effector || (runtime.preserveFootPlant && Boolean(effector?.endsWith("Foot")))} onClick={() => { if (effector) runtime.previewTarget(effector, offset); }}>{t("studio.character.poseV3.previewTarget", "위치 수정 미리보기")}</button>
    </fieldset>
    {runtime.previewing ? <div className="grid grid-cols-2 gap-2">
      <button type="button" className={cn(BUTTON, "border-accent bg-accent text-on-accent")} disabled={runtime.pending || Boolean(runtime.runtimeError)} onClick={runtime.apply}>{t("studio.character.poseV3.apply", "포즈 적용")}</button>
      <button type="button" className={BUTTON} onClick={runtime.cancel}>{t("studio.character.poseV3.cancel", "미리보기 취소")}</button>
    </div> : null}
    <button type="button" className={cn(BUTTON, "w-full")} disabled={!runtime.canUndo || runtime.blockedByPreview} onClick={runtime.undo}>{t("studio.character.poseV3.undo", "실행 취소")}</button>
    {runtime.runtimeError ? <div role="alert" className="space-y-2 text-xs text-danger"><p>{runtime.runtimeError}</p><button type="button" className={BUTTON} onClick={runtime.retryRuntime}>{t("studio.character.poseV3.retry", "포즈 연결 다시 시도")}</button></div> : null}
    {runtime.message ? <p role="status" aria-live="polite" className="text-xs leading-relaxed text-fg-2">{runtime.message}</p> : null}
    <p className="text-xs text-fg-3">{t("studio.character.poseV3.limits", "정규화된 VRM 사람형 모델에서 사용할 수 있습니다. 손가락은 기존 손 모양 편집을 사용하며, 도달할 수 없는 목표는 남은 오차를 안내합니다.")}</p>
  </section>;
}
