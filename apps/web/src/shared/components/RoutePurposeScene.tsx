import { Pause, Play, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAtelierMotion } from "./site-experience/use-atelier-motion";

import {
  defineBilingualMap,
  defineBilingualText,
  formatI18nTemplate,
} from "@/shared/lib/i18n-bilingual-copy";
import { useT } from "@/shared/lib/i18n";
import type { SiteRouteExperience } from "@/shared/lib/site-route-experience";
import type { SiteRouteVisualProfile } from "@/shared/lib/site-route-visual";

import "./route-purpose-scene.css";

const CONTEXT_LABELS = defineBilingualMap("routePurposeScene.context", {
  global: { ko: "전체 서비스", en: "Global" },
  project: { ko: "작품 단위", en: "Project" },
  episode: { ko: "회차 단위", en: "Episode" },
  scene: { ko: "장면 단위", en: "Scene" },
  cut: { ko: "컷 단위", en: "Panel" },
});

const MOBILE_LABELS = defineBilingualMap("routePurposeScene.mobile", {
  full: { ko: "모바일 전체 지원", en: "Mobile ready" },
  review: { ko: "모바일 검토 지원", en: "Mobile review" },
  preview: { ko: "모바일 미리보기", en: "Mobile preview" },
  "desktop-required": { ko: "큰 화면 권장", en: "Large screen" },
});

const COPY = {
  pageGuide: defineBilingualText("routePurposeScene", "pageGuide", "{title} 화면 안내", "{title} page guide"),
  pageScope: defineBilingualText("routePurposeScene", "pageScope", "페이지 사용 범위", "Page scope"),
  nextAction: defineBilingualText("routePurposeScene", "nextAction", "다음: {action}", "Next: {action}"),
  playMotion: defineBilingualText("routePurposeScene", "playMotion", "페이지 모션 재생", "Play page motion"),
  pauseMotion: defineBilingualText("routePurposeScene", "pauseMotion", "페이지 모션 일시정지", "Pause page motion"),
  play: defineBilingualText("routePurposeScene", "play", "재생", "Play"),
  pause: defineBilingualText("routePurposeScene", "pause", "정지", "Pause"),
} as const;

function responsiveAtelierSrcSet(image: string): string | undefined {
  const match = image.match(/^(\/brand\/atelier-[^/.]+)\.webp$/u);
  if (!match) return undefined;
  return `${match[1]}-640.webp 640w, ${match[1]}-960.webp 960w, ${image} 1440w`;
}

interface RoutePurposeSceneProps {
  readonly title: string;
  readonly experience: SiteRouteExperience;
  readonly profile: SiteRouteVisualProfile;
}

/**
 * A route-level visual summary. The image remains the fallback; video and 3D motion are
 * progressive enhancements that stop offscreen, in calm mode and for reduced-motion users.
 */
