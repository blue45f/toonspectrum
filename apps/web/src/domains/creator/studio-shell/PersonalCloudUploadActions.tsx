import { CloudUpload, Link2, Loader2 } from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useT } from "@/shared/lib/i18n";
import {
  defineBilingualText,
  formatI18nTemplate,
  translateBilingualMap,
  type BilingualText,
} from "@/shared/lib/i18n-bilingual-copy";

import type {
  PersonalCloudConnectionStatus,
  PersonalCloudProviderId,
} from "../save-first/personal-cloud-client";
import type { PersonalCloudUploadProgress } from "../save-first/personal-cloud-upload";

interface ActiveUpload extends PersonalCloudUploadProgress {
  readonly provider: PersonalCloudProviderId;
}

const PHASE_LABELS: Readonly<Record<PersonalCloudUploadProgress["phase"], BilingualText>> = {
  preparing: { ko: "프로젝트 준비 중", en: "Preparing project" },
  checking: { ko: "원격 버전 확인 중", en: "Checking remote version" },
  uploading: { ko: "업로드 중", en: "Uploading" },
  finalizing: { ko: "저장 확인 중", en: "Finalizing" },
};

const COPY = {
  saveTo: defineBilingualText("personalCloudUpload", "saveTo", "{provider}에 저장", "Save to {provider}"),
  connect: defineBilingualText("personalCloudUpload", "connect", "{provider} 연결", "Connect {provider}"),
  needsSetup: defineBilingualText("personalCloudUpload", "needsSetup", "{provider} 설정 필요", "{provider} needs setup"),
} as const;

function percentage(progress: PersonalCloudUploadProgress): number {
  if (progress.totalBytes <= 0) return 0;
  return Math.min(100, Math.round((progress.uploadedBytes / progress.totalBytes) * 100));
}
export function PersonalCloudUploadActions({
  locale: _locale,
  connections,
  busyProvider,
  progress,
  onAction,
  disabled = false,
}: {
  /** @deprecated Global i18n state is used for visible copy. */
  readonly locale?: string;
  readonly connections: readonly PersonalCloudConnectionStatus[];
  readonly busyProvider: PersonalCloudProviderId | null;
  readonly progress: ActiveUpload | null;
  readonly onAction: (provider: PersonalCloudProviderId) => void;
  readonly disabled?: boolean;
}) {
  const t = useT();
  const phaseLabels = translateBilingualMap(t, "personalCloudUpload.phase", PHASE_LABELS);
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-3">
        {connections.map((connection) => {
          const busy = busyProvider === connection.provider;
          const connected = connection.connected;
          return (
            <button
              key={connection.provider}
              type="button"
              onClick={() => onAction(connection.provider)}
              disabled={disabled || !connection.configured || busy}
              className={buttonClass({
                variant: connected ? "outline" : "quiet",
                size: "sm",
                className: "min-w-0 justify-start gap-1.5",
              })}
            >
              {busy
                ? <Loader2 size={14} className="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                : connected
                  ? <CloudUpload size={14} className="shrink-0" aria-hidden="true" />
                  : <Link2 size={14} className="shrink-0" aria-hidden="true" />}
              <span className="truncate">
                {formatI18nTemplate(
                  t(connected ? COPY.saveTo : connection.configured ? COPY.connect : COPY.needsSetup),
                  { provider: connection.label },
                )}
              </span>
            </button>
          );
        })}
      </div>
      {progress ? (
        <div className="mt-3 rounded-xl border border-accent/25 bg-accent-soft/15 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3 text-[0.68rem] font-bold text-fg-2">
            <span>{phaseLabels[progress.phase]}</span>
            <span>{percentage(progress)}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel">
            <div
              className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none"
              style={{ width: `${percentage(progress)}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
