/**
 * 핀 피드백 작성 중 @멘션 자동완성.
 *
 * 지금까지 "@이름 으로 멘션할 수 있어요"라는 안내만 있고 실제 입력은 제출 시점에
 * 본문에서 이름을 긁어 맞추는 방식이었다. 이제 @를 치는 순간 참여자 후보를 띄워
 * 고르게 하고, 제출 시에는 후보에서 고른 이름이 참여자 명단과 정확히 일치하므로
 * 멘션에 사용자 id까지 실어 보낼 수 있다(동명이인이 여럿이면 id를 비워 이름만).
 */

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
  type SyntheticEvent,
} from "react";

import type { StudioCommentActor } from "../studio-comments";
import {
  extractMentionNamesFromBody,
  type ManuscriptPinAssigneeOption,
} from "./manuscript-pin-feedback-model";

export type MentionCandidate = ManuscriptPinAssigneeOption;

const MENTION_SUGGESTION_LIMIT = 6;
const MENTION_QUERY_MAX_LENGTH = 40;

export interface ActiveMentionQuery {
  /** '@'의 위치(텍스트 인덱스). */
  readonly start: number;
  /** '@' 뒤부터 캐럿까지의 검색어. */
  readonly query: string;
}

/**
 * 캐럿 위치에서 작성 중인 멘션을 찾는다. '@'가 단어의 시작(문두 또는 공백 뒤)에
 * 있고 캐럿 사이에 공백이 없을 때만 멘션 작성 중으로 본다. 이메일처럼 단어
 * 중간에 붙은 '@'는 멘션이 아니다.
 */
export function activeMentionQuery(text: string, caret: number): ActiveMentionQuery | null {
  const safeCaret = Math.max(0, Math.min(caret, text.length));
  let index = safeCaret - 1;
  while (index >= 0) {
    const char = text[index] as string;
    if (char === "@") {
      const before = index === 0 ? "" : (text[index - 1] as string);
      if (index !== 0 && !/\s/.test(before)) return null;
      const query = text.slice(index + 1, safeCaret);
      if (query.length > MENTION_QUERY_MAX_LENGTH) return null;
      return { start: index, query };
    }
    if (/\s/.test(char)) return null;
    index -= 1;
  }
  return null;
}

/** 검색어와 맞는 후보. 앞에 붙는 일치를 먼저, 그다음 포함 일치를 원래 순서로. */
export function filterMentionCandidates(
  candidates: readonly MentionCandidate[],
  query: string,
  limit: number = MENTION_SUGGESTION_LIMIT,
): readonly MentionCandidate[] {
  const needle = query.trim().toLocaleLowerCase("ko-KR");
  if (!needle) return candidates.slice(0, limit);
  const startsWith: MentionCandidate[] = [];
  const contains: MentionCandidate[] = [];
  for (const candidate of candidates) {
    const name = candidate.displayName.toLocaleLowerCase("ko-KR");
    if (name.startsWith(needle)) startsWith.push(candidate);
    else if (name.includes(needle)) contains.push(candidate);
  }
  return [...startsWith, ...contains].slice(0, limit);
}

/** 후보를 고르면 '@검색어'를 '@이름 '으로 바꾸고 캐럿을 그 뒤에 둔다. */
export function applyMentionSelection(
  text: string,
  caret: number,
  candidate: MentionCandidate,
): { readonly text: string; readonly caret: number } | null {
  const active = activeMentionQuery(text, caret);
  if (active === null) return null;
  const insertion = `@${candidate.displayName} `;
  // 바로 뒤에 이미 공백이 있으면 삽입한 공백과 겹치지 않게 하나를 흡수한다.
  const rest = text.slice(caret).startsWith(" ") ? text.slice(caret + 1) : text.slice(caret);
  const nextText = text.slice(0, active.start) + insertion + rest;
  return { text: nextText, caret: active.start + insertion.length };
}

/**
 * 제출 시 멘션 확정. 본문에서 뽑은 이름이 참여자 명단에서 정확히 한 명과만
 * 일치하면 그 사용자의 id를 함께 실는다. 동명이인이거나 명단에 없으면 이름만
 * 남긴다 — 잘못된 사람에게 멘션이 가는 것보다 id가 없는 편이 안전하다.
 */
export function resolveMentionActors(
  body: string,
  options: readonly MentionCandidate[],
): readonly StudioCommentActor[] {
  return extractMentionNamesFromBody(body).map((displayName) => {
    const matches = options.filter((option) => option.displayName === displayName);
    return matches.length === 1 && matches[0] !== undefined
      ? { id: matches[0].id, displayName }
      : { displayName };
  });
}

export interface MentionAutocomplete {
  readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
  readonly open: boolean;
  readonly suggestions: readonly MentionCandidate[];
  readonly activeIndex: number;
  readonly setActiveIndex: (index: number) => void;
  readonly select: (candidate: MentionCandidate) => void;
  readonly handleChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  readonly handleSelect: (event: SyntheticEvent<HTMLTextAreaElement>) => void;
  readonly handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}

/**
 * textarea 하나에 붙는 멘션 자동완성 상태 기계.
 * 열림 여부는 (본문, 캐럿)에서 파생하고, Escape로 닫으면 다음 입력까지 유지한다.
 */
export function useMentionAutocomplete(input: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly candidates: readonly MentionCandidate[];
}): MentionAutocomplete {
  const { value, onChange, candidates } = input;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const pendingCaretRef = useRef<number | null>(null);

  const active = useMemo(() => activeMentionQuery(value, caret), [value, caret]);
  const suggestions = useMemo(
    () => (active === null ? [] : filterMentionCandidates(candidates, active.query)),
    [active, candidates],
  );
  const open = !dismissed && active !== null && suggestions.length > 0;
  const safeActiveIndex = open ? Math.min(activeIndex, suggestions.length - 1) : 0;

  // 후보 선택으로 본문이 바뀌면 캐럿을 삽입 지점 뒤로 실제로 옮긴다.
  useLayoutEffect(() => {
    const pending = pendingCaretRef.current;
    if (pending === null) return;
    pendingCaretRef.current = null;
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(pending, pending);
    }
    setCaret(pending);
  }, [value]);

  const select = useCallback(
    (candidate: MentionCandidate) => {
      const applied = applyMentionSelection(value, caret, candidate);
      if (applied === null) return;
      pendingCaretRef.current = applied.caret;
      setDismissed(false);
      setActiveIndex(0);
      onChange(applied.text);
    },
    [value, caret, onChange],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setCaret(event.target.selectionStart ?? event.target.value.length);
      setDismissed(false);
      setActiveIndex(0);
      onChange(event.target.value);
    },
    [onChange],
  );

  const handleSelect = useCallback((event: SyntheticEvent<HTMLTextAreaElement>) => {
    setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!open) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % suggestions.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
      } else if (event.key === "Enter" || event.key === "Tab") {
        const candidate = suggestions[safeActiveIndex];
        if (candidate === undefined) return;
        event.preventDefault();
        select(candidate);
      } else if (event.key === "Escape") {
        // 후보만 닫는다. 팝오버까지 닫는 상위 Escape와 겹치지 않게 전파를 막는다.
        event.preventDefault();
        event.stopPropagation();
        setDismissed(true);
      }
    },
    [open, suggestions, safeActiveIndex, select],
  );

  return {
    textareaRef,
    open,
    suggestions,
    activeIndex: safeActiveIndex,
    setActiveIndex,
    select,
    handleChange,
    handleSelect,
    handleKeyDown,
  };
}
