import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { ScanLine } from "lucide-react";
import { useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";

import type { DrawEl, El } from "./studio-element-model";
import { vectorizeStudioRasterImage } from "./studio-raster-vectorize-product";

type StudioVectorizableImage = Extract<El, { type: "image" }>;

export function StudioRasterVectorizeButton({
  src,
  image,
  disabled = false,
  onInsert,
}: {
  readonly src: string;
  readonly image: StudioVectorizableImage;
  readonly disabled?: boolean;
  readonly onInsert: (elements: readonly DrawEl[]) => boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const run = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setStatus("외곽선을 분석하는 중…");
    try {
      const result = await vectorizeStudioRasterImage(src, image);
      if (!onInsert(result.elements)) throw new Error("벡터 레이어를 현재 문서에 추가하지 못했습니다.");
      setStatus(`벡터 외곽선 ${result.elements.length}개를 새 레이어로 추가했습니다.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "이미지를 벡터로 변환하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-lg border border-line bg-card/50 p-2">
      <button type="button" disabled={busy || disabled} onClick={() => void run()} className={buttonClass({ variant: "outline", size: "sm", className: "w-full gap-2" })}>
        <ScanLine size={14} aria-hidden="true" />
        {busy ? translateCurrentStaticSourceText("domains.creator.StudioRasterVectorizeButton", "ko", "벡터화 중…") : translateCurrentStaticSourceText("domains.creator.StudioRasterVectorizeButton", "ko", "이미지를 벡터 외곽선으로 변환")}
      </button>
      {status ? <p role="status" className="mt-2 text-[0.64rem] leading-relaxed text-fg-3">{status}</p> : null}
    </div>
  );
}
