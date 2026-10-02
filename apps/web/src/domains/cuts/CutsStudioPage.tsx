/**
 * 컷츠 스튜디오 — 클립 만들기 (`/cuts/studio`).
 *
 * 3단계: ① 회차 선택 → ② 자동 변환 미리보기 → ③ 게시.
 * 미리보기까지는 로그인 없이 가능하고, 게시 버튼을 누르면
 * 게스트에게 로그인 유도를 띄운다.
 */

import { ArrowLeft, ArrowRight, Check, Clapperboard, Coins, Shuffle, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { awardCutsClipPublished } from "@/domains/account/public/asset-points";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useAuthActorId } from "@/domains/auth/public/session/use-auth-actor-id";

import { CutsPlayer } from "./CutsPlayer";
import { CutsRemixBadge } from "./CutsRemixBadge";
import { buildCutsClip, formatClipDuration } from "./cuts-clip-builder";
import {
  buildRemixClip,
  guardRemixPublish,
  resolveRemixAllowed,
  type RemixPolicyOverrides,
} from "./cuts-remix";
import { DEMO_EPISODES } from "./cuts-seed";
import { useCutsStore } from "./cuts-store";
import type { CutsClip, EpisodeSource } from "./cuts-types";

import "./cuts.css";

type StudioStep = "select" | "preview" | "done";

const STEP_LABELS = [
  { id: "select", ko: "1. 회차 선택", en: "1. Pick an episode" },
  { id: "preview", ko: "2. 변환 미리보기", en: "2. Preview conversion" },
  { id: "done", ko: "3. 게시 완료", en: "3. Published" },
] as const;

function Stepper({ step }: Readonly<{ step: StudioStep }>) {
  const t = useBilingual("cuts");
  const order: StudioStep[] = ["select", "preview", "done"];
  const currentIndex = order.indexOf(step);
  return (
    <ol className="cuts-studio__steps" aria-label={t("클립 만들기 단계", "Clip creation steps")}>
      {STEP_LABELS.map((label, index) => (
        <li
          key={label.id}
          className={
            `cuts-studio__step` +
            (index === currentIndex ? " cuts-studio__step--current" : "") +
            (index < currentIndex ? " cuts-studio__step--done" : "")
          }
          aria-current={index === currentIndex ? "step" : undefined}
        >
          {t(label.ko, label.en)}
        </li>
      ))}
    </ol>
  );
}

