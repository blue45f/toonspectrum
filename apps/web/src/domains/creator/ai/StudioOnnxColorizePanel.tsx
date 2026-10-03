import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
// 기기 채색 패널 — 클라우드 AI를 쓸 수 없을 때(오프라인·키 미설정)의 폴백.
// Tag2Pix(선화 채색 GAN, MIT)를 onnxruntime-web으로 기기에서 직접 돌린다.
// 클라우드 경로가 가능하면 그쪽이 우선이며, 이 패널은 ① AI 미설정 시 제안
// 자리에서, ② 사용자가 "기기에서 채색"을 명시적으로 고를 때만 쓰인다.
// 모델·런타임은 실행 버튼을 눌렀을 때만 동적 import로 지연 로딩된다.
import { Loader2, Palette, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";
import type { StudioTag2pixTagName } from "../studio-onnx-tag2pix";

import { cn } from "@/shared/lib/utils";

const T = (ko: string) => translateCurrentStaticSourceText(
  "domains.creator.ai.StudioOnnxColorizePanel",
  "ko",
  ko,
);

interface ColorizeTagGroup {
  readonly id: string;
  readonly label: string;
  readonly options: readonly {
    readonly tag: StudioTag2pixTagName;
    readonly label: string;
  }[];
}

/** 제품 큐레이션: 전체 어휘 115종 중 그림 지정에 자주 쓰는 색 태그만. */
const TAG_GROUPS: readonly ColorizeTagGroup[] = [
  {
    id: "hair",
    label: "머리색",
    options: [
      { tag: "black_hair", label: "검정" },
      { tag: "brown_hair", label: "갈색" },
      { tag: "light_brown_hair", label: "밝은 갈색" },
      { tag: "blonde_hair", label: "금발" },
      { tag: "silver_hair", label: "은색" },
      { tag: "white_hair", label: "백발" },
      { tag: "grey_hair", label: "회색" },
      { tag: "red_hair", label: "빨강" },
      { tag: "orange_hair", label: "주황" },
      { tag: "pink_hair", label: "분홍" },
      { tag: "purple_hair", label: "보라" },
      { tag: "lavender_hair", label: "라벤더" },
      { tag: "blue_hair", label: "파랑" },
      { tag: "aqua_hair", label: "하늘" },
      { tag: "green_hair", label: "초록" },
    ],
  },
  {
    id: "eyes",
    label: "눈색",
    options: [
      { tag: "black_eyes", label: "검정" },
      { tag: "brown_eyes", label: "갈색" },
      { tag: "red_eyes", label: "빨강" },
      { tag: "orange_eyes", label: "주황" },
      { tag: "yellow_eyes", label: "노랑" },
      { tag: "green_eyes", label: "초록" },
      { tag: "blue_eyes", label: "파랑" },
      { tag: "aqua_eyes", label: "하늘" },
      { tag: "purple_eyes", label: "보라" },
      { tag: "pink_eyes", label: "분홍" },
      { tag: "grey_eyes", label: "회색" },
      { tag: "silver_eyes", label: "은색" },
    ],
  },
  {
    id: "skin",
    label: "피부",
    options: [
      { tag: "white_skin", label: "밝은 피부" },
      { tag: "pale_skin", label: "창백한 피부" },
      { tag: "dark_skin", label: "어두운 피부" },
      { tag: "shiny_skin", label: "윤기 피부" },
    ],
  },
  {
    id: "top",
    label: "상의",
    options: [
      { tag: "white_shirt", label: "흰색" },
      { tag: "black_shirt", label: "검정" },
      { tag: "red_shirt", label: "빨강" },
      { tag: "blue_shirt", label: "파랑" },
      { tag: "pink_shirt", label: "분홍" },
    ],
  },
  {
    id: "bottom",
    label: "하의(치마)",
    options: [
      { tag: "black_skirt", label: "검정" },
      { tag: "blue_skirt", label: "파랑" },
      { tag: "red_skirt", label: "빨강" },
      { tag: "green_skirt", label: "초록" },
      { tag: "white_skirt", label: "흰색" },
      { tag: "pink_skirt", label: "분홍" },
      { tag: "brown_skirt", label: "갈색" },
      { tag: "grey_skirt", label: "회색" },
      { tag: "orange_skirt", label: "주황" },
    ],
  },
  {
    id: "dress",
    label: "드레스",
    options: [
      { tag: "white_dress", label: "흰색" },
      { tag: "black_dress", label: "검정" },
      { tag: "blue_dress", label: "파랑" },
      { tag: "red_dress", label: "빨강" },
      { tag: "pink_dress", label: "분홍" },
      { tag: "purple_dress", label: "보라" },
      { tag: "green_dress", label: "초록" },
    ],
  },
  {
    id: "background",
    label: "배경",
    options: [
      { tag: "white_background", label: "흰색" },
      { tag: "grey_background", label: "회색" },
      { tag: "black_background", label: "검정" },
      { tag: "blue_background", label: "파랑" },
      { tag: "pink_background", label: "분홍" },
      { tag: "yellow_background", label: "노랑" },
      { tag: "green_background", label: "초록" },
      { tag: "red_background", label: "빨강" },
      { tag: "purple_background", label: "보라" },
      { tag: "orange_background", label: "주황" },
      { tag: "brown_background", label: "갈색" },
      { tag: "beige_background", label: "베이지" },
      { tag: "gradient_background", label: "그라데이션" },
    ],
  },
];

export function StudioOnnxColorizePanel({
  src,
  cloudConfigured,
  onResult,
}: {
  src: string;
  /** True when the BYOK cloud colorize route is ready (this is the alt). */
  cloudConfigured: boolean;
  onResult: (dataUrl: string) => void;
}) {
  const [selections, setSelections] = useState<
    Readonly<Record<string, StudioTag2pixTagName | null>>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setPreviewSrc(null);
    setError(null);
  }, [src]);

  const selectedTags = TAG_GROUPS
    .map((group) => selections[group.id])
    .filter((tag): tag is StudioTag2pixTagName => Boolean(tag));

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const service = await import("../studio-onnx-colorize");
      const result = await service.colorizeLineArtOnDevice(src, {
        tags: selectedTags,
        signal: controller.signal,
      });
      if (!mountedRef.current) return;
      setPreviewSrc(result.dataUrl);
      onResult(result.dataUrl);
    } catch (cause) {
      if (!mountedRef.current) return;
      if (cause instanceof Error && cause.name === "AbortError") {
        setError(T("채색을 취소했어요."));
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : T("기기 채색에 실패했어요."),
        );
      }
    } finally {
      if (mountedRef.current) setBusy(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-line bg-panel/50 p-3"
      data-studio-onnx-colorize-panel="true"
    >
      <div className="flex items-center gap-1.5 text-sm font-bold text-fg">
        <Palette size={14} className="text-accent" aria-hidden />
        {T("기기에서 채색")}
      </div>

      <p className="text-[0.68rem] leading-relaxed text-fg-2">
        {cloudConfigured
          ? T("서버 AI 대신 이 기기에서 바로 채색해요. 오프라인에서도 됩니다.")
          : T("AI 키가 없어도 괜찮아요 — 이 기기에서 바로 채색할 수 있어요.")}
      </p>

      {previewSrc && (
        <div className="overflow-hidden rounded-lg border border-line bg-card">
          <img
            src={previewSrc}
            alt={T("기기 채색 결과 미리보기")}
            className="max-h-32 w-full object-contain"
          />
        </div>
      )}

      <div className="space-y-1.5">
        {TAG_GROUPS.map((group) => (
          <div key={group.id} className="flex flex-wrap items-center gap-1">
            <span className="w-14 shrink-0 text-[0.62rem] font-semibold text-fg-3">
              {group.label}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setSelections((prev) => ({ ...prev, [group.id]: null }))}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold",
                STUDIO_FOCUS_RING,
                selections[group.id] == null
                  ? "border-accent/60 bg-accent/10 text-fg"
                  : "border-line bg-card text-fg-3 hover:border-accent/40 hover:text-fg",
                "disabled:opacity-50",
              )}
            >
              {T("자동")}
            </button>
            {group.options.map((option) => (
              <button
                key={option.tag}
                type="button"
                disabled={busy}
                onClick={() =>
                  setSelections((prev) => ({ ...prev, [group.id]: option.tag }))}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold",
                  STUDIO_FOCUS_RING,
                  selections[group.id] === option.tag
                    ? "border-accent/60 bg-accent/10 text-fg"
                    : "border-line bg-card text-fg-3 hover:border-accent/40 hover:text-fg",
                  "disabled:opacity-50",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className={cn(
            "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-on-accent",
            STUDIO_EASE,
            "hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {busy
            ? <Loader2 size={14} className="animate-spin" aria-hidden />
            : <Palette size={14} aria-hidden />}
          {busy ? T("채색하는 중…") : T("기기에서 채색하기")}
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-fg-2",
              STUDIO_EASE,
              "hover:text-fg",
            )}
          >
            <X size={14} aria-hidden />
            {T("취소")}
          </button>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-xs leading-relaxed text-bad">
          {error}
        </p>
      ) : (
        <p className="text-[0.66rem] leading-relaxed text-fg-3">
          {T("서버 AI 채색보다 색이 옅고 단순해요. 선화를 512px로 줄여 채색한 뒤 원본 선을 합성합니다. 기기에 따라 10~30초쯤 걸리고, 처음 한 번은 모델(약 79MB)을 내려받아요.")}
        </p>
      )}
    </div>
  );
}
