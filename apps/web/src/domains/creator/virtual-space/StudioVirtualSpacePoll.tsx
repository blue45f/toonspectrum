import "./studio-virtual-space-poll.css";

import {
  AlertCircle,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  EyeOff,
  Plus,
  Timer,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_POLL_MAX_OPTION_LENGTH,
  STUDIO_POLL_MAX_OPTIONS,
  STUDIO_POLL_MAX_QUESTION_LENGTH,
  STUDIO_POLL_MIN_OPTIONS,
  studioPollDidVote,
  studioPollStatus,
  studioPollTimeLeftMs,
  tallyStudioPoll,
  type StudioPoll,
  type StudioPollCreateInput,
} from "./studio-virtual-space-poll";

export interface StudioVirtualSpacePollProps {
  readonly poll: StudioPoll | null;
  readonly canCreate: boolean;
  readonly canClose: boolean;
  readonly voterSessionId: string;
  readonly voterName: string;
  readonly onCreate: (input: Omit<StudioPollCreateInput, "createdBySessionId" | "createdByName" | "nowMs" | "id">) => void;
  readonly onVote: (optionId: string) => void;
  readonly onClose: () => void;
}

type Bilingual = (ko: string, en: string) => string;

const DEADLINE_PRESETS = [
  { key: "none", ms: null },
  { key: "1m", ms: 60_000 },
  { key: "5m", ms: 5 * 60_000 },
  { key: "15m", ms: 15 * 60_000 },
  { key: "1h", ms: 60 * 60_000 },
  { key: "24h", ms: 24 * 60 * 60_000 },
] as const;

const DEADLINE_LABELS: Readonly<Record<string, readonly [string, string]>> = {
  none: ["마감 없음", "No deadline"],
  "1m": ["1분", "1 min"],
  "5m": ["5분", "5 min"],
  "15m": ["15분", "15 min"],
  "1h": ["1시간", "1 hour"],
  "24h": ["24시간", "24 hours"],
};

const WIZARD_STEPS = [
  ["question", "질문", "Question"],
  ["options", "선택지", "Options"],
  ["settings", "설정", "Settings"],
  ["review", "확인", "Review"],
] as const;

function formatCountdown(bt: Bilingual, ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return bt(`${days}일 ${hours}시간 남음`, `${days}d ${hours}h left`);
  if (hours > 0) return bt(`${hours}시간 ${minutes}분 남음`, `${hours}h ${minutes}m left`);
  if (minutes > 0) return bt(`${minutes}분 ${seconds}초 남음`, `${minutes}m ${seconds}s left`);
  return bt(`${seconds}초 남음`, `${seconds}s left`);
}

function deadlineLabel(bt: Bilingual, key: string): string {
  const pair = DEADLINE_LABELS[key];
  return pair ? bt(pair[0], pair[1]) : key;
}

/* 중첩 삼항 연산자를 early-return 헬퍼로 분리: 무엇이 문제인지 + 어떻게 고치는지 함께 안내한다. */
function questionErrorMessage(bt: Bilingual, question: string): string | null {
  const trimmed = question.trim();
  if (!trimmed) return bt("질문을 입력해주세요.", "Please enter a question.");
  if (trimmed.length > STUDIO_POLL_MAX_QUESTION_LENGTH) {
    return bt(
      `질문은 ${STUDIO_POLL_MAX_QUESTION_LENGTH}자까지 입력할 수 있어요.`,
      `Keep the question under ${STUDIO_POLL_MAX_QUESTION_LENGTH} characters.`,
    );
  }
  return null;
}

function optionsErrorMessage(bt: Bilingual, options: readonly string[]): string | null {
  const trimmed = options.map((option) => option.trim());
  if (trimmed.length < STUDIO_POLL_MIN_OPTIONS) {
    return bt(`선택지는 최소 ${STUDIO_POLL_MIN_OPTIONS}개 필요해요.`, `Add at least ${STUDIO_POLL_MIN_OPTIONS} options.`);
  }
  if (trimmed.some((option) => !option)) return bt("빈 선택지가 있어요.", "Some options are empty.");
  if (trimmed.some((option) => option.length > STUDIO_POLL_MAX_OPTION_LENGTH)) {
    return bt(
      `선택지는 ${STUDIO_POLL_MAX_OPTION_LENGTH}자까지 입력할 수 있어요.`,
      `Keep each option under ${STUDIO_POLL_MAX_OPTION_LENGTH} characters.`,
    );
  }
  if (new Set(trimmed).size !== trimmed.length) return bt("중복된 선택지가 있어요.", "Some options are duplicated.");
  return null;
}

