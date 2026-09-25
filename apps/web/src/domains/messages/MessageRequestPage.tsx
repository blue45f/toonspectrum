import { ArrowLeft, LoaderCircle, MailPlus, Send, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { getApiErrorMessage } from "@/platform/api";
import {
  messagingClient,
  type MessagingContextType,
  type MessagingRequestCategory,
} from "@/platform/messaging-client";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";

const CATEGORY_OPTIONS: ReadonlyArray<{
  value: MessagingRequestCategory;
  label: string;
  description: string;
}> = [
  { value: "feedback", label: "작품 피드백", description: "공개 댓글보다 자세하거나 비공개인 감상을 전합니다." },
  { value: "collaboration", label: "협업 제안", description: "공동 창작, 편집, 제작 참여를 제안합니다." },
  { value: "business", label: "비즈니스 문의", description: "연재, 외주, 라이선스 등 업무 목적의 문의입니다." },
  { value: "general", label: "일반 문의", description: "위 항목에 해당하지 않는 개인 문의입니다." },
];

function contextType(value: string | null): MessagingContextType {
  return value === "work" || value === "project" || value === "general" ? value : "profile";
}

export function MessageRequestPage() {
  useDocumentTitle("새 메시지 요청 · ToonStudio");
  const session = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const recipientId = searchParams.get("to")?.trim() ?? "";
  const recipientName = searchParams.get("name")?.trim() || "회원";
  const linkedContextType = contextType(searchParams.get("contextType"));
  const linkedContextId = searchParams.get("contextId")?.trim() || undefined;
  const linkedContextLabel = searchParams.get("contextLabel")?.trim() || undefined;
  const [category, setCategory] = useState<MessagingRequestCategory>(
    linkedContextType === "work" ? "feedback" : linkedContextType === "project" ? "collaboration" : "general"
  );
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionCheckTimedOut, setSessionCheckTimedOut] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = text.trim();
    if (!recipientId || !normalized || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await messagingClient.createRequest({
        recipientId,
        category,
        text: normalized,
        contextType: linkedContextType,
        contextId: linkedContextId,
        contextLabel: linkedContextLabel,
      });
      navigate(`/messages/${encodeURIComponent(result.thread.id)}`, { replace: true });
    } catch (requestError) {
      setError(await getApiErrorMessage(requestError, "메시지 요청을 보내지 못했어요."));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (session.ready) {
      setSessionCheckTimedOut(false);
      return;
    }
    const timeoutId = window.setTimeout(() => setSessionCheckTimedOut(true), 4_500);
    return () => window.clearTimeout(timeoutId);
  }, [session.ready]);

  if (!session.ready && !sessionCheckTimedOut) {
    return (
      <div data-route-pending="" role="status" className="grid min-h-[55vh] place-items-center px-6 text-center">
        <div>
          <LoaderCircle className="mx-auto animate-spin text-accent" aria-hidden="true" />
          <p className="mt-3 text-sm text-fg-2">로그인 상태를 확인하고 있어요.</p>
        </div>
      </div>
    );
  }

  if (!session.ready) {
    return (
      <Container size="prose" className="py-16 sm:py-24">
        <div role="alert" className="rounded-3xl border border-warn/35 bg-card p-8 text-center sm:p-12">
          <MailPlus size={36} className="mx-auto text-warn" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-bold">새 메시지</h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">로그인 상태를 확인하지 못했어요. 받는 회원과 작성 중인 주소는 유지됩니다.</p>
          <button type="button" onClick={() => window.location.reload()} className={buttonClass({ size: "sm", variant: "outline", className: "mt-5" })}>다시 확인</button>
        </div>
      </Container>
    );
  }

  if (session.status !== "authenticated") {
    return (
      <Container size="prose" className="py-16 sm:py-24">
        <div className="rounded-3xl border border-line bg-card p-8 text-center sm:p-12">
          <MailPlus size={36} className="mx-auto text-accent" />
          <h1 className="mt-4 text-2xl font-bold">로그인 후 메시지를 보낼 수 있어요.</h1>
          <p className="mt-2 text-sm text-fg-2">스팸 방지를 위해 인증된 회원만 새 메시지 요청을 보낼 수 있습니다.</p>
        </div>
      </Container>
    );
  }

  if (!recipientId) {
    return (
      <Container size="prose" className="py-16 sm:py-24">
        <div className="rounded-3xl border border-line bg-card p-8 text-center sm:p-12">
          <MailPlus size={36} className="mx-auto text-fg-3" />
          <h1 className="mt-4 text-2xl font-bold">받는 회원을 확인할 수 없어요.</h1>
          <p className="mt-2 text-sm text-fg-2">회원 프로필의 메시지 버튼에서 다시 시작해 주세요.</p>
          <Link href="/messages" className={buttonClass({ size: "sm", variant: "outline", className: "mt-5" })}>메시지함으로</Link>
        </div>
      </Container>
    );
  }

  return (
    <Container size="prose" className="py-8 sm:py-12">
      <Link href={`/u/${encodeURIComponent(recipientId)}`} className="inline-flex items-center gap-1.5 text-sm text-fg-2 hover:text-fg">
        <ArrowLeft size={15} /> 프로필로 돌아가기
      </Link>

      <div className="mt-4 overflow-hidden rounded-3xl border border-line bg-card shadow-sm">
        <header className="border-b border-line bg-ledger px-5 py-6 sm:px-8 sm:py-8">
          <p className="eyebrow text-accent">MESSAGE REQUEST</p>
          <h1 className="mt-2 text-2xl font-bold">{recipientName} 님에게 메시지 요청</h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">
            상대가 수락하기 전에는 이 첫 메시지 한 건만 전달됩니다.
          </p>
          {linkedContextLabel && (
            <div className="mt-4 rounded-xl border border-line bg-card/80 px-4 py-3 text-sm">
              <span className="text-fg-2">연결된 {linkedContextType === "project" ? "프로젝트" : "작품"}</span>
              <strong className="ml-2 text-fg">{linkedContextLabel}</strong>
            </div>
          )}
        </header>

        <form onSubmit={submit} className="space-y-6 p-5 sm:p-8">
          {error && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
          )}

          <fieldset>
            <legend className="text-sm font-semibold">요청 목적</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {CATEGORY_OPTIONS.map((option) => {
                const selected = category === option.value;
                return (
                  <label
                    key={option.value}
                    htmlFor={`message-category-${option.value}`}
                    aria-label={option.label}
                    className={`cursor-pointer rounded-2xl border p-4 transition ${selected ? "border-accent bg-accent-soft" : "border-line bg-bg hover:border-line-strong"}`}
                  >
                    <span className="flex items-start gap-2.5">
                      <input
                        id={`message-category-${option.value}`}
                        type="radio"
                        name="category"
                        value={option.value}
                        checked={selected}
                        onChange={() => setCategory(option.value)}
                        className="mt-0.5 size-4 accent-accent"
                      />
                      <span>
                        <span className="block text-sm font-semibold">{option.label}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-fg-2">{option.description}</span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-sm font-semibold">첫 메시지</span>
            <span className="ml-2 text-xs text-fg-3">최대 300자</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 300))}
              rows={7}
              required
              placeholder="간단한 소개와 연락 목적을 적어 주세요. 첫 요청에는 외부 링크를 넣을 수 없습니다."
              className="mt-3 w-full resize-none rounded-2xl border border-line bg-bg px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-fg-3 focus:border-accent"
            />
            <span className="mt-1.5 block text-right text-xs text-fg-3">{text.length}/300</span>
          </label>

          <div className="rounded-2xl border border-line bg-panel px-4 py-4">
            <div className="flex gap-3">
              <ShieldCheck size={20} className="shrink-0 text-accent" />
              <div>
                <p className="text-sm font-semibold">안전한 첫 연락</p>
                <ul className="mt-2 space-y-1 text-xs leading-relaxed text-fg-2">
                  <li>상대가 수락하기 전에는 추가 메시지를 보낼 수 없습니다.</li>
                  <li>동일 문구 반복과 과도한 요청은 자동으로 제한됩니다.</li>
                  <li>상대는 요청을 거절하거나 회원을 차단·신고할 수 있습니다.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link href={`/u/${encodeURIComponent(recipientId)}`} className={buttonClass({ size: "md", variant: "outline" })}>취소</Link>
            <button
              type="submit"
              disabled={!text.trim() || busy}
              className={buttonClass({ size: "md", variant: "solid", className: "gap-2" })}
            >
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
              요청 보내기
            </button>
          </div>
        </form>
      </div>
    </Container>
  );
}
