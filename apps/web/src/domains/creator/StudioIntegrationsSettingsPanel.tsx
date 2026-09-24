// Studio 연동 허브. AI 자격 증명 편집은 `/settings/ai` 한 곳만 소유하고, 이 패널은
// 비밀값을 다시 렌더하지 않는 연결 상태 카드만 제공한다. Unsplash Access Key는 AI 라우팅과
// 별개인 스톡 이미지 브라우저 자격 증명이므로 현재 탭 범위 입력을 이곳에서 유지한다.
import { CheckCircle2, Eye, EyeOff, ExternalLink, Images } from "lucide-react";
import { useEffect, useState } from "react";

import { UnifiedAiSettingsEntryCard } from "@/shared/ai/UnifiedAiSettings";
import {
  discardLegacyStudioStockImageAccessKey,
  isStudioStockImageConfigured,
  loadStudioStockImageAccessKey,
  saveStudioStockImageAccessKey,
  STUDIO_STOCK_IMAGE_DEVELOPER_SIGNUP_URL,
} from "./studio-stock-image-client";

import type { StudioAiSettings } from "./ai/studio-ai-client";

const LABEL = "block text-[0.65rem] font-medium text-fg-2";
const INPUT =
  "min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export interface StudioIntegrationsSettingsPanelProps {
  aiSettings: StudioAiSettings;
  onAiSettingsChange: (next: StudioAiSettings) => void;
}

function browserStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  try {
    const scope = globalThis as typeof globalThis & Partial<
      Pick<Window, "localStorage" | "sessionStorage">
    >;
    return scope[kind] ?? null;
  } catch {
    return null;
  }
}

export function StudioIntegrationsSettingsPanel(_legacyProps: StudioIntegrationsSettingsPanelProps) {
  const [accessKey, setAccessKey] = useState(() =>
    loadStudioStockImageAccessKey(browserStorage("sessionStorage")),
  );
  const [showAccessKey, setShowAccessKey] = useState(false);
  const stockImageConfigured = isStudioStockImageConfigured(accessKey);

  useEffect(() => {
    discardLegacyStudioStockImageAccessKey(browserStorage("localStorage"));
  }, []);

  function updateAccessKey(next: string) {
    setAccessKey(next);
    saveStudioStockImageAccessKey(browserStorage("sessionStorage"), next);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[0.63rem] leading-relaxed text-fg-3">
        AI 연결은 통합 설정에서 메모리 전용 또는 암호화 보관함으로 관리해요. 텍스트·이미지·개인
        추론은 직접 연결하며, Hyper3D/Rodin 키만 작업 중 일시 전달되고 서버 저장·로그 대상에서 제외돼요.
      </p>

      <UnifiedAiSettingsEntryCard
        source="studio"
        title="AI 어시스트 연결"
        description="AI 키·모델·사용 순서는 통합 설정에 한 번만 등록하고 모든 제작 기능에서 함께 사용해요."
      />

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel/50 p-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-fg-1">
          <Images size={14} />
          무료 스톡 이미지 (Unsplash)
        </div>
        <p className="rounded-md border border-line bg-card/70 px-2 py-1.5 text-[0.63rem] leading-relaxed text-fg-3">
          무료 Unsplash 계정으로 Access Key를 발급받아 입력하면 스톡 사진을 검색해 캔버스에 바로 삽입할 수
          있어요. 키는 <span className="font-semibold text-fg-2">현재 탭 세션에만</span> 저장되고, 이 앱
          서버로는 전송되지 않아요 — 검색은 브라우저가 Unsplash로 직접 요청해요.{" "}
          <a
            href={STUDIO_STOCK_IMAGE_DEVELOPER_SIGNUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline"
          >
            키 발급받기 <ExternalLink size={9} />
          </a>
        </p>

        <label className="flex flex-col gap-1">
          <span className={LABEL}>Unsplash Access Key</span>
          <span className="relative flex items-center">
            <input
              type={showAccessKey ? "text" : "password"}
              value={accessKey}
              onChange={(e) => updateAccessKey(e.target.value)}
              placeholder="Access Key"
              className={`${INPUT} pr-12`}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowAccessKey((v) => !v)}
              aria-label={showAccessKey ? "Access Key 숨기기" : "Access Key 표시"}
              className="absolute right-0 grid size-11 place-items-center rounded-lg text-fg-3 transition-colors hover:bg-raised hover:text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {showAccessKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </label>

        {stockImageConfigured && (
          <span className="inline-flex items-center gap-1 text-[0.65rem] font-medium text-good">
            <CheckCircle2 size={13} /> Access Key 등록됨
          </span>
        )}
      </div>
    </div>
  );
}