export function RoutePurposeScene({
  title,
  experience,
  profile,
}: RoutePurposeSceneProps) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const { hostRef, motionAllowed, paused, running, setPaused } = useAtelierMotion();
  const context = t(CONTEXT_LABELS[experience.contextLevel]);
  const mobile = t(MOBILE_LABELS[experience.mobilePolicy]);
  const purpose = t(experience.pagePurpose);
  const action = experience.primaryAction ? t(experience.primaryAction) : null;
  const imageSrcSet = responsiveAtelierSrcSet(profile.image);
  const videoEnabled = Boolean(profile.video) && motionAllowed && !videoFailed;

  useEffect(() => {
    setVideoFailed(false);
    setVideoReady(false);
  }, [profile.kind]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoEnabled) return;
    if (!running) {
      video.pause();
      return;
    }
    const play = () => {
      if (
        profile.video
        && (
          video.currentTime < profile.video.startSeconds - 0.25
          || video.currentTime >= profile.video.endSeconds - 0.08
        )
      ) {
        video.currentTime = profile.video.startSeconds;
      }
      void video.play().catch(() => setVideoFailed(true));
    };
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) play();
    else video.addEventListener("loadedmetadata", play, { once: true });
    return () => {
      video.removeEventListener("loadedmetadata", play);
      video.pause();
    };
  }, [profile.video, running, videoEnabled]);

  const restartVideo = () => {
    const video = videoRef.current;
    if (!video || !profile.video || !running) return;
    video.currentTime = profile.video.startSeconds;
    void video.play().catch(() => setVideoFailed(true));
  };

  const keepVideoInSegment = () => {
    const video = videoRef.current;
    if (!video || !profile.video || video.currentTime < profile.video.endSeconds - 0.08) return;
    video.currentTime = profile.video.startSeconds;
    if (running) void video.play().catch(() => setVideoFailed(true));
  };

  return (
    <div
      ref={hostRef}
      className="route-purpose-scene-shell"
      data-route-visual-shell="true"
      data-density={profile.density}
    >
      <section
        key={experience.canonicalPath}
        className="route-purpose-scene"
        data-route-visual-kind={profile.kind}
        data-route-visual-motion={profile.motion}
        data-route-visual-running={running ? "true" : "false"}
        aria-label={formatI18nTemplate(t(COPY.pageGuide), { title })}
      >
        <div className="route-purpose-scene__copy">
          <p className="route-purpose-scene__eyebrow">
            <Sparkles size={14} aria-hidden="true" />
            {t(profile.eyebrow)}
          </p>
          <h2>{title}</h2>
          <p className="route-purpose-scene__purpose">{purpose}</p>
          <div className="route-purpose-scene__meta" aria-label={t(COPY.pageScope)}>
            <span>{context}</span>
            <span>{mobile}</span>
            {action ? <strong>{formatI18nTemplate(t(COPY.nextAction), { action })}</strong> : null}
          </div>
        </div>

        <figure className="route-purpose-scene__visual" aria-hidden="true">
          <div className="route-purpose-scene__media">
            <img
              src={profile.image}
              srcSet={imageSrcSet}
              sizes={imageSrcSet ? "(max-width: 760px) calc(100vw - 2rem), 44vw" : undefined}
              alt=""
              width={960}
              height={640}
              loading={profile.density === "prominent" ? "eager" : "lazy"}
              fetchPriority={profile.density === "prominent" ? "high" : "auto"}
              decoding="async"
              draggable={false}
              style={{ objectPosition: profile.imagePosition }}
            />
            {videoEnabled && profile.video ? (
              <video
                ref={videoRef}
                muted
                playsInline
                preload="none"
                poster={profile.image}
                tabIndex={-1}
                data-ready={videoReady ? "true" : "false"}
                onCanPlay={() => setVideoReady(true)}
                onEnded={restartVideo}
                onTimeUpdate={keepVideoInSegment}
                onError={() => setVideoFailed(true)}
              >
                <source media="(max-width: 639px)" src={profile.video.portraitSrc} type="video/mp4" />
                <source src={profile.video.src} type="video/mp4" />
              </video>
            ) : null}
            <span className="route-purpose-scene__scan" />
          </div>
          <span className="route-purpose-scene__focus-ring"><Sparkles size={24} /></span>
          <div className="route-purpose-scene__cards">
            {profile.layers.map((layer, index) => (
              <span className="route-purpose-scene__card" data-card={index + 1} key={layer}>
                <i />
                <b>{t(layer)}</b>
              </span>
            ))}
          </div>
          <span className="route-purpose-scene__orbit"><i /><i /><i /></span>
        </figure>

        {motionAllowed ? (
          <button
            type="button"
            className="route-purpose-scene__motion-toggle"
            aria-pressed={paused}
            aria-label={t(paused ? COPY.playMotion : COPY.pauseMotion)}
            onClick={() => setPaused(!paused)}
            title={t(paused ? COPY.playMotion : COPY.pauseMotion)}
          >
            {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
            <span>{t(paused ? COPY.play : COPY.pause)}</span>
          </button>
        ) : null}
      </section>
    </div>
  );
}
