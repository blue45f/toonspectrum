import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookOpen, Boxes, ChevronRight, Send, Sparkles, UserRound, WandSparkles, type LucideIcon } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import {
  completeUserAiTextDetailed,
  isUserAiQuotaExhaustion,
  UserAiTransportError,
} from "@/shared/ai/user-ai-transport";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import { HOME_LUNA_SUGGESTIONS, homeArt } from "./reference-home-content";

const LUNA_ICONS: Readonly<Record<(typeof HOME_LUNA_SUGGESTIONS)[number]["icon"], LucideIcon>> = {
  story: BookOpen,
  character: UserRound,
  scene: Boxes,
  ai: WandSparkles,
};

/**
 * Luna의 답변 규칙. 화면에 렌더링되지 않는 모델 지시문이라 번역 대상이 아니다.
 * 실제 존재하는 시작 동선만 안내하고, 없는 기능을 있다고 말하지 않는다.
 */
const LUNA_SYSTEM_PROMPT = [
  "너는 ToonStudio의 창작 안내 캐릭터 Luna다.",
  "웹툰 창작을 시작하려는 사용자의 질문에 한국어로 짧고 구체적으로 답한다(최대 세 문장).",
  "안내할 수 있는 실제 시작 동선은 이것뿐이다: 새 작품 만들기, 스토리 연구실(아이디어를 기획서로 정리), 빈 캔버스(바로 그리기), 캐릭터 만들기, 3D 배경 잡기, 가상 스튜디오, AI 창작 도구, 배우기(학습 자료), 발견(다른 작품 구경).",
  "없는 기능이 있다고 말하지 않는다. 모르는 질문이면 스토리 연구실이나 서비스 소개로 안내한다.",
  "답변에 URL이나 마크다운을 쓰지 말고 동선 이름만 말한다.",
].join(" ");

interface LunaMessage {
  readonly id: number;
  readonly role: "luna" | "user";
  readonly text: string;
  readonly action?: { readonly href: string; readonly ko: string; readonly en: string };
}

const AI_KEY_ACTION = { href: "/settings/ai", ko: "AI 키 등록하기", en: "Add an AI key" } as const;
const HISTORY_LIMIT = 6;
const REPLY_MAX_LENGTH = 1200;

function buildLunaUserPrompt(history: readonly LunaMessage[], userText: string): string {
  const lines = history
    .slice(-HISTORY_LIMIT)
    .map((message) => `${message.role === "user" ? "사용자" : "Luna"}: ${message.text}`);
  lines.push(`사용자: ${userText}`, "Luna:");
  return lines.join("\n");
}

/**
 * 공개 홈의 Luna 창작 안내 패널.
 *
 * 제안 칩은 실제 시작 동선으로 연결하고, 입력창은 사용자가 등록한 AI 연결
 * (BYOK·무료 경로)으로 실제 답변을 만든다. 연결이 없으면 대화를 흉내 내지
 * 않고 키 등록 안내를 Luna의 말풍선으로 정직하게 보여 준다.
 */
export function HomeLunaPanel() {
  const bi = useBilingualLocalizer("domains.marketing.ReferenceCreatorDashboard");
  const [messages, setMessages] = useState<readonly LunaMessage[]>(() => [
    { id: 0, role: "luna", text: bi("안녕하세요! 어떤 이야기를 함께 만들어 볼까요?", "Hello! What story would you like to create?") },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const idRef = useRef(1);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, pending]);

  const pushMessage = (message: Omit<LunaMessage, "id">) => {
    const id = idRef.current;
    idRef.current += 1;
    setMessages((current) => [...current, { ...message, id }]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setInput("");
    pushMessage({ role: "user", text });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const completed = await completeUserAiTextDetailed(
        LUNA_SYSTEM_PROMPT,
        buildLunaUserPrompt(messages, text),
        controller.signal,
      );
      const reply = completed.content.trim().slice(0, REPLY_MAX_LENGTH);
      pushMessage({
        role: "luna",
        text: reply || bi("답변을 만들지 못했어요. 질문을 조금 바꿔서 다시 물어봐 주세요.", "I could not draft a reply. Try asking in a different way."),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof UserAiTransportError && error.code === "not-configured") {
        pushMessage({
          role: "luna",
          text: bi("아직 AI 연결이 설정되지 않아서 대화로 답할 수 없어요. AI 키를 등록하면 바로 대화할 수 있고, 그전에는 위 제안으로 시작할 수 있어요.", "AI is not connected yet, so I cannot chat. Add an AI key to talk with me, or start from a suggestion above."),
          action: AI_KEY_ACTION,
        });
      } else if (isUserAiQuotaExhaustion(error)) {
        pushMessage({
          role: "luna",
          text: bi("지금은 AI 사용 한도에 닿았어요. 한도가 회복되거나 내 키를 등록하면 대화를 이어 갈 수 있어요.", "The AI quota is exhausted for now. Chat resumes when it recovers or when you add your own key."),
          action: AI_KEY_ACTION,
        });
      } else {
        pushMessage({
          role: "luna",
          text: bi("답변을 가져오지 못했어요. 잠시 후 다시 물어봐 주세요.", "I could not fetch a reply. Please ask again in a moment."),
        });
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <aside className="rd-luna" aria-label={bi("Luna 창작 안내", "Luna creative guide")}>
      <div className="rd-luna-card">
        <div className="rd-luna-head">
          <img src={homeArt("luna", 320)} alt={bi("은보라색 머리의 창작 도우미 Luna", "Luna, a creative guide with silver-lilac hair")} width={96} height={96} decoding="async" />
          <strong>Luna</strong>
          <small>{bi("창작 안내", "Creative guide")}</small>
          <Sparkles size={14} aria-hidden="true" />
        </div>
        <div className="rd-luna-log" role="log" aria-live="polite" aria-label={bi("Luna와의 대화", "Conversation with Luna")} ref={logRef}>
          {messages.map((message) => (
            <div key={message.id} className={`rd-luna-msg rd-luna-msg--${message.role}`}>
              <p>{message.text}</p>
              {message.action && (
                <Link className="rd-luna-action" href={message.action.href}>
                  <span>{bi(message.action.ko, message.action.en)}</span>
                  <ChevronRight size={13} aria-hidden="true" />
                </Link>
              )}
            </div>
          ))}
          {pending && (
            <div className="rd-luna-msg rd-luna-msg--luna rd-luna-typing" role="status" aria-label={bi("Luna가 답을 쓰는 중", "Luna is writing a reply")}>
              <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
            </div>
          )}
        </div>
        <ul className="rd-luna-chips">
          {HOME_LUNA_SUGGESTIONS.map((suggestion) => {
            const Icon = LUNA_ICONS[suggestion.icon];
            return (
              <li key={suggestion.href}>
                <Link href={suggestion.href}><Icon size={13} aria-hidden="true" /><span>{bi(suggestion.ko, suggestion.en)}</span></Link>
              </li>
            );
          })}
        </ul>
        <form className="rd-luna-form" onSubmit={(event) => { void submit(event); }}>
          <label className="sr-only" htmlFor="rd-luna-input">{bi("Luna에게 물어보기", "Ask Luna")}</label>
          <input
            id="rd-luna-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={bi("Luna에게 물어보세요", "Ask Luna anything")}
            maxLength={500}
            autoComplete="off"
            disabled={pending}
          />
          <button type="submit" disabled={pending || !input.trim()} aria-label={bi("Luna에게 보내기", "Send to Luna")}>
            <Send size={15} aria-hidden="true" />
          </button>
        </form>
      </div>
    </aside>
  );
}
