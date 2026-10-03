import { CheckCircle2, ExternalLink, Images, Loader2, PlugZap } from "lucide-react";
import { useEffect, useState } from "react";

import {
  isStudioStockImageConfigured,
  loadStudioStockImageAccessKey,
  saveStudioStockImageAccessKey,
  searchStockPhotos,
  STUDIO_STOCK_IMAGE_DEVELOPER_SIGNUP_URL,
} from "@/domains/creator/studio-stock-image-client";

import { maskApiKey, validateApiKeyFormat } from "./api-key-hub-model";
import { StoredKeyRow } from "./MaskedKeyField";

function browserSessionStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

const INPUT =
  "min-h-11 w-full rounded-xl border border-line bg-canvas px-3 py-2 font-mono text-sm text-fg outline-none transition-colors placeholder:font-sans placeholder:text-fg-3 focus:border-accent";
const BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const PRIMARY = `${BUTTON} border-accent bg-accent text-on-accent hover:bg-accent/90`;

type Phase = "idle" | "testing" | "success" | "error";

/**
 * Unsplash Access Key 연결 카드 — 원클릭 연결 플로우.
 *
 * 입력 → 형식 검증 → 실제 연결 테스트 → 성공 애니메이션.
 * 키는 현재 탭 sessionStorage에만 저장되고 서버로 전송되지 않는다.
 * 벤치마킹: OpenAI API Keys(생성 후 즉시 검증 유도), Vercel(상태 배지).
 */
export function UnsplashKeyConnectCard() {
  const [storedKey, setStoredKey] = useState(() =>
    loadStudioStockImageAccessKey(browserSessionStorage()),
  );
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [justConnected, setJustConnected] = useState(false);

  const configured = isStudioStockImageConfigured(storedKey);
  const formatIssue = validateApiKeyFormat(draft);

  useEffect(() => {
    if (!justConnected) return;
    const timer = window.setTimeout(() => setJustConnected(false), 2600);
    return () => window.clearTimeout(timer);
  }, [justConnected]);

  async function copyKey(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(storedKey);
      return true;
    } catch {
      return false;
    }
  }

  function disconnect() {
    if (!saveStudioStockImageAccessKey(browserSessionStorage(), "")) {
      setPhase("error");
      setMessage("저장된 키를 지우지 못했습니다. 브라우저 저장소 상태를 확인하고 다시 시도하세요.");
      return;
    }
    setStoredKey("");
    setDraft("");
    setPhase("idle");
    setMessage("연결을 해제했습니다. 이 탭의 저장된 키를 지웠습니다.");
  }

  async function connect() {
    const issue = validateApiKeyFormat(draft);
    if (issue) {
      setPhase("error");
      setMessage(
        issue === "empty" ? "Access Key를 입력하세요." : "키가 너무 짧습니다. 복사한 키 전체를 붙여넣으세요.",
      );
      return;
    }
    const candidate = draft.trim();
    setPhase("testing");
    setMessage("Unsplash에 연결을 확인하고 있습니다…");
    // 실제 API 호출로 키 유효성을 검증한다 — 가벼운 검색 1회, 결과는 버린다.
    const result = await searchStockPhotos("paper texture", candidate, { page: 1 });
    if (!result.ok) {
      setPhase("error");
      setMessage(
        result.code === "http_error"
          ? "키가 유효하지 않거나 요청이 거부됐습니다. 키를 다시 확인하세요."
          : `연결 테스트에 실패했습니다: ${result.error}`,
      );
      return;
    }
    if (!saveStudioStockImageAccessKey(browserSessionStorage(), candidate)) {
      setPhase("error");
      setMessage("키는 유효하지만 이 탭에 저장하지 못했습니다. 시크릿 모드이거나 저장 공간이 부족할 수 있어요.");
      return;
    }
    setStoredKey(candidate);
    setDraft("");
    setPhase("success");
    setJustConnected(true);
    setMessage("연결됐습니다! 스튜디오에서 스톡 사진을 검색할 수 있어요.");
  }

  return (
    <article
      className={`flex min-h-64 flex-col rounded-2xl border bg-card p-5 shadow-sm transition-colors ${
        justConnected ? "border-good/60" : "border-line"
      }`}
      aria-labelledby="unsplash-key-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Images size={20} aria-hidden />
          </span>
          <div>
            <h2 id="unsplash-key-title" className="text-lg font-bold text-fg">
              무료 스톡 이미지
            </h2>
            <p className="text-xs text-fg-3">Unsplash · 사진 검색·캔버스 삽입</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            configured ? "bg-good/10 text-good" : "bg-fg-3/10 text-fg-3"
          }`}
        >
          {configured ? <CheckCircle2 size={13} aria-hidden /> : null}
          {configured ? "연결됨" : "미설정"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-fg-2">
        무료 Unsplash 계정으로 Access Key를 발급받아 연결하면 스톡 사진을 검색해 캔버스에 바로 넣을 수
        있어요.{" "}
        <a
          href={STUDIO_STOCK_IMAGE_DEVELOPER_SIGNUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline"
        >
          키 발급받기 <ExternalLink size={11} aria-hidden />
        </a>
      </p>

      <div className="mt-4 flex-1">
        {configured ? (
          <StoredKeyRow
            label="Unsplash Access Key"
            masked={maskApiKey(storedKey)}
            meta="현재 탭 세션에만 저장 · 서버 전송 없음"
            onCopy={copyKey}
            onRemove={disconnect}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-fg-2">Access Key 붙여넣기</span>
              <input
                type="password"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (phase === "error") {
                    setPhase("idle");
                    setMessage("");
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void connect();
                }}
                placeholder="Unsplash Access Key"
                className={INPUT}
                spellCheck={false}
                autoComplete="off"
                aria-describedby="unsplash-key-hint"
              />
            </label>
            <p id="unsplash-key-hint" className="text-[0.7rem] leading-5 text-fg-3">
              붙여넣으면 자동으로 연결 테스트를 거쳐 저장됩니다. 입력 중에는 어디에도 전송되지 않아요.
            </p>
          </div>
        )}
      </div>

      {message ? (
        <p
          role={phase === "error" ? "alert" : "status"}
          className={`mt-3 text-sm leading-6 ${
            phase === "error" ? "text-bad" : phase === "success" ? "text-good" : "text-fg-2"
          }`}
        >
          {phase === "testing" ? <Loader2 size={14} className="mr-1 inline animate-spin" aria-hidden /> : null}
          {phase === "success" ? <CheckCircle2 size={14} className="mr-1 inline" aria-hidden /> : null}
          {message}
        </p>
      ) : null}

      <div className="mt-auto pt-4">
        {!configured ? (
          <button
            type="button"
            onClick={() => void connect()}
            disabled={phase === "testing" || formatIssue !== null}
            className={PRIMARY}
          >
            {phase === "testing" ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <PlugZap size={16} aria-hidden />
            )}
            {phase === "testing" ? "연결 테스트 중…" : "연결하기"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