function canAdvanceWizardStep(step: number, questionError: string | null, optionsError: string | null): boolean {
  if (step === 0) return questionError == null;
  if (step === 1) return optionsError == null;
  return true;
}

function pollStatusLabel(bt: Bilingual, status: "open" | "closed" | "expired"): string {
  if (status === "open") return bt("진행 중", "Open");
  if (status === "expired") return bt("마감됨", "Expired");
  return bt("종료", "Closed");
}

/* 입력 오류 표시: 아이콘 + role="alert"로 무엇이 문제인지 즉시 전달한다. */
function PollFieldError({ id, message }: { readonly id?: string; readonly message: string }) {
  return <em id={id} className="studio-poll-error" role="alert">
    <AlertCircle size={13} aria-hidden />
    {message}
  </em>;
}

/* 빈 상태 일러스트: 투표함에 용지를 넣는 장면. */
function PollEmptyIllustration() {
  return <svg
    viewBox="0 0 160 140"
    aria-hidden="true"
    focusable="false"
    className="studio-poll-empty-art"
  >
    <rect x="34" y="58" width="92" height="62" rx="10" className="poll-art-box" />
    <rect x="58" y="46" width="44" height="12" rx="6" className="poll-art-slot" />
    <g transform="rotate(12 92 30)">
      <rect x="80" y="12" width="24" height="32" rx="4" className="poll-art-ballot" />
      <path d="M86 28 l5 5 l9 -10" className="poll-art-check" />
    </g>
    <circle cx="112" cy="104" r="15" className="poll-art-badge" />
    <path d="M105 104 l5 5 l9 -10" className="poll-art-badge-check" />
  </svg>;
}

/* 투표가 없고 만들 권한도 없을 때: 일러스트 + 다음 행동 가이드. */
function PollEmptyState() {
  const bt = useBilingual("StudioVirtualSpacePoll");
  return <section className="studio-poll" aria-label={bt("투표", "Poll")}>
    <div className="studio-poll-empty">
      <PollEmptyIllustration />
      <strong>{bt("진행 중인 투표가 없어요.", "There is no active poll.")}</strong>
      <p className="studio-poll-empty-hint">{bt(
        "투표 권한이 있는 참가자가 투표를 시작하면 여기서 바로 참여할 수 있어요.",
        "Once someone with permission starts a poll, you can vote right here.",
      )}</p>
    </div>
  </section>;
}

export function StudioVirtualSpacePoll({
  poll,
  canCreate,
  canClose,
  voterSessionId,
  voterName,
  onCreate,
  onVote,
  onClose,
}: StudioVirtualSpacePollProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!poll || poll.deadlineMs == null || studioPollStatus(poll) !== "open") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [poll]);

  if (!poll) {
    if (!canCreate) return <PollEmptyState />;
    return <PollWizard onCreate={onCreate} voterName={voterName} />;
  }

  return <PollCard
    poll={poll}
    now={now}
    canVote={Boolean(voterSessionId)}
    canClose={canClose}
    didVote={studioPollDidVote(poll, voterSessionId)}
    onVote={onVote}
    onClose={onClose}
  />;
}

/* 투표 생성 마법사 */

function WizardSteps({ step }: { readonly step: number }) {
  const bt = useBilingual("StudioVirtualSpacePoll");
  return <ol className="studio-poll-steps" aria-label={bt("만들기 단계", "Creation steps")}>
    {WIZARD_STEPS.map(([key, ko, en], index) => <li
      key={key}
      className={cn(index === step && "is-current", index < step && "is-done")}
      aria-current={index === step ? "step" : undefined}
    >{index < step ? <Check size={13} aria-hidden /> : index + 1} {bt(ko, en)}</li>)}
  </ol>;
}