function EpisodePicker({
  selected,
  onSelect,
  remixOverrides,
}: Readonly<{
  selected: EpisodeSource | null;
  onSelect: (episode: EpisodeSource) => void;
  remixOverrides: RemixPolicyOverrides;
}>) {
  const t = useBilingual("cuts");
  return (
    <div
      className="cuts-episode-list"
      role="radiogroup"
      aria-label={t("회차 선택", "Choose an episode")}
    >
      {DEMO_EPISODES.map((episode) => {
        const checked = selected?.titleId === episode.titleId
          && selected?.episodeNumber === episode.episodeNumber;
        const preview = buildCutsClip(episode, "preview");
        const remixAllowed = resolveRemixAllowed(episode, remixOverrides);
        return (
          <button
            key={`${episode.titleId}-ep${episode.episodeNumber}`}
            type="button"
            role="radio"
            aria-checked={checked}
            className={`cuts-episode-card${checked ? " cuts-episode-card--selected" : ""}`}
            onClick={() => onSelect(episode)}
          >
            {preview ? (
              <img src={preview.thumbnailUrl} alt="" aria-hidden="true" />
            ) : null}
            <span>
              <h3>{episode.title}</h3>
              <p>{t("{{episode}}화 · {{episodeTitle}}", "Ep.{{episode}} · {{episodeTitle}}")
                .replace("{{episode}}", String(episode.episodeNumber))
                .replace("{{episodeTitle}}", episode.episodeTitle)}</p>
              <p>{episode.author}</p>
              <p>
                {t("{{panels}}개 패널", "{{panels}} panels").replace("{{panels}}", String(episode.panels.length))}
                {preview ? ` · ${formatClipDuration(preview.durationMs)}` : ""}
              </p>
              {remixAllowed ? (
                <p className="cuts-episode-card__remix">
                  <Shuffle size={13} aria-hidden="true" /> {t("팬 리믹스 허용 중", "Fan remixes allowed")}
                </p>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 작가 설정 — 작품별 팬 리믹스 허용 토글. 기본값은 허용 안 함(opt-in)이다. */
function RemixPolicySettings() {
  const t = useBilingual("cuts");
  const actorId = useAuthActorId();
  const remixOverrides = useCutsStore((state) => state.remixPolicyOverrides);
  const setRemixAllowed = useCutsStore((state) => state.setRemixAllowed);

  const handleToggle = (episode: EpisodeSource) => {
    const allowed = resolveRemixAllowed(episode, remixOverrides);
    const result = setRemixAllowed(
      { titleId: episode.titleId, episodeNumber: episode.episodeNumber },
      !allowed,
      actorId,
    );
    if (result.needsLogin) {
      requestAuthModalOpen({ reason: "protected-action", source: "cuts-remix-toggle" });
    }
  };

  return (
    <section
      className="cuts-remix-settings"
      aria-label={t("작가 설정", "Creator settings")}
    >
      <h2>{t("작가 설정 — 팬 리믹스 허용", "Creator settings — fan remix permission")}</h2>
      <p>
        {t(
          "허용을 켠 작품은 팬이 내 회차로 새 컷츠를 만들 수 있어요. 만든 클립에는 원작 표시가 자동으로 붙고 지울 수 없어요.",
          "Titles you allow can be remixed by fans into new Cuts. Original credit is attached automatically and cannot be removed.",
        )}
      </p>
      {DEMO_EPISODES.map((episode) => {
        const allowed = resolveRemixAllowed(episode, remixOverrides);
        return (
          <div
            key={`${episode.titleId}-ep${episode.episodeNumber}`}
            className="cuts-remix-settings__row"
          >
            <div className="cuts-remix-settings__meta">
              {episode.title} {episode.episodeNumber}화
              <span>
                {allowed
                  ? t("팬 리믹스 허용 중", "Fan remixes allowed")
                  : t("허용 안 함", "Not allowed")}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={allowed}
              className="cuts-switch"
              onClick={() => handleToggle(episode)}
              aria-label={t("「{{title}}」 팬 리믹스 허용", "Allow fan remixes of “{{title}}”")
                .replace("{{title}}", episode.title)}
            />
          </div>
        );
      })}
    </section>
  );
}

/** 작가 수익 — 리워드 펀드 정산 대시보드 진입. */
function RewardFundLink() {
  const t = useBilingual("cuts");
  return (
    <section
      className="cuts-remix-settings"
      aria-label={t("리워드 펀드", "Reward fund")}
    >
      <h2>{t("리워드 펀드 정산", "Reward fund settlement")}</h2>
      <p>
        {t(
          "컷츠 조회가 쌓이면 월간 펀드에서 내 몫이 계산돼요. 팬 리믹스가 번 조회도 원작자에게 30%가 돌아와요.",
          "Views on your Cuts earn a share of the monthly fund. Views earned by fan remixes also pay 30% back to you.",
        )}
      </p>
      <Link href="/cuts/rewards" className="cuts-button cuts-button--ghost">
        <Coins size={16} aria-hidden="true" /> {t("정산 대시보드 보기", "Open settlement dashboard")}
      </Link>
    </section>
  );
}

function ClipPreview({ clip }: Readonly<{ clip: CutsClip }>) {
  const t = useBilingual("cuts");
  const [muted, setMuted] = useState(true);
  return (
    <div className="cuts-studio__preview">
      <CutsPlayer
        clip={clip}
        active
        muted={muted}
        onToggleMute={() => setMuted((value) => !value)}
      />
      <div>
        {clip.remix ? <CutsRemixBadge clip={clip} /> : null}
        <h3>{t("샷 구성", "Shot list")}</h3>
        <ul className="cuts-shot-list">
          {clip.shots.map((shot, index) => (
            <li key={shot.id}>
              <img src={shot.imageUrl} alt={shot.alt} />
              <div>
                <div>
                  {t("샷 {{n}}", "Shot {{n}}").replace("{{n}}", String(index + 1))}
                  {" · "}
                  {formatClipDuration(shot.durationMs)}
                  {" · "}
                  {shot.kenBurns.direction}
                </div>
                <div className="cuts-shot-list__meta">{shot.caption}</div>
              </div>
            </li>
          ))}
        </ul>
        <details className="cuts-ssml">
          <summary>{t("내레이션 SSML 보기 (클라우드 TTS 내보내기용)", "View narration SSML (for cloud TTS export)")}</summary>
          <pre>{clip.narrationSsml}</pre>
        </details>
      </div>
    </div>
  );
}

export function CutsStudioPage() {
  const t = useBilingual("cuts");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const actorId = useAuthActorId();
  const publishClip = useCutsStore((state) => state.publishClip);
  const clips = useCutsStore((state) => state.clips);
  const remixPolicyOverrides = useCutsStore((state) => state.remixPolicyOverrides);

  // 피드의 "리믹스 만들기" 진입 — ?remixOf={titleId}:{episodeNumber}
  const remixOfParam = searchParams.get("remixOf");
  const remixEpisode = useMemo(() => {
    if (!remixOfParam) return null;
    const separator = remixOfParam.lastIndexOf(":");
    if (separator <= 0) return null;
    const titleId = remixOfParam.slice(0, separator);
    const episodeNumber = Number(remixOfParam.slice(separator + 1));
    if (!Number.isFinite(episodeNumber)) return null;
    return (
      DEMO_EPISODES.find(
        (entry) => entry.titleId === titleId && entry.episodeNumber === episodeNumber,
      ) ?? null
    );
  }, [remixOfParam]);
  const remixParamInvalid = remixOfParam !== null && remixEpisode === null;

  // 원작 메타에 박을 원본 클립 ID — 스토어 원본을 우선하고, 없으면 빌더 규약 ID.
  const originalClipId = useMemo(() => {
    if (!remixEpisode) return null;
    const original = clips.find(
      (clip) =>
        clip.titleId === remixEpisode.titleId
        && clip.episodeNumber === remixEpisode.episodeNumber
        && !clip.remix,
    );
    if (original) return original.id;
    return buildCutsClip(remixEpisode, "preview")?.id ?? null;
  }, [remixEpisode, clips]);

  const [step, setStep] = useState<StudioStep>("select");
  const [selected, setSelected] = useState<EpisodeSource | null>(remixEpisode);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishBlocked, setPublishBlocked] = useState(false);

  // 선택한 회차가 리믹스 진입 대상과 같을 때만 리믹스 초안으로 만든다.
  const isRemixDraft =
    remixEpisode !== null
    && selected?.titleId === remixEpisode.titleId
    && selected?.episodeNumber === remixEpisode.episodeNumber;
  const remixNotAllowed =
    isRemixDraft && selected !== null
      ? !resolveRemixAllowed(selected, remixPolicyOverrides)
      : false;

  const draft = useMemo(() => {
    if (!selected) return null;
    if (isRemixDraft && originalClipId) {
      return buildRemixClip(selected, actorId ?? "guest", originalClipId);
    }
    return buildCutsClip(selected, actorId ?? "guest");
  }, [selected, isRemixDraft, originalClipId, actorId]);

  const publishedClip = clips.find((clip) => clip.id === publishedId) ?? null;
  const publishedRemix = publishedClip?.remix;

  const handleSelect = (episode: EpisodeSource) => {
    setSelected(episode);
    setPublishBlocked(false);
  };

  const handlePublish = () => {
    if (!draft || !selected) return;
    if (!actorId) {
      requestAuthModalOpen({
        reason: "protected-action",
        source: isRemixDraft ? "cuts-remix-publish" : "cuts-publish",
      });
      return;
    }
    // 리믹스는 게시 직전에 허용 여부를 다시 판정한다 (미리보기 뒤 껐으면 차단).
    if (isRemixDraft) {
      const decision = guardRemixPublish(selected, remixPolicyOverrides, actorId);
      if (!decision.ok) {
        setPublishBlocked(true);
        return;
      }
    }
    const clip: CutsClip = { ...draft, createdBy: actorId, publishedAt: new Date().toISOString() };
    publishClip(clip);
    // 활동 보상: 컷츠 게시 포인트 적립(일일 상한·중복 방지는 포인트 원장이 판정한다).
    awardCutsClipPublished(clip.id);
    setPublishedId(clip.id);
    setStep("done");
  };

  return (
    <div className="cuts-studio">
      <p>
        <Link href="/cuts" className="cuts-button cuts-button--ghost">
          <ArrowLeft size={16} aria-hidden="true" /> {t("피드로 돌아가기", "Back to feed")}
        </Link>
      </p>
      <h1>
        <Clapperboard size={24} aria-hidden="true" /> {t("컷츠 클립 만들기", "Create a Cuts clip")}
      </h1>
      <p>
        {t(
          "회차를 고르면 패널 이미지·자막·내레이션을 묶어 9:16 세로형 클립으로 자동 변환해요.",
          "Pick an episode and its panels, captions, and narration become a 9:16 vertical clip automatically.",
        )}
      </p>

      <Stepper step={step} />

      {remixParamInvalid ? (
        <p className="cuts-studio__notice" role="note">
          {t(
            "원작을 찾지 못해 일반 클립 만들기로 진행해요.",
            "We couldn't find the original, so you're in standard clip creation.",
          )}
        </p>
      ) : null}

      {step === "select" ? (
        <>
          {isRemixDraft ? (
            <p className="cuts-studio__notice" role="note">
              <Shuffle size={16} aria-hidden="true" />{" "}
              {t(
                "팬 리믹스 모드예요. 원작 표시가 자동으로 붙고 지울 수 없어요.",
                "You're in fan remix mode. Original credit is attached automatically and can't be removed.",
              )}
            </p>
          ) : null}
          {remixNotAllowed ? (
            <p className="cuts-studio__notice" role="alert">
              {t(
                "이 작품은 작가가 팬 리믹스를 허용하지 않았어요.",
                "The creator hasn't allowed fan remixes of this title.",
              )}
            </p>
          ) : null}
          <EpisodePicker
            selected={selected}
            onSelect={handleSelect}
            remixOverrides={remixPolicyOverrides}
          />
          <RemixPolicySettings />
          <RewardFundLink />
          <div className="cuts-studio__actions">
            <button
              type="button"
              className="cuts-button cuts-button--primary"
              disabled={!selected || remixNotAllowed}
              onClick={() => setStep("preview")}
            >
              {t("클립으로 변환하기", "Convert to clip")} <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </>
      ) : null}

      {step === "preview" && draft ? (
        <>
          <ClipPreview clip={draft} />
          {!actorId ? (
            <p className="cuts-studio__notice" role="note">
              {t(
                "게스트로 미리보는 중이에요. 게시하려면 로그인이 필요해요.",
                "You're previewing as a guest. Sign in to publish.",
              )}
            </p>
          ) : null}
          {publishBlocked ? (
            <p className="cuts-studio__notice" role="alert">
              {t(
                "원작자가 리믹스 허용을 껐어요. 지금은 이 작품으로 게시할 수 없어요.",
                "The creator turned off remixes. You can't publish this remix right now.",
              )}
            </p>
          ) : null}
          <div className="cuts-studio__actions">
            <button
              type="button"
              className="cuts-button cuts-button--ghost"
              onClick={() => setStep("select")}
            >
              <ArrowLeft size={16} aria-hidden="true" /> {t("다시 선택", "Pick again")}
            </button>
            <button
              type="button"
              className="cuts-button cuts-button--primary"
              onClick={handlePublish}
            >
              <Upload size={16} aria-hidden="true" /> {t("피드에 게시하기", "Publish to feed")}
            </button>
          </div>
        </>
      ) : null}

      {step === "done" && publishedId ? (
        <div className="cuts-studio__notice" role="status">
          <p>
            <Check size={18} aria-hidden="true" />{" "}
            {t("클립이 피드에 게시됐어요!", "Your clip is live on the feed!")}
          </p>
          <div className="cuts-studio__actions">
            <button
              type="button"
              className="cuts-button cuts-button--primary"
              onClick={() => navigate("/cuts")}
            >
              {t("피드에서 확인하기", "See it on the feed")}
            </button>
            {publishedRemix ? (
              <button
                type="button"
                className="cuts-button cuts-button--ghost"
                onClick={() => navigate(`/cuts?fanOf=${publishedRemix.titleId}`)}
              >
                <Shuffle size={16} aria-hidden="true" />{" "}
                {t("이 작품의 팬 리믹스 보기", "See fan remixes of this title")}
              </button>
            ) : null}
            <button
              type="button"
              className="cuts-button cuts-button--ghost"
              onClick={() => {
                setSelected(null);
                setPublishedId(null);
                setPublishBlocked(false);
                setStep("select");
              }}
            >
              {t("다른 클립 만들기", "Make another clip")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
