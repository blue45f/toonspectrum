import { useEffect, useId, useRef, useState } from "react";

import { STUDIO_FOCUS_RING } from "../../studio-panel-ui";
import {
  addCharacterGroomGroup, addCharacterGroomGuide, duplicateCharacterGroomGroup,
  duplicateCharacterGroomGuide, editCharacterGroomGroup,
} from "../groom/character-groom-edit";
import { validateCharacterGroomDocument } from "../groom/character-groom-document";

import type { CharacterGroomDocument, CharacterGroomProfile } from "../groom/character-groom-document";
import type { CharacterGroomRuntimeState } from "../groom/use-character-groom-runtime";
import type { CharacterDocumentV3 } from "../document/character-document-v3";
import type { CharacterAuthoringAuthorityHookResult } from "./use-character-authoring-authority";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

const BUTTON = cn("min-h-11 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40", STUDIO_FOCUS_RING);
const INPUT = cn("min-h-11 w-full rounded-lg border border-line bg-panel px-2 text-sm text-fg disabled:opacity-40", STUDIO_FOCUS_RING);

export function CharacterGroomPanel({ authoring, runtime }: {
  readonly authoring: CharacterAuthoringAuthorityHookResult;
  readonly runtime: CharacterGroomRuntimeState;
}) {
  const t = useT();
  const prefix = `groom-preview/${useId()}`;
  const sequence = useRef(0);
  const [draft, setDraft] = useState<{ readonly base: CharacterDocumentV3; readonly groom: CharacterGroomDocument } | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [pointIndex, setPointIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const snapshot = authoring.snapshot;
  const activeDraft = draft?.base === snapshot.document ? draft : null;
  const groom = activeDraft?.groom ?? snapshot.document.groom;
  const group = groom.groups.find((candidate) => candidate.groupId === selectedGroupId) ?? groom.groups[0];
  const guide = group?.guides.find((candidate) => candidate.guideId === selectedGuideId) ?? group?.guides[0];
  const selectedPointIndex = guide ? Math.min(pointIndex, guide.points.length - 1) : 0;
  const point = guide?.points[selectedPointIndex];
  const ownPreview = snapshot.previewCommandId?.startsWith(prefix) === true;
  const foreignPreview = snapshot.previewDocument !== null && !ownPreview;
  const disabled = !authoring.hydrated || !runtime.supported || foreignPreview;
  const groupDisabled = disabled || !group || group.locked;
  const anchored = guide?.points.some((entry) => entry.surfaceAnchor) === true;
  const anchorAttached = guide !== undefined && runtime.attachedGuideIds?.includes(guide.guideId) === true;
  useEffect(() => () => {
    if (authoring.authority.getSnapshot().previewCommandId?.startsWith(prefix)) {
      authoring.authority.cancelPreview();
    }
  }, [authoring.authority, prefix]);

  function preview(next: CharacterGroomDocument): boolean {
    if (ownPreview) authoring.cancelPreview();
    const receipt = authoring.beginPreview({
      commandId: `${prefix}/${++sequence.current}`,
      label: t("studio.character.groom.editLabel", "헤어 가이드 편집"),
      source: "user",
      expectedDocumentId: snapshot.document.documentId,
      expectedRevision: snapshot.document.revision,
      operations: [{ kind: "replace-groom", groom: next }],
    });
    if (receipt.status !== "applied") {
      setError(receipt.reason ?? t("studio.character.groom.previewFailure", "헤어를 미리 볼 수 없습니다."));
      return false;
    }
    setError(null);
    return true;
  }

  function change(edit: (value: CharacterGroomDocument) => CharacterGroomDocument) {
    if (disabled) return;
    try {
      const next = validateCharacterGroomDocument(edit(groom));
      setDraft({ base: snapshot.document, groom: next });
      setError(null);
      if (ownPreview) preview(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("studio.character.groom.editFailure", "헤어를 수정하지 못했습니다."));
    }
  }

  function profileChange(key: keyof Pick<CharacterGroomProfile, "baseWidth" | "lengthScale" | "curl" | "wave" | "taper" | "rootRotation">, value: number) {
    if (!group) return;
    change((current) => editCharacterGroomGroup(current, group.groupId, (entry) => ({
      ...entry, profile: { ...entry.profile, [key]: value },
    })));
  }

  function cancel() {
    if (ownPreview) authoring.cancelPreview();
    setDraft(null);
    setError(null);
  }

  const profileControls = [
    { key: "lengthScale", label: t("studio.character.groom.length", "길이 배율"), min: 0.1, max: 4, step: 0.05 },
    { key: "baseWidth", label: t("studio.character.groom.width", "가닥 폭 (m)"), min: 0.005, max: 0.25, step: 0.005 },
    { key: "curl", label: t("studio.character.groom.curl", "말림"), min: 0, max: 1, step: 0.05 },
    { key: "wave", label: t("studio.character.groom.wave", "물결"), min: 0, max: 1, step: 0.05 },
    { key: "taper", label: t("studio.character.groom.taper", "끝 가늘기"), min: 0, max: 1, step: 0.05 },
    { key: "rootRotation", label: t("studio.character.groom.rotation", "뿌리 회전 (rad)"), min: -Math.PI, max: Math.PI, step: 0.05 },
  ] as const;

  return <section aria-label={t("studio.character.groom.panel", "헤어 가이드 편집")} className="space-y-3">
    <p className="text-xs leading-relaxed text-fg-3">{t("studio.character.groom.description", "새 가이드는 머리 본 로컬 좌표(m)로 편집합니다. 불러온 두피 루트 앵커는 확인된 원본 표면과 스킨을 따라 표시합니다. 미리보기를 적용하면 원본 가이드와 곡선 설정이 저장됩니다.")}</p>
    {!authoring.hydrated ? <p role="status" className="text-xs text-fg-3">{t("studio.character.groom.restoring", "저장된 캐릭터 원본을 복원하는 중입니다.")}</p> : null}
    {!runtime.supported ? <p role="status" className="text-xs text-warn">{t("studio.character.groom.unsupported", "실제 머리 본이 있는 VRM 모델에서 헤어를 편집할 수 있습니다.")}</p> : null}
    {foreignPreview ? <p role="status" className="text-xs text-warn">{t("studio.character.groom.otherPreview", "다른 도구의 미리보기를 적용하거나 취소한 뒤 편집할 수 있습니다.")}</p> : null}
    <label className="block space-y-1 text-xs text-fg-2">
      <span>{t("studio.character.groom.group", "헤어 그룹")}</span>
      <select className={INPUT} value={group?.groupId ?? ""} disabled={disabled || groom.groups.length === 0} onChange={(event) => { setSelectedGroupId(event.currentTarget.value); setSelectedGuideId(null); setPointIndex(0); }}>
        {groom.groups.length === 0 ? <option value="">{t("studio.character.groom.empty", "그룹을 추가해 시작하세요")}</option> : null}
        {groom.groups.map((entry) => <option key={entry.groupId} value={entry.groupId}>{entry.name}</option>)}
      </select>
    </label>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={BUTTON} disabled={disabled} onClick={() => change((current) => {
        const next = addCharacterGroomGroup(current, `${t("studio.character.groom.newGroup", "헤어 그룹")} ${current.groups.length + 1}`);
        setSelectedGroupId(next.groups.at(-1)?.groupId ?? null); setSelectedGuideId(null); setPointIndex(0); return next;
      })}>{t("studio.character.groom.addGroup", "그룹 추가")}</button>
      <button type="button" className={BUTTON} disabled={groupDisabled} onClick={() => group && change((current) => {
        const next = duplicateCharacterGroomGroup(current, group.groupId);
        setSelectedGroupId(next.groups.at(-1)?.groupId ?? null); setSelectedGuideId(null); return next;
      })}>{t("studio.character.groom.duplicateGroup", "그룹 복제")}</button>
      <button type="button" className={BUTTON} disabled={groupDisabled} onClick={() => group && change((current) => ({ ...current, groups: current.groups.filter((entry) => entry.groupId !== group.groupId) }))}>{t("studio.character.groom.deleteGroup", "그룹 삭제")}</button>
    </div>
    {group ? <>
      <label className="block space-y-1 text-xs text-fg-2"><span>{t("studio.character.groom.name", "그룹 이름")}</span><input className={INPUT} value={group.name} maxLength={100} disabled={groupDisabled} onChange={(event) => { const name = event.currentTarget.value; change((current) => editCharacterGroomGroup(current, group.groupId, (entry) => ({ ...entry, name }))); }} /></label>
      <button type="button" role="switch" aria-checked={group.visible} className={BUTTON} disabled={groupDisabled} onClick={() => change((current) => editCharacterGroomGroup(current, group.groupId, (entry) => ({ ...entry, visible: !entry.visible })))}>{t("studio.character.groom.visible", "그룹 표시")}</button>
      {group.locked ? <p className="text-xs text-warn">{t("studio.character.groom.locked", "잠긴 그룹입니다. 원본 보호를 위해 편집할 수 없습니다.")}</p> : null}
      <div className="grid grid-cols-2 gap-2">{profileControls.map((control) => <label className="space-y-1 text-xs text-fg-2" key={control.key}>
        <span>{control.label}</span><input type="number" className={INPUT} min={control.min} max={control.max} step={control.step} value={group.profile[control.key]} disabled={groupDisabled} onChange={(event) => profileChange(control.key, event.currentTarget.valueAsNumber)} />
      </label>)}</div>
      <label className="block space-y-1 text-xs text-fg-2"><span>{t("studio.character.groom.guide", "헤어 가이드")}</span><select className={INPUT} value={guide?.guideId ?? ""} disabled={groupDisabled || group.guides.length === 0} onChange={(event) => { setSelectedGuideId(event.currentTarget.value); setPointIndex(0); }}>
        {group.guides.length === 0 ? <option value="">{t("studio.character.groom.emptyGuide", "가이드를 추가하세요")}</option> : null}
        {group.guides.map((entry, index) => <option key={entry.guideId} value={entry.guideId}>{t("studio.character.groom.guideLabel", "가이드")} {index + 1}</option>)}
      </select></label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} disabled={groupDisabled || group.scalpRegionId !== "scalp:head-local"} onClick={() => change((current) => {
          const next = addCharacterGroomGuide(current, group.groupId); setSelectedGuideId(next.groups.find((entry) => entry.groupId === group.groupId)?.guides.at(-1)?.guideId ?? null); setPointIndex(0); return next;
        })}>{t("studio.character.groom.addGuide", "가이드 추가")}</button>
        <button type="button" className={BUTTON} disabled={groupDisabled || !guide || anchored} onClick={() => guide && change((current) => {
          const next = duplicateCharacterGroomGuide(current, group.groupId, guide.guideId); setSelectedGuideId(next.groups.find((entry) => entry.groupId === group.groupId)?.guides.at(-1)?.guideId ?? null); return next;
        })}>{t("studio.character.groom.duplicateGuide", "가이드 복제")}</button>
        <button type="button" className={BUTTON} disabled={groupDisabled || !guide} onClick={() => guide && change((current) => editCharacterGroomGroup(current, group.groupId, (entry) => ({ ...entry, guides: entry.guides.filter((candidate) => candidate.guideId !== guide.guideId) })))}>{t("studio.character.groom.deleteGuide", "가이드 삭제")}</button>
      </div>
      {guide && point ? <fieldset disabled={groupDisabled || anchored} className="space-y-2 rounded-xl border border-line p-2">
        <legend className="px-1 text-xs text-fg-2">{t("studio.character.groom.curve", "선택 가이드 곡선")}</legend>
        <label className="block text-xs text-fg-2"><span>{t("studio.character.groom.controlPoint", "제어점")}</span><select className={INPUT} value={selectedPointIndex} onChange={(event) => setPointIndex(Number(event.currentTarget.value))}>{guide.points.map((entry, index) => <option key={index} value={index}>{index === 0 ? t("studio.character.groom.root", "뿌리") : `${t("studio.character.groom.point", "점")} ${index + 1}`}</option>)}</select></label>
        <div className="grid grid-cols-3 gap-2">{(["X", "Y", "Z"] as const).map((axis, axisIndex) => <label key={axis} className="text-xs text-fg-2"><span>{axis} (m)</span><input type="number" className={INPUT} min={-2} max={2} step={0.005} value={point.position[axisIndex]} onChange={(event) => {
          const value = event.currentTarget.valueAsNumber;
          change((current) => editCharacterGroomGroup(current, group.groupId, (entry) => ({ ...entry, guides: entry.guides.map((candidate) => candidate.guideId !== guide.guideId ? candidate : { ...candidate, points: candidate.points.map((control, index) => {
            if (index !== selectedPointIndex) return control;
            const position: [number, number, number] = [...control.position]; position[axisIndex] = value; return { ...control, position };
          }) }) })));
        }} /></label>)}</div>
      </fieldset> : null}
      {anchored || group.scalpRegionId !== "scalp:head-local" ? <p role="status" className="text-xs text-warn">{anchorAttached
        ? t("studio.character.groom.anchorAttached", "두피 루트 앵커가 원본 표면에 부착되었습니다. 포즈·표정 변형을 따라 표시하며 길이·폭·표시를 편집할 수 있습니다. 앵커 좌표 재배치와 자동 재투영은 지원하지 않습니다.")
        : t("studio.character.groom.anchorPending", "불러온 두피 표면과 루트 앵커를 확인하기 전에는 메시로 표시하지 않습니다. 다른 topology, 여러 점의 앵커, 별도 primitive는 원본을 보존합니다.")}</p> : null}
    </> : null}
    <div className="flex flex-wrap gap-2 border-t border-line pt-3">
      <button type="button" className={BUTTON} disabled={disabled || !activeDraft} onClick={() => preview(groom)}>{t("studio.character.groom.preview", "헤어 미리보기")}</button>
      <button type="button" className={cn(BUTTON, "border-accent/50 text-accent")} disabled={disabled || !ownPreview || runtime.status !== "ready"} onClick={() => {
        const receipt = authoring.commitPreview();
        if (receipt?.status === "applied") { setDraft(null); setError(null); }
        else setError(receipt?.reason ?? t("studio.character.groom.applyFailure", "헤어를 적용하지 못했습니다."));
      }}>{t("studio.character.groom.apply", "헤어 적용")}</button>
      <button type="button" className={BUTTON} disabled={!activeDraft && !ownPreview} onClick={cancel}>{t("studio.character.groom.cancel", "헤어 취소")}</button>
      <button type="button" className={BUTTON} disabled={!authoring.hydrated || foreignPreview || !snapshot.canUndo} onClick={() => { cancel(); authoring.undo(); }}>{t("studio.character.groom.undo", "저작 실행 취소")}</button>
    </div>
    <p role="status" className="text-xs text-fg-3">{runtime.status === "building" ? t("studio.character.groom.building", "실제 헤어 메시 생성 중…") : ownPreview ? t("studio.character.groom.previewing", "미리보기 중 · 적용 전 원본은 유지됩니다.") : activeDraft ? t("studio.character.groom.draft", "수정 중 · 헤어 미리보기로 실제 모양을 확인하세요.") : t("studio.character.groom.saved", "적용한 원본 가이드는 캐릭터 저장·내보내기에 포함됩니다.")} {runtime.guideCount} {t("studio.character.groom.guideCount", "가이드")} · {runtime.triangleCount} {t("studio.character.groom.triangleCount", "삼각형")}</p>
    {runtime.notices?.map((notice) => <p key={notice} role="status" className="text-xs text-warn">{notice}</p>)}
    {runtime.skippedGuideCount > 0 ? <p role="status" className="text-xs text-warn">{runtime.skippedGuideCount} {t("studio.character.groom.skipped", "가이드의 표면 또는 토폴로지를 확인할 수 없어 메시 표시를 보류했습니다. 원본은 보존됩니다.")}</p> : null}
    {runtime.skippedGuideCount > 0 ? <button type="button" className={BUTTON} disabled={runtime.status === "building"} onClick={runtime.retry}>{t("studio.character.groom.retrySurface", "표면 다시 확인")}</button> : null}
    {error || runtime.error ? <div className="space-y-2"><p role="alert" className="text-xs text-bad">{error ?? runtime.error}</p>{runtime.error ? <button type="button" className={BUTTON} onClick={runtime.retry}>{t("studio.character.groom.retry", "메시 생성 다시 시도")}</button> : null}</div> : null}
  </section>;
}