function WizardQuestionStep({
  question,
  onQuestionChange,
  error,
}: {
  readonly question: string;
  readonly onQuestionChange: (value: string) => void;
  readonly error: string | null;
}) {
  const bt = useBilingual("StudioVirtualSpacePoll");
  return <label className="studio-poll-field">
    <span>{bt("질문", "Question")}</span>
    <input
      value={question}
      maxLength={STUDIO_POLL_MAX_QUESTION_LENGTH + 20}
      placeholder={bt("예) 다음 스프린트 주제를 골라주세요", "e.g. Pick the next sprint theme")}
      onChange={(event) => onQuestionChange(event.target.value)}
      aria-invalid={error != null}
      aria-describedby="studio-poll-question-error"
    />
    {error ? <PollFieldError id="studio-poll-question-error" message={error} /> : null}
  </label>;
}

function WizardOptionsStep({
  options,
  onUpdateOption,
  onRemoveOption,
  onAddOption,
  error,
}: {
  readonly options: readonly string[];
  readonly onUpdateOption: (index: number, value: string) => void;
  readonly onRemoveOption: (index: number) => void;
  readonly onAddOption: () => void;
  readonly error: string | null;
}) {
  const bt = useBilingual("StudioVirtualSpacePoll");
  return <fieldset className="studio-poll-field">
    <legend>{bt(`선택지 (${STUDIO_POLL_MIN_OPTIONS}~${STUDIO_POLL_MAX_OPTIONS}개)`, `Options (${STUDIO_POLL_MIN_OPTIONS}–${STUDIO_POLL_MAX_OPTIONS})`)}</legend>
    <ul className="studio-poll-option-editor">
      {options.map((option, index) => <li key={index}>
        <span className="studio-poll-option-index" aria-hidden="true">{index + 1}</span>
        <input
          value={option}
          maxLength={STUDIO_POLL_MAX_OPTION_LENGTH + 10}
          placeholder={bt(`선택지 ${index + 1}`, `Option ${index + 1}`)}
          aria-label={bt(`선택지 ${index + 1}`, `Option ${index + 1}`)}
          onChange={(event) => onUpdateOption(index, event.target.value)}
        />
        {options.length > STUDIO_POLL_MIN_OPTIONS ? <button
          type="button"
          className="studio-poll-icon-btn"
          aria-label={bt(`선택지 ${index + 1} 삭제`, `Remove option ${index + 1}`)}
          onClick={() => onRemoveOption(index)}
        ><X size={14} aria-hidden /></button> : null}
      </li>)}
    </ul>
    {options.length < STUDIO_POLL_MAX_OPTIONS ? <button
      type="button"
      className="studio-poll-secondary"
      onClick={onAddOption}
    ><Plus size={14} aria-hidden />{bt("선택지 추가", "Add option")}</button> : null}
    {error ? <PollFieldError message={error} /> : null}
  </fieldset>;
}

function WizardSettingsStep({
  anonymous,
  onToggleAnonymous,
  deadlineKey,
  onDeadlineKeyChange,
}: {
  readonly anonymous: boolean;
  readonly onToggleAnonymous: () => void;
  readonly deadlineKey: string;
  readonly onDeadlineKeyChange: (key: string) => void;
}) {
  const bt = useBilingual("StudioVirtualSpacePoll");
  return <div className="studio-poll-settings">
    <button
      type="button"
      className={cn("studio-poll-setting-card", anonymous && "is-active")}
      aria-pressed={anonymous}
      onClick={onToggleAnonymous}
    >
      <EyeOff size={18} aria-hidden />
      <span>
        <strong>{bt("익명 투표", "Anonymous vote")}</strong>
        <small>{bt(
          "누가 무엇을 골랐는지 공개하지 않아요. 중복 투표는 막습니다.",
          "Choices stay private. Duplicate votes are still blocked.",
        )}</small>
      </span>
      <span className={cn("studio-poll-switch", anonymous && "is-on")} aria-hidden="true" />
    </button>
    <fieldset className="studio-poll-field">
      <legend><Timer size={14} aria-hidden /> {bt("마감 시간", "Deadline")}</legend>
      <div className="studio-poll-deadlines" role="group" aria-label={bt("마감 시간", "Deadline")}>
        {DEADLINE_PRESETS.map((preset) => <button
          key={preset.key}
          type="button"
          className={cn("studio-poll-deadline", deadlineKey === preset.key && "is-active")}
          aria-pressed={deadlineKey === preset.key}
          onClick={() => onDeadlineKeyChange(preset.key)}
        >{deadlineLabel(bt, preset.key)}</button>)}
      </div>
    </fieldset>
  </div>;
}

