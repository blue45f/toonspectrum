/**
 * 컷츠 스튜디오 — 클립 만들기 (`/cuts/studio`).
 *
 * 3단계: ① 회차 선택 → ② 자동 변환 미리보기 → ③ 게시.
 * 미리보기까지는 로그인 없이 가능하고, 게시 버튼을 누르면
 * 게스트에게 로그인 유도를 띄운다.
 */

import { ArrowLeft, ArrowRight, Check, Clapperboard, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { awardCutsClipPublished } from "@/domains/account/asset-points";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useAuthActorId } from "@/domains/auth/public/session/use-auth-actor-id";

import { CutsPlayer } from "./CutsPlayer";
import { buildCutsClip, formatClipDuration } from "./cuts-clip-builder";
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
}: Readonly<{
  selected: EpisodeSource | null;
  onSelect: (episode: EpisodeSource) => void;
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
            </span>
          </button>
        );
      })}
    </div>
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
  const actorId = useAuthActorId();
  const publishClip = useCutsStore((state) => state.publishClip);

  const [step, setStep] = useState<StudioStep>("select");
  const [selected, setSelected] = useState<EpisodeSource | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);

  const draft = useMemo(
    () => (selected ? buildCutsClip(selected, actorId ?? "guest") : null),
    [selected, actorId],
  );

  const handlePublish = () => {
    if (!draft) return;
    if (!actorId) {
      requestAuthModalOpen({ reason: "protected-action", source: "cuts-publish" });
      return;
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

      {step === "select" ? (
        <>
          <EpisodePicker selected={selected} onSelect={setSelected} />
          <div className="cuts-studio__actions">
            <button
              type="button"
              className="cuts-button cuts-button--primary"
              disabled={!selected}
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
            <button
              type="button"
              className="cuts-button cuts-button--ghost"
              onClick={() => {
                setSelected(null);
                setPublishedId(null);
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
