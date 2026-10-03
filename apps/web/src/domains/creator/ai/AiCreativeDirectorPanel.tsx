import {
  BookOpenText,
  ChevronRight,
  CircleAlert,
  Clapperboard,
  Copy,
  Frame,
  Languages,
  LoaderCircle,
  LogIn,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  Square,
  UserRound,
  WandSparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { userAiAutomaticExternalConnectionsForCapability, useUserAi } from "@/shared/ai/user-ai-store";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import {
  completeStudioServerText,
  getStudioServerAiStatus,
  studioServerAiProviderLabel,
  type StudioServerAiProvider,
  type StudioServerAiStatus,
} from "../studio-server-ai-client";
import {
  AI_DIRECTOR_INPUT_LIMIT,
  AI_DIRECTOR_SUGGESTIONS,
  buildAiDirectorRequest,
  findAiDirectorSuggestion,
  resolveAiDirectorAvailability,
  type AiDirectorIcon,
  type AiDirectorSuggestion,
  type AiDirectorSuggestionId,
} from "./ai-creative-director";
import { AI_DIRECTOR_ANCHOR, LUNA_ART_BASE } from "./ai-studio-hub";
import { parseDirectorAnswer, type DirectorInline } from "./director-answer-format";

const SUGGESTION_ICONS: Readonly<Record<AiDirectorIcon, LucideIcon>> = {
  story: BookOpenText,
  character: UserRound,
  composition: Frame,
  direction: Clapperboard,
  translation: Languages,
};

interface DirectorAnswer {
  readonly suggestionId: AiDirectorSuggestionId;
  readonly content: string;
  readonly provider: StudioServerAiProvider;
  readonly model: string;
}

/** 개인 키 구성이 바뀔 때마다 다시 세도록 저장소 revision을 입력으로 받는다. */
function personalTextRouteCount(revision: number): number {
  return revision < 0 ? 0 : userAiAutomaticExternalConnectionsForCapability("text").length;
}

type StatusProbe =
  | { readonly phase: "checking" }
  | { readonly phase: "ready"; readonly status: StudioServerAiStatus }
  | { readonly phase: "failed" };

function useStudioAiStatus() {
  const [probe, setProbe] = useState<StatusProbe>({ phase: "checking" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setProbe({ phase: "checking" });
    getStudioServerAiStatus(controller.signal)
      .then((status) => {
        if (!controller.signal.aborted) setProbe({ phase: "ready", status });
      })
      .catch(() => {
        if (!controller.signal.aborted) setProbe({ phase: "failed" });
      });
    return () => controller.abort();
  }, [attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { probe, retry };
}

/**
 * AI 크리에이티브 디렉터 Luna. 제안 종류를 고르고 아이디어를 적으면 실제 무료 AI 경로로 요청한다.
 * 서버 무료 AI와 개인 무료 키가 모두 없으면 요청 버튼을 막고, 같은 일을 AI 없이 이어갈 도구로 안내한다.
 */
export function AiCreativeDirectorPanel({ className }: { readonly className?: string }) {
  const bt = useBilingual("AiCreativeDirectorPanel");
  const language = useI18n((state) => state.lang);
  const session = useSession();
  const aiRevision = useUserAi().revision;
  const { probe, retry } = useStudioAiStatus();
  const [selectedId, setSelectedId] = useState<AiDirectorSuggestionId>("story-expand");
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<DirectorAnswer | null>(null);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const pending = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const formId = useId();

  const personalRoutes = personalTextRouteCount(aiRevision);
  const availability = resolveAiDirectorAvailability({
    status: probe.phase === "ready" ? probe.status : null,
    statusFailed: probe.phase === "failed",
    personalRoutes,
    signedIn: Boolean(session.data?.user.id),
  });
  const selected = findAiDirectorSuggestion(selectedId) ?? AI_DIRECTOR_SUGGESTIONS[0];
  const trimmedIdea = idea.trim();

  useEffect(() => () => pending.current?.abort(), []);

  const chooseSuggestion = (suggestion: AiDirectorSuggestion) => {
    setSelectedId(suggestion.id);
    setError("");
    inputRef.current?.focus();
  };

  const cancel = () => {
    pending.current?.abort();
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy || !availability.canSubmit) return;
    const request = buildAiDirectorRequest(selected.id, idea, language);
    if (!request) {
      setError(bt("요청할 내용을 먼저 적어 주세요. ‘예시 넣기’로 시작할 수도 있어요.", "Write your request first, or start with “Use example”."));
      inputRef.current?.focus();
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setCopyState("idle");
    try {
      const result = await completeStudioServerText({
        task: request.task,
        promptVersion: 1,
        system: request.system,
        user: request.user,
        operationId: `director-${crypto.randomUUID()}`,
      }, controller.signal);
      if (controller.signal.aborted) {
        setError(bt("요청을 취소했어요. 같은 요청을 자동으로 다시 보내지 않아요.", "Request cancelled. It won't be resent automatically."));
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAnswer({
        suggestionId: selected.id,
        content: result.data.content,
        provider: result.data.provider,
        model: result.data.model,
      });
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error && cause.message ? cause.message : bt("AI 요청에 실패했어요.", "The AI request failed."));
      }
    } finally {
      if (pending.current === controller) pending.current = null;
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape" && busy) {
      event.preventDefault();
      cancel();
    }
  };

  const copyAnswer = async () => {
    if (!answer) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(answer.content);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const bubble = availability.state === "checking"
    ? bt("AI 연결을 확인하고 있어요. 그동안 무엇을 할지 골라 두세요.", "Checking the AI connection. Pick what you'd like to do meanwhile.")
    : availability.canSubmit
      ? bt("안녕하세요! 저는 당신의 AI 크리에이티브 디렉터, 루나예요. 어떤 이야기를 함께 만들어 볼까요?", "Hello! I'm Luna, your AI creative director. What story shall we build together?")
      : bt("지금은 AI 연결이 준비되지 않았어요. 할 일을 고르면 바로 쓸 수 있는 도구로 안내할게요.", "AI isn't connected right now. Pick a task and I'll point you to a tool you can use today.");

  const answerSuggestion = answer ? findAiDirectorSuggestion(answer.suggestionId) : undefined;

  return (
    <section
      id={AI_DIRECTOR_ANCHOR}
      aria-labelledby={`${formId}-title`}
      className={cn(
        "relative scroll-mt-24 overflow-hidden rounded-[2rem] border border-line bg-[radial-gradient(circle_at_12%_0%,color-mix(in_oklch,var(--color-accent)_24%,transparent),transparent_46%),radial-gradient(circle_at_100%_100%,color-mix(in_oklch,var(--color-accent-2)_14%,transparent),transparent_42%),var(--color-panel)] p-4 shadow-xl sm:p-6",
        className,
      )}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-7">
        <div className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] items-end gap-3 lg:sticky lg:top-4 lg:grid-cols-1 lg:items-stretch lg:self-start">
          <div className="h-32 overflow-hidden rounded-2xl border border-line bg-canvas sm:h-40 lg:h-[21rem] lg:rounded-[1.5rem]">
            <img
              src={`${LUNA_ART_BASE}-640.webp`}
              srcSet={`${LUNA_ART_BASE}-320.webp 320w, ${LUNA_ART_BASE}-640.webp 640w`}
              sizes="(min-width: 1024px) 24rem, 7rem"
              width={640}
              height={637}
              decoding="async"
              fetchPriority="high"
              alt={bt("은보라색 머리의 AI 크리에이티브 디렉터 Luna 일러스트", "Illustration of Luna, the AI creative director with silver-lilac hair")}
              className="size-full object-cover object-[center_16%]"
            />
          </div>
          <div className="min-w-0 rounded-2xl border border-accent/35 bg-card/90 p-3.5 shadow-lg">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-black text-fg">
              <Sparkles size={14} className="self-center text-accent" aria-hidden="true" />
              Luna
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-fg-3">AI Creative Director</span>
            </p>
            <p className="mt-1.5 text-sm leading-6 text-fg-2" aria-live="polite">{bubble}</p>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">AI Creative Director</p>
              <h2 id={`${formId}-title`} className="mt-1 text-2xl font-black tracking-[-0.03em] text-fg sm:text-[1.75rem]">
                {bt("무엇을 함께 만들까요?", "What shall we make together?")}
              </h2>
            </div>
            <DirectorStatusBadge availability={availability.state} model={availability.state === "server" ? availability.model : ""} />
          </div>

          <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label={bt("제안 목록", "Suggestions")}>
            {AI_DIRECTOR_SUGGESTIONS.map((suggestion) => {
              const Icon = SUGGESTION_ICONS[suggestion.icon];
              const active = suggestion.id === selected.id;
              return (
                <li key={suggestion.id} className="min-w-0">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => chooseSuggestion(suggestion)}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      active ? "border-accent bg-accent-soft" : "border-line bg-card/80 hover:border-line-strong hover:bg-raised/70",
                    )}
                  >
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", active ? "bg-accent text-on-accent" : "bg-panel text-accent")}>
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-fg">{bt(suggestion.title.ko, suggestion.title.en)}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-fg-3">{bt(suggestion.description.ko, suggestion.description.en)}</span>
                    </span>
                    <ChevronRight size={16} className={active ? "text-accent" : "text-fg-3"} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>

          <form className="mt-4" onSubmit={(event) => void submit(event)} aria-labelledby={`${formId}-title`}>
            <label htmlFor={`${formId}-idea`} className="text-sm font-bold text-fg">
              {bt(`${selected.title.ko} · 요청 내용`, `${selected.title.en} · your request`)}
            </label>
            <div className="mt-2 rounded-2xl border border-line bg-card focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
              <textarea
                id={`${formId}-idea`}
                ref={inputRef}
                value={idea}
                maxLength={AI_DIRECTOR_INPUT_LIMIT}
                rows={3}
                onChange={(event) => setIdea(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={bt(selected.placeholder.ko, selected.placeholder.en)}
                aria-describedby={`${formId}-hint`}
                className="block min-h-24 w-full resize-y rounded-2xl bg-transparent px-4 py-3 text-sm leading-6 text-fg outline-none placeholder:text-fg-3"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIdea(bt(selected.example.ko, selected.example.en));
                      inputRef.current?.focus();
                    }}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <WandSparkles size={14} aria-hidden="true" />
                    {bt("예시 넣기", "Use example")}
                  </button>
                  <span id={`${formId}-hint`} className="text-xs text-fg-3">
                    {bt("Ctrl/⌘ + Enter로 보내기", "Ctrl/⌘ + Enter to send")} · {idea.length}/{AI_DIRECTOR_INPUT_LIMIT}
                  </span>
                </div>
                {busy ? (
                  <button
                    type="button"
                    onClick={cancel}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-bold text-fg-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Square size={14} aria-hidden="true" />
                    {bt("취소", "Cancel")}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!availability.canSubmit || !trimmedIdea}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-black text-on-accent shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <SendHorizontal size={16} aria-hidden="true" />
                    {bt("루나에게 요청", "Ask Luna")}
                  </button>
                )}
              </div>
            </div>
          </form>

          {!availability.canSubmit && availability.state !== "checking" ? (
            <DirectorUnavailableNotice
              state={availability.state}
              suggestion={selected}
              onRetry={retry}
            />
          ) : null}

          <div aria-live="polite" className="mt-4 empty:hidden">
            {busy ? (
              <p role="status" className="flex items-center gap-2 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm font-semibold text-fg">
                <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {bt("루나가 제안을 정리하고 있어요… (Esc로 취소)", "Luna is drafting suggestions… (Esc to cancel)")}
              </p>
            ) : null}
          </div>

          {error ? (
            <div role="alert" className="mt-4 rounded-2xl border border-bad/40 bg-bad/10 p-4 text-sm leading-6 text-fg">
              <p className="flex items-start gap-2 font-bold">
                <CircleAlert size={16} className="mt-1 shrink-0 text-bad" aria-hidden="true" />
                <span>{error}</span>
              </p>
              <p className="mt-2 text-xs leading-5 text-fg-2">
                {bt("결과를 대신 지어내지 않아요. 연결을 확인한 뒤 다시 요청하거나 아래 도구로 직접 이어가세요.", "We never invent a result. Check the connection and try again, or continue with the tool below.")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/settings/ai" className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-xs font-bold text-fg-2 hover:text-fg">
                  {bt("AI 설정 확인", "Check AI settings")}
                </Link>
                <Link href={selected.tool.href} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-line px-3 text-xs font-bold text-accent hover:bg-accent-soft">
                  {bt(selected.tool.label.ko, selected.tool.label.en)}
                  <ChevronRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>
          ) : null}

          {answer && answerSuggestion ? (
            <article aria-labelledby={`${formId}-answer`} className="mt-4 rounded-2xl border border-accent/40 bg-card p-4 shadow-sm">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 id={`${formId}-answer`} className="text-base font-black text-fg">
                    {bt(`루나의 제안 · ${answerSuggestion.title.ko}`, `Luna's suggestions · ${answerSuggestion.title.en}`)}
                  </h3>
                  <p className="mt-1 text-xs text-fg-3">
                    {studioServerAiProviderLabel(answer.provider)} · {answer.model} · {bt("검토용 초안이에요. 작품에 자동으로 반영되지 않아요.", "A draft for review. Nothing is applied to your work automatically.")}
                  </p>
                </div>
              </header>
              <DirectorAnswerBody content={answer.content} />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyAnswer()}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-xs font-bold text-fg-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Copy size={14} aria-hidden="true" />
                  {bt("복사", "Copy")}
                </button>
                <button
                  type="button"
                  disabled={busy || !availability.canSubmit || !trimmedIdea}
                  onClick={() => void submit()}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-xs font-bold text-fg-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-45"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  {bt("다시 요청", "Ask again")}
                </button>
                <Link
                  href={answerSuggestion.tool.href}
                  className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-accent-soft px-3 text-xs font-bold text-accent hover:bg-accent/25"
                >
                  {bt(answerSuggestion.tool.label.ko, answerSuggestion.tool.label.en)}
                  <ChevronRight size={14} aria-hidden="true" />
                </Link>
                <span role="status" className="text-xs text-fg-3">
                  {copyState === "copied"
                    ? bt("복사했어요.", "Copied.")
                    : copyState === "failed"
                      ? bt("복사 권한이 없어요. 글을 직접 선택해 복사해 주세요.", "Clipboard blocked. Select the text to copy it.")
                      : ""}
                </span>
              </div>
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function InlineText({ parts }: { readonly parts: readonly DirectorInline[] }) {
  return <>{parts.map((part, index) => part.strong ? <strong key={index} className="font-bold text-fg">{part.text}</strong> : <span key={index}>{part.text}</span>)}</>;
}

/** 답변의 제목·목록·굵게만 화면 요소로 바꾼다. HTML은 해석하지 않는다. */
function DirectorAnswerBody({ content }: { readonly content: string }) {
  const blocks = parseDirectorAnswer(content);
  return (
    <div className="mt-3 max-h-[28rem] space-y-2.5 overflow-y-auto break-words rounded-xl bg-panel/70 p-4 text-sm leading-7 text-fg-2">
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return <h4 key={index} className="pt-1 text-sm font-black text-fg first:pt-0"><InlineText parts={block.inline} /></h4>;
        }
        if (block.kind === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag key={index} className={cn("space-y-1 pl-5", block.ordered ? "list-decimal" : "list-disc marker:text-accent")}>
              {block.items.map((item, itemIndex) => <li key={itemIndex}><InlineText parts={item} /></li>)}
            </ListTag>
          );
        }
        return <p key={index}><InlineText parts={block.inline} /></p>;
      })}
    </div>
  );
}

function DirectorStatusBadge({ availability, model }: { readonly availability: string; readonly model: string }) {
  const bt = useBilingual("AiCreativeDirectorPanel.status");
  const label = availability === "server"
    ? bt("자동 무료 AI 연결됨", "Free AI connected")
    : availability === "personal"
      ? bt("내 무료 키로 요청", "Using your free key")
      : availability === "login"
        ? bt("로그인하면 사용 가능", "Sign in to use")
        : availability === "checking"
          ? bt("연결 확인 중", "Checking connection")
          : bt("AI 연결 필요", "AI not connected");
  const ready = availability === "server" || availability === "personal";
  return (
    <span
      title={model || undefined}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold",
        ready ? "border-good/45 bg-good/12 text-fg" : availability === "checking" ? "border-line bg-raised text-fg-2" : "border-warn/45 bg-warn/12 text-fg",
      )}
    >
      <span aria-hidden="true" className={cn("size-2 rounded-full", ready ? "bg-good" : availability === "checking" ? "bg-fg-3" : "bg-warn")} />
      {label}
    </span>
  );
}

