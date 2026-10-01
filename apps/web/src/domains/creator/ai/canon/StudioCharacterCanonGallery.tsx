// 캐릭터별 생성 갤러리 — 이 캐릭터 시트로 프롬프트를 만든 패널(컷)들을 모아본다.
// 썸네일은 AI 코믹 디렉터 세션이 이 브라우저 localStorage에 남아 있을 때만
// 보여주고, 세션이 없으면 패널 요약·주입 시각 같은 기록 정보만 보여준다.
import { useEffect, useState } from "react";
import { ImageOff, UserRound } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { loadCanonPanelThumbnail } from "./useStudioCharacterCanon";
import type {
  CanonPanelUsage,
  CharacterCanonSheet,
} from "./studio-character-canon";

function formatInjectedAt(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return value;
  }
}

function UsageCard({
  usage,
  locale,
}: {
  readonly usage: CanonPanelUsage;
  readonly locale: string;
}) {
  const bt = useBilingual("canon.gallery");
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setThumbnail(loadCanonPanelThumbnail(window.localStorage, usage.sessionId, usage.panelIndex));
  }, [usage.sessionId, usage.panelIndex]);

  return (
    <li className="overflow-hidden rounded-xl border border-line bg-card">
      <span className="block aspect-[4/3] bg-raised">
        {thumbnail ? (
          <img src={thumbnail} alt={bt("생성된 패널 이미지", "Generated panel image")} className="size-full object-cover" loading="lazy" />
        ) : (
          <span className="grid size-full place-items-center text-fg-3">
            <ImageOff size={20} aria-hidden />
          </span>
        )}
      </span>
      <span className="block p-2">
        <strong className="block text-xs">
          {bt("컷", "Panel")} {usage.panelIndex + 1}
        </strong>
        {usage.panelSummary ? (
          <span className="mt-0.5 block truncate text-[0.65rem] text-fg-2">{usage.panelSummary}</span>
        ) : null}
        <span className="mt-0.5 block truncate text-[0.62rem] text-fg-3">
          {usage.sessionLabel || usage.sessionId} · {formatInjectedAt(usage.injectedAt, locale)}
        </span>
      </span>
    </li>
  );
}

export function StudioCharacterCanonGallery({
  sheets,
  usageForCharacter,
  activeId,
  onActiveChange,
  locale,
}: {
  readonly sheets: readonly CharacterCanonSheet[];
  readonly usageForCharacter: (characterId: string) => readonly CanonPanelUsage[];
  readonly activeId: string | null;
  readonly onActiveChange: (characterId: string) => void;
  readonly locale: string;
}) {
  const bt = useBilingual("canon.gallery");

  if (sheets.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-fg-3">
        {bt("아직 등록된 캐릭터가 없어요.", "No characters registered yet.")}
      </p>
    );
  }

  const active = sheets.find((sheet) => sheet.id === activeId) ?? sheets[0]!;
  const usages = usageForCharacter(active.id);

  return (
    <div>
      <div className="mb-3 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label={bt("캐릭터별 갤러리", "Gallery by character")}>
        {sheets.map((sheet) => (
          <button
            key={sheet.id}
            type="button"
            role="tab"
            aria-selected={sheet.id === active.id}
            onClick={() => onActiveChange(sheet.id)}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold",
              sheet.id === active.id
                ? "border-accent/60 bg-accent-soft text-fg"
                : "border-line bg-card text-fg-3 hover:text-fg",
            )}
          >
            <span className="grid size-6 place-items-center overflow-hidden rounded-full bg-raised">
              {sheet.referenceImage ? (
                <img src={sheet.referenceImage} alt="" className="size-full object-cover" />
              ) : (
                <UserRound size={12} className="text-fg-3" aria-hidden />
              )}
            </span>
            {sheet.name}
          </button>
        ))}
      </div>

      {usages.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-fg-3">
          {bt(
            "이 캐릭터로 만든 패널이 아직 없어요. AI 코믹 디렉터에서 이 캐릭터를 선택해 컷에 반영해 보세요.",
            "No panels made with this character yet. Select this character in the AI comic director and apply it to panels.",
          )}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {usages.map((usage) => (
            <UsageCard key={usage.id} usage={usage} locale={locale} />
          ))}
        </ul>
      )}
    </div>
  );
}
