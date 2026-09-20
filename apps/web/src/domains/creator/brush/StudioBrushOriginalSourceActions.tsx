import { useLayoutEffect, useRef, useState } from "react";
import { downloadBlob } from "../export/studio-export";
import { decodeStudioBrushOriginalSource, type StudioBrushOriginalSource } from "./studio-brush-original-source";

interface OriginalSourceActionProps {
  readonly source: StudioBrushOriginalSource;
  readonly name: string;
  readonly onError: (message: string) => void;
}

/** Source replacement unmounts the previous download lifecycle before paint. */
export function StudioBrushOriginalSourceActions(props: OriginalSourceActionProps) {
  const { source } = props;
  const identity = JSON.stringify([source.sha256, source.fileName, source.byteLength, source.format, source.encoding]);
  return <OriginalSourceDownload key={identity} {...props} />;
}

function OriginalSourceDownload({ source, name, onError }: OriginalSourceActionProps) {
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  useLayoutEffect(() => () => { epoch.current += 1; inFlight.current = false; }, []);
  function cancel() {
    epoch.current += 1; inFlight.current = false; setBusy(false);
  }
  async function exportOriginal() {
    if (inFlight.current) return;
    const token = ++epoch.current;
    inFlight.current = true; setBusy(true);
    try {
      const { hydrateStudioBrushOriginal } = await import("./studio-brush-original-source-store");
      if (epoch.current !== token) return;
      const original = await hydrateStudioBrushOriginal(source);
      if (epoch.current !== token) return;
      downloadBlob(new Blob([decodeStudioBrushOriginalSource(original)], {
        type: "application/octet-stream",
      }), original.fileName);
    } catch (error) {
      if (epoch.current === token) onError(error instanceof Error ? error.message : "원본 파일을 내보내지 못했습니다.");
    } finally {
      if (epoch.current === token) { inFlight.current = false; setBusy(false); }
    }
  }
  return <div className="space-y-1 border-t border-line/50 px-2 pt-2">
    <p className="text-xs text-fg-3">가져온 원본 보존 · {source.format.toUpperCase()} · {source.byteLength.toLocaleString()} bytes</p>
    <p className="text-xs text-fg-3">원본 파일에는 이후 Studio 편집이 반영되지 않습니다. 내보내기·공유 JSON에는 현재 설정과 원본을 함께 보관합니다. 원본 보존은 원본 엔진의 동일한 그리기 결과를 보장하지 않습니다.</p>
    <button type="button" disabled={busy} onClick={() => void exportOriginal()}
      aria-label={`${name} 원본 파일 내보내기`}
      className="min-h-11 rounded-lg border border-line px-3 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
      {busy ? "원본 확인 중…" : "원본 파일 내보내기"}
    </button>
    {busy ? <button type="button" onClick={cancel} aria-label="원본 파일 내보내기 취소"
      title="이미 시작한 저장소 읽기는 끝날 수 있지만 파일을 내려받지 않습니다."
      className="min-h-11 rounded-lg border border-line px-3 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      취소
    </button> : null}
  </div>;
}
