import { resumeBgmForContext, suspendBgmForContext } from "@toonspectrum/core/fx";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  isNaturalBrowserSpeechSupported,
  speakNaturalBrowserSpeech,
  type NaturalBrowserSpeechSession,
} from "@/shared/lib/natural-browser-speech";

import { PRODUCT_TOUR, type ProductTourLocale } from "./product-tour-content";

const PRODUCT_TOUR_VOICE_GUIDE_AUDIO_CONTEXT = "product-tour-voice-guide";

export function productTourVoiceGuideText(
  locale: ProductTourLocale,
  chapterIndex: number,
): string {
  const chapter = PRODUCT_TOUR.chapters[chapterIndex] ?? PRODUCT_TOUR.chapters[0];
  if (!chapter) return "";
  const title = locale === "ko" ? chapter.ko : chapter.en;
  const summary = locale === "ko" ? chapter.summary.ko : chapter.summary.en;
  return locale === "ko"
    ? `현재 챕터는 ${title}입니다. ${summary}`
    : `Current chapter: ${title}. ${summary}`;
}

export function useProductTourVoiceGuide(
  locale: ProductTourLocale,
  chapterIndex: number,
) {
  const sessionRef = useRef<NaturalBrowserSpeechSession | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const supported = isNaturalBrowserSpeechSupported();

  const stop = useCallback(() => {
    sessionRef.current?.cancel();
    sessionRef.current = null;
    setSpeaking(false);
  }, []);

  useEffect(() => {
    stop();
  }, [chapterIndex, locale, stop]);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (speaking) suspendBgmForContext(PRODUCT_TOUR_VOICE_GUIDE_AUDIO_CONTEXT);
    else resumeBgmForContext(PRODUCT_TOUR_VOICE_GUIDE_AUDIO_CONTEXT);
    return () => resumeBgmForContext(PRODUCT_TOUR_VOICE_GUIDE_AUDIO_CONTEXT);
  }, [speaking]);

  const toggle = useCallback(() => {
    if (sessionRef.current) {
      stop();
      return;
    }
    setError("");
    const text = productTourVoiceGuideText(locale, chapterIndex);
    const session = speakNaturalBrowserSpeech({
      text,
      style: "guide",
      maxSegmentChars: 90,
      onEnd: () => {
        sessionRef.current = null;
        setSpeaking(false);
      },
      onError: (reason) => {
        sessionRef.current = null;
        setSpeaking(false);
        setError(reason.message);
      },
    });
    if (!session) {
      setError(
        locale === "ko"
          ? "이 브라우저에서 챕터 음성 안내를 시작하지 못했어요."
          : "This browser could not start the chapter voice guide.",
      );
      return;
    }
    sessionRef.current = session;
    setSpeaking(true);
  }, [chapterIndex, locale, stop]);

  return { supported, speaking, error, toggle, stop } as const;
}
