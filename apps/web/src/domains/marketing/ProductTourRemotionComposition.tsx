import { ToonStudioProductTour } from "@toonstudio/product-tour-film";
import { useCallback, useEffect, useLayoutEffect } from "react";
import { AbsoluteFill, Html5Audio, useBufferState, useCurrentFrame, useVideoConfig } from "remotion";

import { useSeekableMediaAsset } from "./use-seekable-media-asset";
import { TOUR_AUDIO_MAX_BYTES } from "./seekable-media-asset";
import { PRODUCT_TOUR_RUNTIME_AUDIO } from "./product-tour-audio.generated";
import type { ProductTourLocale } from "./product-tour-content";
import {
  productTourBgmGainAtFrame,
  productTourCaptionAtFrame,
} from "./product-tour-remotion-timeline";

export type ProductTourAudioIssue = {
  readonly channel: "narration" | "bgm";
  readonly message: string;
};

export type ProductTourRemotionCompositionProps = {
  readonly locale: ProductTourLocale;
  readonly captionsEnabled: boolean;
  readonly narrationEnabled: boolean;
  readonly bgmEnabled: boolean;
  readonly narrationVolume: number;
  readonly bgmVolume: number;
  readonly onAudioIssue?: (issue: ProductTourAudioIssue) => void;
};
function ProductTourCaption({ locale }: { readonly locale: ProductTourLocale }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const caption = productTourCaptionAtFrame(frame, fps, locale);
  if (!caption) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: "8%",
        right: "8%",
        bottom: 72,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          maxWidth: 940,
          padding: "11px 18px 12px",
          borderRadius: 12,
          background: "rgba(5, 4, 3, 0.84)",
          boxShadow: "0 8px 32px rgba(0,0,0,.32)",
          color: "#fffaf5",
          fontSize: 23,
          fontWeight: 720,
          lineHeight: 1.45,
          textAlign: "center",
          textShadow: "0 2px 4px rgba(0,0,0,.65)",
          wordBreak: "keep-all",
        }}
      >
        {caption}
      </span>
    </div>
  );
}

export function ProductTourRemotionComposition({
  locale,
  captionsEnabled,
  narrationEnabled,
  bgmEnabled,
  narrationVolume,
  bgmVolume,
  onAudioIssue,
}: ProductTourRemotionCompositionProps) {
  const { fps } = useVideoConfig();
  const buffer = useBufferState();
  const music = useSeekableMediaAsset(PRODUCT_TOUR_RUNTIME_AUDIO.bgm.src, TOUR_AUDIO_MAX_BYTES, "audio");
  const narration = useSeekableMediaAsset(PRODUCT_TOUR_RUNTIME_AUDIO.narration.src, TOUR_AUDIO_MAX_BYTES, "audio");
  const audioReady = Boolean(music.url && narration.url);
  useLayoutEffect(() => {
    if (audioReady) return;
    const handle = buffer.delayPlayback();
    return () => handle.unblock();
  }, [audioReady, buffer]);
  useEffect(() => {
    if (music.error) onAudioIssue?.({ channel: "bgm", message: music.error });
    else if (narration.error) onAudioIssue?.({ channel: "narration", message: narration.error });
  }, [music.error, narration.error, onAudioIssue]);
  const reportAudioIssue = useCallback((
    channel: ProductTourAudioIssue["channel"],
    error: Error,
  ) => {
    onAudioIssue?.({ channel, message: error.message });
  }, [onAudioIssue]);

  return (
    <AbsoluteFill>
      <ToonStudioProductTour />
      {music.url ? <Html5Audio
        name="ToonStudio original BGM"
        src={music.url}
        muted={!bgmEnabled}
        volume={(frame) => bgmVolume * productTourBgmGainAtFrame(frame, fps)}
        pauseWhenBuffering
        acceptableTimeShiftInSeconds={0.45}
        crossOrigin="anonymous"
        useWebAudioApi={false}
        onError={(error) => reportAudioIssue("bgm", error)}
      /> : null}
      {narration.url ? <Html5Audio
        name="Korean narration"
        src={narration.url}
        muted={!narrationEnabled}
        volume={narrationVolume}
        pauseWhenBuffering
        acceptableTimeShiftInSeconds={0.3}
        crossOrigin="anonymous"
        useWebAudioApi={false}
        onError={(error) => reportAudioIssue("narration", error)}
      /> : null}
      {captionsEnabled ? <ProductTourCaption locale={locale} /> : null}
    </AbsoluteFill>
  );
}
