import { useState } from "react";
import { parseStudioPsdSource, type StudioPsdSource } from "./studio-psd-source";
import { buttonClass } from "@/shared/components/ui/button-utils";

/** 현재 문서에 연결된 원본만 표시한다. 다른 문서의 로컬 원본 목록은 노출하지 않는다. */
export function StudioPsdSourceDownloads({ pages }: {
  readonly pages?: readonly { readonly elements: readonly object[] }[] | null;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sources = new Map<string, StudioPsdSource>();
  for (const page of pages ?? []) for (const element of page.elements) {
    if (!("psdSource" in element)) continue;
    const source = parseStudioPsdSource(element.psdSource);
    if (source) sources.set(source.hash, source);
  }
  if (!sources.size) return null;
  const download = async (source: StudioPsdSource) => {
    setBusy(true);
    setStatus(null);
    try {
      const { downloadStudioPsdSource } = await import("./studio-psd-source");
      await downloadStudioPsdSource(source);
      setStatus(`${source.name} 원본을 내려받았어요.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "PSD 원본을 읽지 못했어요.");
    } finally { setBusy(false); }
  };
  return <div className="flex w-full flex-wrap items-center gap-2" aria-label="연결된 PSD 원본">
    {[...sources.values()].map((source) => <button key={source.hash} type="button" disabled={busy}
      data-project-keep-open className={buttonClass({ size: "sm", variant: "quiet", className: "min-h-11 max-w-full whitespace-normal break-all" })}
      onClick={() => void download(source)}>PSD 원본 받기 · {source.name}</button>)}
    {status ? <span role="status" className="text-xs">{status}</span> : null}
  </div>;
}
