import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { ArrowUpRight, Globe2, Send } from "lucide-react";
import { useId, useRef, useState } from "react";

import type { FeedbackEntry, FeedbackKind } from "@toonspectrum/core/feedback";

import { useApp } from "@/shared/lib/store";
import {
  FEEDBACK_AREAS, FEEDBACK_AREA_LABELS, FEEDBACK_KINDS, FEEDBACK_KIND_LABELS, validateFeedbackInput,
} from "@toonspectrum/core/feedback";
import { isFeedbackEntry } from "@toonspectrum/core/feedback-response";
import { api, getApiErrorMessage } from "@/infrastructure/api";

interface Props {
  kind: FeedbackKind;
  onKindChange: (kind: FeedbackKind) => void;
  userId: string | null;
  hydrated: boolean;
  apiReady: boolean;
  onCreated: (entry: FeedbackEntry) => void;
  onSearch: (query: string) => void;
}
export function FeedbackComposer({ kind, onKindChange, userId, hydrated, apiReady, onCreated, onSearch }: Props) {
  const id = useId();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [area, setArea] = useState("studio");
  const [tags, setTags] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [publicConfirmed, setPublicConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const errorElement = useRef<HTMLParagraphElement | null>(null);
  const showError = (message: string) => {
    setError(message);
    window.requestAnimationFrame(() => errorElement.current?.focus());
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId || !apiReady || busy.current) return;
    const parsed = validateFeedbackInput({
      category: kind, title, text, tags: tags.split(/[,\n]/),
      metadata: { area, ...(kind === "bug" ? { steps, expected, actual } : {}) },
    });
    if (!parsed.value) { showError(parsed.error ?? "입력 내용을 확인해 주세요."); return; }
    if (!publicConfirmed) { showError("제보 내용의 공개 여부를 확인해 주세요."); return; }
    busy.current = true;
    setSending(true);
    setError("");
    try {
      const entry = await api.post<unknown>("/feedback/posts", parsed.value, { timeout: 30_000, referrerPolicy: "no-referrer" });
      if (useApp.getState().userId !== userId) return;
      if (!isFeedbackEntry(entry) || entry.category !== parsed.value.category) {
        throw new Error("등록 결과를 확인하지 못했어요. 중복 제보를 피하려면 내 제보 목록을 먼저 확인해 주세요. 입력 내용은 유지됩니다.");
      }
      setTitle(""); setText(""); setTags(""); setSteps(""); setExpected(""); setActual(""); setPublicConfirmed(false);
      onCreated(entry);
    } catch (cause) {
      showError(await getApiErrorMessage(cause, "제보가 등록되지 않았어요. 입력 내용은 그대로 보관하고 있습니다."));
    } finally { busy.current = false; setSending(false); }
  };

  if (!hydrated) return <p className="fb-notice" role="status">{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "로그인 상태를 확인하고 있어요.")}</p>;
  if (!userId) return (
    <div className="fb-guest">
      <Globe2 size={26} aria-hidden="true" />
      <h3>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "읽기는 누구나,")}<br />{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "참여는 로그인 후에")}</h3>
      <p>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "상단의 로그인 버튼으로 로그인하면 제보, 공감, 댓글에 참여할 수 있어요.")}</p>
      <a href="/support" className="fb-button">{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "로그인 없이 공개 문의 ")}<ArrowUpRight size={16} aria-hidden="true" /></a>
      <p className="fb-caption">{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "기존 공개 문의 게시판으로 이동합니다. 개인정보와 미공개 작품은 남기지 마세요.")}</p>
    </div>
  );
  return (
    <form className="fb-form" onSubmit={submit} aria-label={translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "공개 제보 작성")} noValidate aria-busy={sending}>
      <p className="fb-notice"><Globe2 size={16} aria-hidden="true" /> {translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "제목·내용·재현 정보는 모두 공개됩니다.")}</p>
      {!apiReady && <p className="fb-notice" role="status">{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "입력 내용은 유지됩니다. 작성은 계속할 수 있고, 목록 연결이 확인되면 등록할 수 있어요.")}</p>}
      <fieldset disabled={sending}>
        <div className="fb-form-pair">
          <div><label htmlFor={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-kind"), { v0: String(id) })}>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "제보 유형")}</label><select id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-kind"), { v0: String(id) })} value={kind} onChange={(event) => onKindChange(event.target.value as FeedbackKind)}>{FEEDBACK_KINDS.map((key) => <option key={key} value={key}>{FEEDBACK_KIND_LABELS[key]}</option>)}</select></div>
          <div><label htmlFor={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-area"), { v0: String(id) })}>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "관련 기능")}</label><select id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-area"), { v0: String(id) })} value={area} onChange={(event) => setArea(event.target.value)}>{FEEDBACK_AREAS.map((key) => <option key={key} value={key}>{FEEDBACK_AREA_LABELS[key]}</option>)}</select></div>
        </div>
        <label htmlFor={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-title"), { v0: String(id) })}>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "제목 ")}<span>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "필수")}</span></label>
        <input id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-title"), { v0: String(id) })} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder={kind === "bug" ? translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "예: 필터 적용 후 브러시가 멈춰요") : translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "어떤 기능이 있으면 좋을까요?")} required minLength={2} />
        <button className="fb-text-button" type="button" disabled={title.trim().length < 2} onClick={() => onSearch(title.trim())}>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "제목으로 기존 제보 찾아보기 ")}<ArrowUpRight size={13} aria-hidden="true" /></button>
        <label htmlFor={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-text"), { v0: String(id) })}>{kind === "bug" ? translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "어떤 문제가 있었나요?") : translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "의견과 요청 내용")} <span>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "필수")}</span></label>
        <textarea id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-text"), { v0: String(id) })} value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} minLength={5} rows={5} placeholder={kind === "bug" ? translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "문제가 생긴 상황과 작업에 미친 영향을 알려주세요.") : translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "원하는 동작과 이 기능이 필요한 상황을 알려주세요.")} required aria-describedby={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-privacy {v1}-length"), { v0: String(id), v1: String(id) })} />
        <p id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-length"), { v0: String(id) })} className="fb-counter">{text.length.toLocaleString()} / 2,000</p>
        {kind === "bug" && <details className="fb-reproduction" open>
          <summary>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "재현 정보를 더하면 확인이 빨라져요")}</summary>
          <label htmlFor={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-steps"), { v0: String(id) })}>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "재현 순서 ")}<span>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "선택")}</span></label><textarea id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-steps"), { v0: String(id) })} value={steps} onChange={(event) => setSteps(event.target.value)} maxLength={1200} rows={3} placeholder={translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "1. 스튜디오 열기 → 2. 필터 적용 → 3. 브러시 사용")} />
          <label htmlFor={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-expected"), { v0: String(id) })}>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "기대했던 동작 ")}<span>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "선택")}</span></label><textarea id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-expected"), { v0: String(id) })} value={expected} onChange={(event) => setExpected(event.target.value)} maxLength={1200} rows={2} />
          <label htmlFor={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-actual"), { v0: String(id) })}>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "실제로 발생한 동작 ")}<span>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "선택")}</span></label><textarea id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-actual"), { v0: String(id) })} value={actual} onChange={(event) => setActual(event.target.value)} maxLength={1200} rows={2} />
        </details>}
        <label htmlFor={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-tags"), { v0: String(id) })}>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "태그 ")}<span>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "선택 · 최대 5개")}</span></label><input id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-tags"), { v0: String(id) })} value={tags} onChange={(event) => setTags(event.target.value)} maxLength={104} placeholder={translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "브러시, 모바일 (쉼표로 구분)")} />
        <p id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-privacy"), { v0: String(id) })} className="fb-caption">{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "비밀번호, 이메일, 연락처, 결제 정보, 미공개 작품은 입력하지 마세요. 브라우저 정보나 현재 URL은 자동 수집하지 않습니다.")}</p>
        <div className="fb-consent"><input id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-public"), { v0: String(id) })} type="checkbox" checked={publicConfirmed} onChange={(event) => setPublicConfirmed(event.target.checked)} /><label htmlFor={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "en", "{v0}-public"), { v0: String(id) })}>{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "제보 내용이 공개되는 것을 확인했습니다.")}</label></div>
      </fieldset>
      {error && <p className="fb-error" role="alert" tabIndex={-1} ref={errorElement}>{error}</p>}
      <button type="submit" disabled={sending || !apiReady} className="fb-button fb-primary fb-full"><Send size={16} aria-hidden="true" />{sending ? translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "등록 중…") : translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "공개 제보 등록")}</button>
      <p className="fb-caption">{translateCurrentStaticSourceText("domains.legal.feedback.FeedbackComposer", "ko", "공감 수는 참고 자료이며, 반영 여부나 일정을 보장하지 않습니다.")}</p>
    </form>
  );
}