function WizardReviewStep({
  question,
  options,
  anonymous,
  deadlineKey,
  deadlineMs,
}: {
  readonly question: string;
  readonly options: readonly string[];
  readonly anonymous: boolean;
  readonly deadlineKey: string;
  readonly deadlineMs: number | null;
}) {
  const bt = useBilingual("StudioVirtualSpacePoll");
  return <div className="studio-poll-review">
    <h3>{question.trim()}</h3>
    <ul>
      {options.map((option) => <li key={option}>{option}</li>)}
    </ul>
    <p className="studio-poll-review-meta">
      {anonymous
        ? bt("익명 투표", "Anonymous")
        : bt("기명 투표", "Named vote")}
      {" · "}
      {deadlineMs ? deadlineLabel(bt, deadlineKey) + bt(" 후 마감", " deadline") : bt("마감 없음", "No deadline")}
    </p>
  </div>;
}

function WizardFooter({
  step,
  canNext,
  onBack,
  onNext,
  onCreate,
}: {
  readonly step: number;
  readonly canNext: boolean;
  readonly onBack: () => void;
  readonly onNext: () => void;
  readonly onCreate: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpacePoll");
  return <footer className="studio-poll-wizard-foot">
    <button
      type="button"
      className="studio-poll-secondary"
      disabled={step === 0}
      onClick={onBack}
    ><ChevronLeft size={15} aria-hidden />{bt("이전", "Back")}</button>
    {step < 3
      ? <button
        type="button"
        className="studio-poll-primary"
        disabled={!canNext}
        onClick={onNext}
      >{bt("다음", "Next")}<ChevronRight size={15} aria-hidden /></button>
      : <button
        type="button"
        className="studio-poll-primary"
        disabled={!canNext}
        onClick={onCreate}
      ><Check size={15} aria-hidden />{bt("투표 시작", "Start poll")}</button>}
  </footer>;
}

function PollWizard({
  onCreate,
  voterName,
}: {
  readonly onCreate: StudioVirtualSpacePollProps["onCreate"];
  readonly voterName: string;
}) {
  const bt = useBilingual("StudioVirtualSpacePoll");
  const [step, setStep] = useState(0);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [anonymous, setAnonymous] = useState(false);
  const [deadlineKey, setDeadlineKey] = useState<string>("15m");

  const trimmedOptions = options.map((option) => option.trim());
  const questionError = questionErrorMessage(bt, question);
  const optionsError = optionsErrorMessage(bt, options);
  const deadlineMs = DEADLINE_PRESETS.find((preset) => preset.key === deadlineKey)?.ms ?? null;
  const canNext = canAdvanceWizardStep(step, questionError, optionsError);

  const updateOption = (index: number, value: string) =>
    setOptions((current) => current.map((entry, i) => (i === index ? value : entry)));
  const removeOption = (index: number) =>
    setOptions((current) => current.filter((_, i) => i !== index));
  const addOption = () => setOptions((current) => [...current, ""]);

  const create = () => {
    if (questionError || optionsError) return;
    onCreate({
      question: question.trim(),
      options: trimmedOptions,
      anonymous,
      closesInMs: deadlineMs,
    });
  };

  return <section className="studio-poll" aria-label={bt("투표 만들기", "Create a poll")}>
    <header className="studio-poll-head">
      <div>
        <h2>{bt("투표 만들기", "Create a poll")}</h2>
        <p>{bt(
          `${voterName}님, 팀의 의견을 빠르게 모아보세요.`,
          `${voterName}, gather your team's opinion quickly.`,
        )}</p>
      </div>
      <WizardSteps step={step} />
    </header>

    <div className="studio-poll-wizard-body">
      {step === 0 && <WizardQuestionStep
        question={question}
        onQuestionChange={setQuestion}
        error={questionError}
      />}
      {step === 1 && <WizardOptionsStep
        options={options}
        onUpdateOption={updateOption}
        onRemoveOption={removeOption}
        onAddOption={addOption}
        error={optionsError}
      />}
      {step === 2 && <WizardSettingsStep
        anonymous={anonymous}
        onToggleAnonymous={() => setAnonymous((current) => !current)}
        deadlineKey={deadlineKey}
        onDeadlineKeyChange={setDeadlineKey}
      />}
      {step === 3 && <WizardReviewStep
        question={question}
        options={trimmedOptions}
        anonymous={anonymous}
        deadlineKey={deadlineKey}
        deadlineMs={deadlineMs}
      />}
    </div>

    <WizardFooter
      step={step}
      canNext={canNext}
      onBack={() => setStep((current) => current - 1)}
      onNext={() => setStep((current) => current + 1)}
      onCreate={create}
    />
  </section>;
}

/* 투표 카드 */

function PollCard({
  poll,
  now,
  canVote,
  canClose,
  didVote,
  onVote,
  onClose,
}: {
  readonly poll: StudioPoll;
  readonly now: number;
  readonly canVote: boolean;
  readonly canClose: boolean;
  readonly didVote: boolean;
  readonly onVote: (optionId: string) => void;
  readonly onClose: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpacePoll");
  const status = studioPollStatus(poll, now);
  const timeLeft = studioPollTimeLeftMs(poll, now);
  const tally = useMemo(() => tallyStudioPoll(poll), [poll]);
  const voteUnit = bt("표", "votes");
  const open = status === "open";

  return <section className="studio-poll" aria-label={bt("투표", "Poll")}>
    <header className="studio-poll-head">
      <div>
        <h2>{poll.question}</h2>
        <p className="studio-poll-meta">
          <span className={cn("studio-poll-status", `is-${status}`)}>
            {pollStatusLabel(bt, status)}
          </span>
          {poll.anonymous
            ? <span><EyeOff size={12} aria-hidden /> {bt("익명", "Anonymous")}</span>
            : <span><UsersRound size={12} aria-hidden /> {bt("기명", "Named")}</span>}
          <span><Clock size={12} aria-hidden /> {bt(`${poll.createdByName} 시작`, `Started by ${poll.createdByName}`)}</span>
        </p>
      </div>
      {timeLeft != null && open ? <span className="studio-poll-countdown" role="timer" aria-live="off">
        <Timer size={14} aria-hidden />
        {formatCountdown(bt, timeLeft)}
      </span> : null}
    </header>

    <ul className="studio-poll-options">
      {tally.results.map((result) => {
        const votable = open && canVote && !didVote;
        return <li key={result.optionId} className={cn("studio-poll-option", !open && "is-closed")}>
          <div className="studio-poll-option-row">
            <button
              type="button"
              className="studio-poll-vote-btn"
              disabled={!votable}
              aria-label={bt(`"${result.text}"에 투표`, `Vote for "${result.text}"`)}
              onClick={() => onVote(result.optionId)}
            >
              <span className="studio-poll-option-text">{result.text}</span>
              <span className="studio-poll-option-count">
                {result.count}{voteUnit} · {result.percent}%
              </span>
            </button>
            <span
              className="studio-poll-bar"
              role="img"
              aria-label={bt(`"${result.text}" ${result.percent}% (${result.count}${voteUnit})`, `"${result.text}" ${result.percent}% (${result.count} votes)`)}
            >
              <span className="studio-poll-bar-fill" style={{ width: `${result.percent}%` }} aria-hidden="true" />
            </span>
          </div>
          {!poll.anonymous && result.voters.length > 0 ? <details className="studio-poll-voters">
            <summary>{bt(`투표자 ${result.voters.length}명`, `${result.voters.length} voters`)}</summary>
            <ul>
              {result.voters.map((voter) => <li key={voter.sessionId}>{voter.name}</li>)}
            </ul>
          </details> : null}
        </li>;
      })}
    </ul>

    <footer className="studio-poll-foot">
      <span className="studio-poll-total">
        <BarChart3 size={14} aria-hidden />
        {bt(`총 ${tally.totalVotes}표 · 참여 ${tally.uniqueVoters}명`, `${tally.totalVotes} votes · ${tally.uniqueVoters} voters`)}
      </span>
      {didVote && open ? <span className="studio-poll-voted">
        <Check size={14} aria-hidden />{bt("투표 완료", "Voted")}
      </span> : null}
      {!open && status === "expired" ? <span className="studio-poll-voted">
        <Clock size={14} aria-hidden />{bt("마감되었습니다", "Poll has ended")}
      </span> : null}
      {canClose && open ? <button type="button" className="studio-poll-secondary" onClick={onClose}>
        {bt("투표 마감하기", "Close poll")}
      </button> : null}
    </footer>
  </section>;
}
