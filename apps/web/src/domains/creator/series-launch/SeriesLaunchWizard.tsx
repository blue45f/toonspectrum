/**
 * 연재 런치 위저드 — 기획부터 첫 발행까지 5단계 안내 UI.
 *
 * 실제 웹툰 연재 파이프라인(기획 → 시리즈 개설 → 회차 제작 → 발행 점검 → 연재 시작)을
 * 직관적인 단계별 플로우로 제공한다. 진행률 표시, 다음 할 일 안내, WYSIWYG 미리보기를 포함한다.
 */
import { ArrowLeft, ArrowRight, Check, ChevronRight, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { CoverImage } from "@/shared/components/cover-image";
import { createSeries, type SeriesSummary } from "@/platform/creator-client";

import {
  canNavigateToStep,
  createEmptyLaunchDraft,
  getLaunchProgress,
  getNextIncompleteStep,
  isLaunchStepComplete,
  parseLaunchTags,
  SERIES_LAUNCH_GENRES,
  SERIES_LAUNCH_STEPS,
  SERIES_LAUNCH_WEEKDAYS,
  toSeriesInput,
  validateLaunchDraft,
  type SeriesLaunchDraft,
  type SeriesLaunchStepId,
} from "./series-launch-model";
import "./series-launch-i18n";
import "./series-launch.css";

export interface SeriesLaunchWizardProps {
  readonly initial?: Partial<SeriesLaunchDraft>;
  readonly onComplete: (series: SeriesSummary) => void;
  readonly onCancel?: () => void;
}

const STEP_ICONS: Record<SeriesLaunchStepId, number> = {
  plan: 1,
  series: 2,
  episode: 3,
  review: 4,
  launch: 5,
};

const STEP_TIPS: Partial<Record<SeriesLaunchStepId, string>> = {
  plan: "studio.seriesLaunch.tip.plan",
  series: "studio.seriesLaunch.tip.series",
  episode: "studio.seriesLaunch.tip.episode",
};

function Field({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="sl-field">
      <span className="sl-field-label">{label}</span>
      {children}
      {hint ? <span className="sl-field-hint">{hint}</span> : null}
    </label>
  );
}

function CheckRow({
  checked,
  onChange,
  title,
  desc,
}: {
  readonly checked: boolean;
  readonly onChange: (v: boolean) => void;
  readonly title: string;
  readonly desc: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn("sl-checkrow", checked && "sl-checkrow-on")}
    >
      <span className={cn("sl-checkrow-box", checked && "sl-checkrow-box-on")}>
        {checked ? <Check size={14} /> : null}
      </span>
      <span className="sl-checkrow-text">
        <span className="sl-checkrow-title">{title}</span>
        <span className="sl-checkrow-desc">{desc}</span>
      </span>
    </button>
  );
}

