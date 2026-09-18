import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
/** Blender package preflight and explicit local model handoff. No Blender/server execution. */
import { FileJson, FolderOpen, Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { prepareBlenderCharacterPackage } from "../vrm/studio-vrm-blender-package-import";

import type { BlenderPackagePreview } from "../vrm/studio-vrm-blender-package-import";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";
import type { ChangeEvent } from "react";

import { cn } from "@/shared/lib/utils";

export const CHARACTER_SHAPER_BLENDER_DOC_PATH = "docs/studio/blender-character-pipeline.md";
export interface CharacterShaperBlenderPackageProps { readonly h: StudioVrmPoserHost; readonly disabled?: boolean }
type PackageState =
  | { readonly kind: "idle" }
  | { readonly kind: "reading" }
  | { readonly kind: "error"; readonly reason: string }
  | { readonly kind: "preview"; readonly value: BlenderPackagePreview }
  | { readonly kind: "installing" }
  | { readonly kind: "sent"; readonly name: string };
const BUTTON = cn(
  "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-[0.75rem] font-semibold text-fg-2",
  "transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none", STUDIO_FOCUS_RING,
);
function reasonOf(error: unknown): string { return error instanceof Error && error.message ? error.message : "패키지를 읽지 못했습니다."; }

export function CharacterShaperBlenderPackage({ h, disabled = false }: CharacterShaperBlenderPackageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const taskRef = useRef<AbortController | null>(null);
  const installingRef = useRef(false);
  const statusId = useId();
  const [state, setState] = useState<PackageState>({ kind: "idle" });
  const [prefer, setPrefer] = useState<"vrm" | "glb">("vrm");
  useEffect(() => () => { taskRef.current?.abort(); }, []);
  const busy = state.kind === "reading" || state.kind === "installing";

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    if (!files.length || disabled || installingRef.current) return;
    taskRef.current?.abort();
    const task = new AbortController();
    taskRef.current = task;
    setState({ kind: "reading" });
    void prepareBlenderCharacterPackage(files, { prefer, signal: task.signal }).then((value) => {
      if (!task.signal.aborted) setState({ kind: "preview", value });
    }).catch((error: unknown) => {
      if (!task.signal.aborted) setState({ kind: "error", reason: reasonOf(error) });
    });
  };
  const install = async () => {
    if (disabled || state.kind !== "preview" || installingRef.current) return;
    const { value } = state;
    const task = taskRef.current;
    if (task?.signal.aborted) return;
    installingRef.current = true;
    setState({ kind: "installing" });
    try {
      if (typeof h.handleGeneratedVrmFile !== "function") throw new Error("이 화면에서는 모델을 설치할 수 없습니다.");
      await h.handleGeneratedVrmFile(value.runtimeFile);
      // The host queues loading and may report its own error: do not claim a completed render here.
      if (!task?.signal.aborted) setState({ kind: "sent", name: value.manifest.displayName });
    } catch (error: unknown) {
      if (!task?.signal.aborted) setState({ kind: "error", reason: reasonOf(error) });
    } finally { installingRef.current = false; }
  };
  return (
    <section aria-label={translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "Blender 캐릭터 패키지")} aria-busy={busy} className="space-y-2">
      <p className="text-[0.7rem] leading-relaxed text-fg-3">
        {translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "Blender에서 내보낸 ")}<code>character-package.json</code>{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "과 모델 파일, 폴더 또는 ")}<code>.toonchar.zip</code>{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "을 선택하세요. 파일은 서버로 보내지 않고 이 기기에서 검증합니다. 브라우저에서 Blender를 실행하지는 않습니다.")}</p>
      <details className="text-[0.7rem] leading-relaxed text-fg-3">
        <summary className={cn("cursor-pointer rounded py-2", STUDIO_FOCUS_RING)}>{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "Blender에서 준비하는 방법과 지원 범위")}</summary>
        <p>{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "Blender의 ToonStudio 패널에서 Export Edited Character Package를 누르면 현재 수정본이 새 리비전으로 저장됩니다. 원본 .blend는 로컬에 보관되며 ZIP에는 실행용 모델과 검토 자료만 포함됩니다.")}</p>
        <p>{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", ".blend 직접 실행, 실시간 양방향 동기화, Cycles 재질의 완전한 재현은 지원하지 않습니다. GLB는 VRM 전용 포즈·표정 기능이 제한될 수 있습니다. SHA-256은 파일 일치 여부를 확인하며 제작자 신원을 인증하지 않습니다.")}</p>
        <p>{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "설치·제작 문서: ")}<code>{CHARACTER_SHAPER_BLENDER_DOC_PATH}</code></p>
      </details>
      <label className="block space-y-1 text-[0.7rem] text-fg-3">
        <span>{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "불러올 모델 우선순위")}</span>
        <select value={prefer} disabled={disabled || busy} onChange={(event) => {
          setPrefer(event.currentTarget.value === "glb" ? "glb" : "vrm");
          taskRef.current?.abort(); setState({ kind: "idle" });
        }} className={cn("min-h-11 w-full rounded-lg border border-line bg-card px-2 text-fg", STUDIO_FOCUS_RING)}>
          <option value="vrm">{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "VRM 우선 · 캐릭터 포즈·표정용")}</option>
          <option value="glb">{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "GLB 우선 · 범용 3D 모델용")}</option>
        </select>
      </label>
      <button type="button" disabled={disabled || busy} aria-describedby={statusId} onClick={() => inputRef.current?.click()} className={BUTTON}>
        {busy ? <Loader2 size={14} aria-hidden className="animate-spin motion-reduce:animate-none" /> : <FileJson size={14} aria-hidden />}
        {translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "Blender 캐릭터 패키지 불러오기")}</button>
      <button type="button" disabled={disabled || busy} onClick={() => folderRef.current?.click()} className={BUTTON}>
        <FolderOpen size={14} aria-hidden />{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "패키지 폴더 선택")}</button>
      <input ref={inputRef} type="file" multiple accept=".json,.vrm,.glb,.zip,application/json,application/zip" disabled={disabled || busy}
        aria-label={translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "Blender 캐릭터 패키지 파일 선택")} className="sr-only" tabIndex={-1} onChange={onChange} />
      <input ref={folderRef} type="file" multiple {...{ webkitdirectory: "" }} disabled={disabled || busy}
        aria-label={translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "Blender 캐릭터 패키지 폴더 선택")} className="sr-only" tabIndex={-1} onChange={onChange} />
      {state.kind === "reading" && <button type="button" className={BUTTON} onClick={() => {
        taskRef.current?.abort(); setState({ kind: "idle" });
      }}>{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "검증 취소")}</button>}
      {state.kind === "preview" && <div className="space-y-2 rounded-xl border border-line bg-raised p-3" aria-label={translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "검증된 Blender 패키지 정보")}>
        <p className="text-sm font-semibold text-fg">{state.value.manifest.displayName}</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[0.7rem] text-fg-2">
          <dt>{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "파일")}</dt><dd>{state.value.asset.role.toUpperCase()} · {(state.value.runtimeFile.size / 1_000_000).toFixed(2)} MB</dd>
          <dt>{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "품질 점수")}</dt><dd>{state.value.manifest.quality.score} {translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "/ 100 · 기준 ")}{state.value.manifest.quality.minimumScore}</dd>
          <dt>{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "메시 / 스킨")}</dt><dd>{state.value.meshes} / {state.value.skins}</dd>
          <dt>{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "변형 타깃 / 애니메이션")}</dt><dd>{state.value.morphTargets} / {state.value.animations}</dd>
          <dt>{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "무결성")}</dt><dd>{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "SHA-256 일치")}</dd>
        </dl>
        {!state.value.hasVrm && <p className="text-[0.7rem] text-fg-3">{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "VRM 확장이 없는 GLB입니다. VRM 전용 포즈·표정 기능은 제한됩니다.")}</p>}
        <p className="text-[0.7rem] text-fg-3">{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "아직 현재 모델은 바뀌지 않았습니다. 아래 버튼을 누르면 모델 로더에 전달합니다.")}</p>
        <button type="button" disabled={disabled} onClick={() => { void install(); }} className={BUTTON}>{translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "검증한 모델을 스튜디오로 가져오기")}</button>
      </div>}
      <p id={statusId} role="status" aria-live="polite" className={cn("text-[0.68rem] leading-relaxed", state.kind === "error" ? "text-bad" : "text-fg-3")}>
        {state.kind === "error" ? formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "불러오지 못했습니다 — {v0}"), { v0: String(state.reason) })
          : state.kind === "reading" ? translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "패키지 구조·품질·SHA-256을 확인하는 중입니다.")
          : state.kind === "preview" ? translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "검증을 통과했습니다. 모델 정보를 확인하고 가져오기를 눌러 주세요.")
          : state.kind === "installing" ? translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "검증한 모델을 전달하는 중입니다.")
          : state.kind === "sent" ? formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "{v0} 파일을 모델 로더에 전달했습니다. 최종 결과는 모델 화면에서 확인하세요."), { v0: String(state.name) })
          : translateCurrentStaticSourceText("domains.creator.character.shaper.CharacterShaperBlenderPackage", "ko", "아직 불러온 패키지가 없습니다.")}
      </p>
    </section>
  );
}
