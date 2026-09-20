import { downloadBlob } from "../export/studio-export";
import { decodeStudioBrushOriginalSource, requireStudioBrushOriginalSource,
  type StudioBrushOriginalSource } from "./studio-brush-original-source";

/** A preserved source is not a claim that the mapped Studio renderer executes that source engine. */
export function StudioBrushOriginalSourceActions({ name, source, onError }: {
  readonly name: string;
  readonly source: StudioBrushOriginalSource;
  readonly onError: (message: string) => void;
}) {
  const download = () => {
    try {
      const verified = requireStudioBrushOriginalSource(source);
      downloadBlob(new Blob([decodeStudioBrushOriginalSource(verified)],
        { type: "application/octet-stream" }), verified.fileName);
    } catch (error) {
      onError(error instanceof Error ? error.message : "원본 파일을 확인하지 못해 내보내지 않았습니다.");
    }
  };
  return <div className="mt-2 space-y-1 border-t border-line/50 pt-2">
    <p className="text-xs text-fg-3">{source.format.toUpperCase()} 가져온 원본 보존 · {source.byteLength.toLocaleString()}바이트</p>
    <p className="text-xs text-fg-3">이후 Studio 편집은 원본 파일에 반영되지 않습니다. JSON 내보내기·공유에는 현재 설정과 원본을 함께 보관합니다. 원본 보존은 같은 엔진으로 그린다는 의미가 아닙니다.</p>
    <button type="button" onClick={download} aria-label={`${name} 가져온 원본 다운로드`}
      className="min-h-11 rounded-lg border border-line px-3 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      가져온 원본 다운로드
    </button>
  </div>;
}