export function SeriesLaunchWizard({
  initial,
  onComplete,
  onCancel,
}: SeriesLaunchWizardProps) {
  const t = useT();
  const lt = (key: string, fallback: string) => {
    const v = t(key, fallback);
    return v === key ? fallback : v;
  };

  const [draft, setDraft] = useState<SeriesLaunchDraft>(() => ({
    ...createEmptyLaunchDraft(),
    ...initial,
  }));
  const [step, setStep] = useState<SeriesLaunchStepId>("plan");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const progress = useMemo(() => getLaunchProgress(draft), [draft]);
  const nextStep = useMemo(() => getNextIncompleteStep(draft), [draft]);
  const issues = useMemo(() => validateLaunchDraft(draft), [draft]);

  const patch = (p: Partial<SeriesLaunchDraft>) =>
    setDraft((d) => ({ ...d, ...p }));

  const goTo = (target: SeriesLaunchStepId) => {
    if (canNavigateToStep(draft, target)) setStep(target);
  };

  const stepIndex = SERIES_LAUNCH_STEPS.indexOf(step);

  async function handleComplete() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const series = await createSeries(toSeriesInput(draft));
      onComplete(series);
    } catch {
      setError(lt("studio.seriesLaunch.createFailed", "시리즈를 만들지 못했어요. 다시 시도해 주세요."));
    } finally {
      setCreating(false);
    }
  }

  const weekdayLabel = (d: number) =>
    lt(`studio.seriesLaunch.weekday.${d}`, ["일", "월", "화", "수", "목", "금", "토"][d]);

  return (
    <div className="sl-root" data-testid="series-launch-wizard">
      {/* 헤더: 진행률 */}
      <header className="sl-header">
        <div>
          <h2 className="sl-title">
            <Sparkles size={18} className="sl-title-icon" />
            {lt("studio.seriesLaunch.title", "연재 시작하기")}
          </h2>
          <p className="sl-subtitle">
            {lt("studio.seriesLaunch.subtitle", "기획부터 첫 발행까지, 차근차근 안내해 드릴게요.")}
          </p>
        </div>
        <div className="sl-progress" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label={lt("studio.seriesLaunch.progressLabel", "연재 준비 진행률")}>
          <div className="sl-progress-bar">
            <div className="sl-progress-fill" style={{ width: `${progress.percent}%` }} />
          </div>
          <span className="sl-progress-text numeral">
            {progress.completed}/{progress.total} · {progress.percent}%
          </span>
        </div>
      </header>

      {/* 단계 인디케이터 */}
      <nav className="sl-steps" aria-label="연재 준비 단계">
        {SERIES_LAUNCH_STEPS.map((id) => {
          const done = isLaunchStepComplete(draft, id);
          const active = id === step;
          const reachable = canNavigateToStep(draft, id);
          return (
            <button
              key={id}
              type="button"
              disabled={!reachable}
              onClick={() => goTo(id)}
              aria-current={active ? "step" : undefined}
              className={cn("sl-step", active && "sl-step-active", done && "sl-step-done")}
            >
              <span className="sl-step-num">
                {done ? <Check size={13} /> : STEP_ICONS[id]}
              </span>
              <span className="sl-step-name">
                {lt(`studio.seriesLaunch.step.${id}`, id)}
              </span>
            </button>
          );
        })}
      </nav>

      {/* 다음 할 일 안내 */}
      {nextStep && step !== "launch" ? (
        <button
          type="button"
          onClick={() => goTo(nextStep)}
          className="sl-nextup"
        >
          <span className="sl-nextup-label">
            {lt("studio.seriesLaunch.nextUp", "다음 할 일")}
          </span>
          <span className="sl-nextup-step">
            {lt(`studio.seriesLaunch.step.${nextStep}`, nextStep)}
          </span>
          <ChevronRight size={14} />
        </button>
      ) : null}

      {/* 단계별 패널 */}
      <div className="sl-panel">
        {step === "plan" ? (
          <section aria-label={lt("studio.seriesLaunch.step.plan", "기획하기")}>
            <p className="sl-stepdesc">{lt("studio.seriesLaunch.step.planDesc", "")}</p>
            <div className="sl-fields">
              <Field label={lt("studio.seriesLaunch.genre", "장르")}>
                <select
                  value={draft.genre ?? ""}
                  onChange={(e) =>
                    patch({ genre: (e.target.value || null) as SeriesLaunchDraft["genre"] })
                  }
                  className="sl-input"
                  aria-label={lt("studio.seriesLaunch.genre", "장르")}
                >
                  <option value="">
                    {lt("studio.seriesLaunch.genrePlaceholder", "장르를 선택하세요")}
                  </option>
                  {SERIES_LAUNCH_GENRES.map((g) => (
                    <option key={g} value={g}>
                      {lt(`studio.seriesLaunch.genre.${g}`, g)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={lt("studio.seriesLaunch.logline", "한 줄 소개")}
                hint={lt("studio.seriesLaunch.loglineHint", "")}
              >
                <input
                  value={draft.logline}
                  onChange={(e) => patch({ logline: e.target.value.slice(0, 120) })}
                  placeholder={lt("studio.seriesLaunch.loglinePlaceholder", "")}
                  className="sl-input"
                  aria-label={lt("studio.seriesLaunch.logline", "한 줄 소개")}
                />
              </Field>
              <Field label={lt("studio.seriesLaunch.synopsis", "시놉시스")}>
                <textarea
                  value={draft.synopsis}
                  onChange={(e) => patch({ synopsis: e.target.value.slice(0, 2000) })}
                  placeholder={lt("studio.seriesLaunch.synopsisPlaceholder", "")}
                  rows={4}
                  className="sl-input sl-textarea"
                  aria-label={lt("studio.seriesLaunch.synopsis", "시놉시스")}
                />
              </Field>
              <Field label={lt("studio.seriesLaunch.targetAudience", "타겟 독자 (선택)")}>
                <input
                  value={draft.targetAudience}
                  onChange={(e) => patch({ targetAudience: e.target.value.slice(0, 120) })}
                  placeholder={lt("studio.seriesLaunch.targetAudiencePlaceholder", "")}
                  className="sl-input"
                  aria-label={lt("studio.seriesLaunch.targetAudience", "타겟 독자")}
                />
              </Field>
              <div className="sl-field">
                <span className="sl-field-label">
                  {lt("studio.seriesLaunch.cadence", "목표 연재 요일 (선택)")}
                </span>
                <div className="sl-weekdays" role="radiogroup" aria-label={lt("studio.seriesLaunch.cadence", "")}>
                  {SERIES_LAUNCH_WEEKDAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={draft.cadenceWeekday === d}
                      onClick={() => patch({ cadenceWeekday: draft.cadenceWeekday === d ? null : d })}
                      className={cn("sl-weekday", draft.cadenceWeekday === d && "sl-weekday-on")}
                    >
                      {weekdayLabel(d)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {step === "series" ? (
          <section aria-label={lt("studio.seriesLaunch.step.series", "시리즈 만들기")}>
            <p className="sl-stepdesc">{lt("studio.seriesLaunch.step.seriesDesc", "")}</p>
            <div className="sl-fields">
              <Field label={lt("studio.seriesLaunch.seriesTitle", "시리즈 제목")}>
                <input
                  value={draft.title}
                  onChange={(e) => patch({ title: e.target.value.slice(0, 80) })}
                  placeholder={lt("studio.seriesLaunch.seriesTitlePlaceholder", "")}
                  className="sl-input"
                  aria-label={lt("studio.seriesLaunch.seriesTitle", "시리즈 제목")}
                />
              </Field>
              <Field label={lt("studio.seriesLaunch.seriesDesc", "시리즈 소개")}>
                <textarea
                  value={draft.description}
                  onChange={(e) => patch({ description: e.target.value.slice(0, 2000) })}
                  placeholder={lt("studio.seriesLaunch.seriesDescPlaceholder", "")}
                  rows={3}
                  className="sl-input sl-textarea"
                  aria-label={lt("studio.seriesLaunch.seriesDesc", "시리즈 소개")}
                />
              </Field>
              <Field label={lt("studio.seriesLaunch.tags", "태그 (선택)")}>
                <input
                  value={draft.tags.join(", ")}
                  onChange={(e) => patch({ tags: parseLaunchTags(e.target.value) })}
                  placeholder={lt("studio.seriesLaunch.tagsPlaceholder", "")}
                  className="sl-input"
                  aria-label={lt("studio.seriesLaunch.tags", "태그")}
                />
              </Field>
              <Field
                label={lt("studio.seriesLaunch.cover", "커버 이미지 URL (선택)")}
                hint={lt("studio.seriesLaunch.coverHint", "")}
              >
                <input
                  value={draft.cover}
                  onChange={(e) => patch({ cover: e.target.value.slice(0, 500) })}
                  placeholder={lt("studio.seriesLaunch.coverPlaceholder", "")}
                  inputMode="url"
                  className="sl-input"
                  aria-label={lt("studio.seriesLaunch.cover", "커버 이미지 URL")}
                />
              </Field>
            </div>
            {/* 미니 미리보기 */}
            {draft.title.trim() ? (
              <div className="sl-minipreview" aria-label={lt("studio.seriesLaunch.previewTitle", "")}>
                <span className="sl-minipreview-label">
                  {lt("studio.seriesLaunch.previewTitle", "독자에게 이렇게 보여요")}
                </span>
                <div className="sl-minipreview-card">
                  {draft.cover ? (
                    <CoverImage
                      src={draft.cover}
                      alt=""
                      className="sl-minipreview-cover"
                      fallback={<span className="sl-minipreview-fallback">?</span>}
                    />
                  ) : (
                    <span className="sl-minipreview-fallback">?</span>
                  )}
                  <span className="sl-minipreview-title">{draft.title}</span>
                  {draft.logline ? (
                    <span className="sl-minipreview-logline">{draft.logline}</span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {step === "episode" ? (
          <section aria-label={lt("studio.seriesLaunch.step.episode", "첫 화 준비하기")}>
            <p className="sl-stepdesc">{lt("studio.seriesLaunch.step.episodeDesc", "")}</p>
            <div className="sl-fields">
              <Field label={lt("studio.seriesLaunch.episodeTitle", "첫 회차 제목")}>
                <input
                  value={draft.episodeTitle}
                  onChange={(e) => patch({ episodeTitle: e.target.value.slice(0, 80) })}
                  placeholder={lt("studio.seriesLaunch.episodeTitlePlaceholder", "")}
                  className="sl-input"
                  aria-label={lt("studio.seriesLaunch.episodeTitle", "첫 회차 제목")}
                />
              </Field>
              <CheckRow
                checked={draft.episodePagesReady}
                onChange={(v) => patch({ episodePagesReady: v })}
                title={lt("studio.seriesLaunch.pagesReady", "")}
                desc={lt("studio.seriesLaunch.pagesReadyDesc", "")}
              />
              <CheckRow
                checked={draft.episodeThumbnailReady}
                onChange={(v) => patch({ episodeThumbnailReady: v })}
                title={lt("studio.seriesLaunch.thumbnailReady", "")}
                desc={lt("studio.seriesLaunch.thumbnailReadyDesc", "")}
              />
            </div>
          </section>
        ) : null}

        {step === "review" ? (
          <section aria-label={lt("studio.seriesLaunch.step.review", "발행 점검")}>
            <p className="sl-stepdesc">{lt("studio.seriesLaunch.reviewIntro", "")}</p>
            <div className="sl-fields">
              <CheckRow
                checked={draft.specCheckPassed}
                onChange={(v) => patch({ specCheckPassed: v })}
                title={lt("studio.seriesLaunch.specCheck", "")}
                desc={lt("studio.seriesLaunch.specCheckDesc", "")}
              />
              <CheckRow
                checked={draft.scheduleDecided}
                onChange={(v) => patch({ scheduleDecided: v })}
                title={lt("studio.seriesLaunch.schedule", "")}
                desc={lt("studio.seriesLaunch.scheduleDesc", "")}
              />
            </div>
            {issues.length > 0 ? (
              <div className="sl-issues" role="status">
                <span className="sl-issues-title">
                  {lt("studio.seriesLaunch.remaining", "{count} items left").replace(
                    "{count}",
                    String(issues.length)
                  )}
                </span>
                <ul>
                  {issues.map((issue, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="sl-issue-link"
                        onClick={() => goTo(issue.stepId)}
                      >
                        {lt(issue.messageKey, issue.field)}
                        <span className="sl-issue-go">
                          {lt(
                            "studio.seriesLaunch.goToStep",
                            "Go to {step}"
                          ).replace(
                            "{step}",
                            lt(`studio.seriesLaunch.step.${issue.stepId}`, issue.stepId)
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {step === "launch" ? (
          <section aria-label={lt("studio.seriesLaunch.step.launch", "연재 시작")} className="sl-launch">
            <div className="sl-launch-hero">
              <span className="sl-launch-emoji" aria-hidden="true">🎉</span>
              <h3 className="sl-launch-title">
                {lt("studio.seriesLaunch.launchReady", "모든 준비가 끝났어요!")}
              </h3>
              <p className="sl-launch-body">
                {lt("studio.seriesLaunch.launchBody", "")}
              </p>
            </div>
            <div className="sl-launch-preview" aria-label={lt("studio.seriesLaunch.previewTitle", "")}>
              <span className="sl-minipreview-label">
                {lt("studio.seriesLaunch.previewTitle", "독자에게 이렇게 보여요")}
              </span>
              <div className="sl-launch-card">
                {draft.cover ? (
                  <CoverImage
                    src={draft.cover}
                    alt=""
                    className="sl-launch-cover"
                    fallback={<span className="sl-minipreview-fallback">?</span>}
                  />
                ) : (
                  <span className="sl-minipreview-fallback">?</span>
                )}
                <div className="sl-launch-meta">
                  <span className="sl-launch-card-title">{draft.title}</span>
                  {draft.genre ? (
                    <span className="sl-launch-genre">
                      {lt(`studio.seriesLaunch.genre.${draft.genre}`, draft.genre)}
                    </span>
                  ) : null}
                  {draft.logline ? (
                    <span className="sl-launch-logline">{draft.logline}</span>
                  ) : null}
                  <span className="sl-launch-ep">{draft.episodeTitle}</span>
                </div>
              </div>
            </div>
            {error ? (
              <p className="sl-error" role="alert">{error}</p>
            ) : null}
            <button
              type="button"
              disabled={creating}
              onClick={handleComplete}
              className={cn(buttonClass({ variant: "solid", size: "lg" }), "sl-complete-btn")}
            >
              {creating
                ? lt("studio.seriesLaunch.creating", "시리즈를 만드는 중…")
                : lt("studio.seriesLaunch.complete", "연재 시작하기")}
            </button>
          </section>
        ) : null}

        {/* 단계 팁 */}
        {STEP_TIPS[step] ? (
          <p className="sl-tip" role="note">
            <Sparkles size={13} className="sl-tip-icon" />
            {lt(STEP_TIPS[step] as string, "")}
          </p>
        ) : null}
      </div>

      {/* 하단 내비게이션 */}
      <footer className="sl-footer">
        <div>
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={() => setStep(SERIES_LAUNCH_STEPS[stepIndex - 1])}
              className={cn(buttonClass({ variant: "ghost" }), "sl-navbtn")}
            >
              <ArrowLeft size={15} />
              {lt("studio.seriesLaunch.back", "이전")}
            </button>
          ) : onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className={cn(buttonClass({ variant: "ghost" }), "sl-navbtn")}
            >
              {lt("studio.seriesLaunch.skipForNow", "나중에 하기")}
            </button>
          ) : null}
        </div>
        {step !== "launch" ? (
          <button
            type="button"
            onClick={() => {
              const next = SERIES_LAUNCH_STEPS[stepIndex + 1];
              if (next && canNavigateToStep(draft, next)) setStep(next);
            }}
            disabled={!canNavigateToStep(draft, SERIES_LAUNCH_STEPS[stepIndex + 1] ?? "launch")}
            className={cn(buttonClass({ variant: "solid" }), "sl-navbtn")}
          >
            {lt("studio.seriesLaunch.next", "다음")}
            <ArrowRight size={15} />
          </button>
        ) : null}
      </footer>
    </div>
  );
}
