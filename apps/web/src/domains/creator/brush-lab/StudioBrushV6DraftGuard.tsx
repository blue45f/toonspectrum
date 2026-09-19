import { downloadBrushStudioSource } from "./brush-studio-source-download";
import { useState, type ReactNode } from "react";
import { createBrushStudioV6Program, type BrushStudioV6Program } from "./brush-studio-v6-engine";
import { parseBrushStudioV6Import } from "./brush-studio-v6-experiments";


function readDraft(scope: string) {
  let raw: string | null = null;
  try {
    raw = globalThis.localStorage?.getItem(`toonspectrum.brush-program-v6:${encodeURIComponent(scope)}`) ?? null;
    return { program: raw === null ? createBrushStudioV6Program() : parseBrushStudioV6Import(raw), raw, error: null };
  } catch (error) {
    return { program: null, raw, error: error instanceof Error ? error.message : "브러시 설정을 읽지 못했습니다." };
  }
}

/** Do not mount an autosaving editor when restoring an execution-bound draft failed. */
export function StudioBrushV6DraftGuard({ scope, initialProgram, children }: {
  readonly scope: string;
  readonly initialProgram?: BrushStudioV6Program;
  readonly children: (program: BrushStudioV6Program) => ReactNode;
}) {
  const [draft] = useState(() => initialProgram ? { program: initialProgram, raw: null, error: null } : readDraft(scope));
  if (draft.program) return children(draft.program);
  return <section role="alert" className="space-y-3 rounded-2xl border border-warning p-4">
    <h2 className="font-bold">브러시 원본을 변경하지 않고 보존했습니다</h2>
    <p className="text-sm">{draft.error}</p>
    <p className="text-sm">다른 엔진이나 기본 브러시로 바꾸지 않았습니다. 원본을 보관한 뒤 지원되는 브러시를 선택하세요.</p>
    {draft.raw !== null && <button type="button" className="min-h-11 rounded border px-3"
      onClick={() => downloadBrushStudioSource(draft.raw!, "brush-original.json")}>원본 JSON 보관</button>}
    <a href="/studio/assets/brushes" className="inline-flex min-h-11 items-center px-3">브러시 목록으로</a>
  </section>;
}