function DirectorUnavailableNotice({
  state,
  suggestion,
  onRetry,
}: {
  readonly state: "login" | "unavailable";
  readonly suggestion: AiDirectorSuggestion;
  readonly onRetry: () => void;
}) {
  const bt = useBilingual("AiCreativeDirectorPanel.unavailable");
  return (
    <div role="status" className="mt-4 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm leading-6">
      <p className="font-black text-fg">
        {state === "login"
          ? bt("로그인하면 자동 무료 AI로 바로 요청할 수 있어요.", "Sign in to ask with the free AI pool.")
          : bt("지금은 AI 연결이 준비되지 않아 요청을 보낼 수 없어요.", "AI isn't connected, so requests can't be sent right now.")}
      </p>
      <p className="mt-1 text-xs leading-5 text-fg-2">
        {state === "login"
          ? bt("로그인하지 않으려면 AI 설정에서 개인 무료 API 키를 연결하세요. 입력한 내용은 그대로 남아 있어요.", "Prefer not to sign in? Connect a personal free API key in AI settings. Your text stays here.")
          : bt("자동 무료 AI 서버에 연결하지 못했고 연결된 개인 무료 키도 없어요. 예시 답변을 지어내지 않고, 같은 일을 직접 할 수 있는 도구를 안내해요.", "We couldn't reach the free AI server and no personal free key is connected. Instead of inventing an answer, here is a tool for the same job.")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {state === "login" ? (
          <Link href="/auth/login" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-black text-on-accent">
            <LogIn size={14} aria-hidden="true" />
            {bt("로그인", "Sign in")}
          </Link>
        ) : null}
        <Link href="/settings/ai" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 hover:text-fg">
          {bt("내 무료 키 연결", "Connect a free key")}
        </Link>
        <Link href={suggestion.tool.href} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-accent/40 bg-card px-3 text-xs font-bold text-accent hover:bg-accent-soft">
          {bt(suggestion.tool.label.ko, suggestion.tool.label.en)}
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <RotateCcw size={14} aria-hidden="true" />
          {bt("연결 다시 확인", "Check again")}
        </button>
      </div>
    </div>
  );
}
