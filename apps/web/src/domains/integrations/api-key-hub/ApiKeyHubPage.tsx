import { KeyRound, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { useI18n } from "@/shared/lib/i18n";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { Container } from "@/shared/components/section";

import { AiKeyStatusCard } from "./AiKeyStatusCard";
import { UnsplashKeyConnectCard } from "./UnsplashKeyConnectCard";

/**
 * API 키 허브 — 모든 외부 연동 키를 한 화면에서 관리한다.
 *
 * - AI API 키: 상태만 표시, 편집은 `/settings/ai` 소유 (기존 소유권 유지)
 * - Unsplash Access Key: 인라인 원클릭 연결 플로우
 * - 키 원문은 절대 렌더·로그하지 않고 마스킹 + 복사만 제공한다
 */
export function ApiKeyHubPage() {
  const lang = useI18n((state) => state.lang);
  const ko = lang.startsWith("ko");
  useDocumentTitle(ko ? "API 키 허브 · ToonStudio" : "API key hub · ToonStudio");

  return (
    <Container size="wide" className="py-8 sm:py-12">
      <Link
        to="/settings/integrations"
        className="inline-flex min-h-11 items-center text-sm font-bold text-accent"
      >
        ← {ko ? "연동 센터" : "Integration center"}
      </Link>

      <header className="mb-7 mt-3 max-w-3xl">
        <p className="eyebrow flex items-center gap-1.5 text-accent">
          <KeyRound size={14} aria-hidden /> API KEY HUB
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-4xl">
          {ko ? "API 키 허브" : "API key hub"}
        </h1>
        <p className="mt-3 text-sm leading-7 text-fg-2">
          {ko
            ? "외부 서비스 연결에 쓰는 키를 한곳에서 확인해요. 키는 마스킹해서 보여주고, 원문은 화면에도 로그에도 남기지 않습니다."
            : "Review every external service key in one place. Keys are always masked and never rendered or logged in plain text."}
        </p>
      </header>

      <section
        className="mb-6 rounded-2xl border border-line bg-panel/50 p-4"
        aria-label={ko ? "보안 안내" : "Security notice"}
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <ShieldCheck size={18} aria-hidden />
          </span>
          <div>
            <h2 className="font-bold text-fg">{ko ? "키는 내 브라우저에만" : "Keys stay in your browser"}</h2>
            <p className="mt-1 text-sm leading-6 text-fg-2">
              {ko
                ? "AI 키는 메모리 전용 또는 암호화 보관함에, Unsplash 키는 현재 탭 세션에만 저장됩니다. ToonStudio 서버로 키가 전송되지 않아요. 키를 다른 사람과 공유하지 마세요."
                : "AI keys live in memory or an encrypted vault; the Unsplash key lives in this tab's session only. Keys are never sent to ToonStudio servers. Never share your keys."}
            </p>
          </div>
        </div>
      </section>

      <section
        className="grid gap-4 md:grid-cols-2"
        aria-label={ko ? "연동 키 목록" : "Integration keys"}
      >
        <AiKeyStatusCard />
        <UnsplashKeyConnectCard />
      </section>

      <section
        className="mt-6 rounded-2xl border border-dashed border-line bg-card/50 p-6"
        aria-label={ko ? "추가 연동 안내" : "More integrations"}
      >
        <h2 className="font-bold text-fg">
          {ko ? "더 많은 연동이 필요하신가요?" : "Need more integrations?"}
        </h2>
        <p className="mt-2 text-sm leading-7 text-fg-2">
          {ko
            ? "저장소·업무·알림·게시·결제 공급자는 연동 센터에서 확인하세요. 키가 필요한 공급자는 여기에 카드가 추가됩니다."
            : "See storage, work, notification, publishing and payment providers in the integration center. Providers that need keys will appear here as cards."}
        </p>
        <Link
          to="/settings/integrations"
          className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg"
        >
          {ko ? "연동 센터 열기" : "Open integration center"}
        </Link>
      </section>
    </Container>
  );
}
