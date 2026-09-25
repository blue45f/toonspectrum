import { ExternalLink, FileAudio, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import type { LocalMusicTrack } from "./studio-music-client";
import type { MusicBrief } from "@toonspectrum/core/studio-music";

import {
  findMusicProvider,
  MUSIC_PROVIDER_CATALOG,
  type MusicProviderId,
} from "./studio-music-provider-catalog";
import { importExternalMusicTrack } from "./studio-music-import";

interface MusicExternalImportPanelProps {
  readonly brief: MusicBrief;
  readonly ownerId: string;
  readonly trackCount: number;
  readonly disabled: boolean;
  readonly onImport: (track: LocalMusicTrack) => Promise<void>;
  readonly onNotice: (message: string) => void;
  readonly onError: (message: string) => void;
}

const inputClass = "w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-accent bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

export function MusicExternalImportPanel({
  brief,
  ownerId,
  trackCount,
  disabled,
  onImport,
  onNotice,
  onError,
}: MusicExternalImportPanelProps) {
  const [providerId, setProviderId] = useState<MusicProviderId>("ace-step-local");
  const [file, setFile] = useState<File | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const provider = useMemo(() => findMusicProvider(providerId), [providerId]);

  const importTrack = async () => {
    if (disabled || busy) return;
    onError("");
    if (!ownerId) {
      onError("외부 음원을 개인 보관함에 넣으려면 먼저 로그인해 주세요.");
      return;
    }
    if (trackCount >= 20) {
      onError("보관함은 최대 20곡입니다. 기존 음원을 다운로드한 뒤 삭제해 공간을 확보해 주세요.");
      return;
    }
    if (!file) {
      onError("가져올 MP3 또는 WAV 파일을 선택해 주세요.");
      return;
    }
    if (!rightsConfirmed) {
      onError("입력 자료 권리와 공급자 이용 조건을 확인해 주세요.");
      return;
    }

    setBusy(true);
    try {
      const track = await importExternalMusicTrack(file, providerId, brief, ownerId);
      await onImport(track);
      setFile(null);
      setRightsConfirmed(false);
      setFileInputKey((value) => value + 1);
      onNotice(`${provider.name} 결과를 검증해 이 기기 보관함에 저장했습니다.`);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "외부 음원을 가져오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="external-music-import-heading"
      className="space-y-4 rounded-3xl border border-line bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="external-music-import-heading" className="flex items-center gap-2 text-xl font-bold">
            <FileAudio size={20} aria-hidden /> 생성 결과 가져오기
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            외부 서비스나 ACE-Step 로컬 CLI에서 만든 MP3·WAV를 검사한 뒤 기존 개인 보관함과 작품 BGM 흐름에 연결합니다.
            ToonStudio가 외부 계정에 로그인하거나 유료 생성을 자동 실행하지는 않습니다.
          </p>
        </div>
        <a
          href={provider.homeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold hover:bg-panel focus-visible:outline-2 focus-visible:outline-accent"
        >
          {provider.name}<ExternalLink size={14} aria-hidden />
        </a>
      </div>

      <fieldset disabled={disabled || busy} className="space-y-4 disabled:opacity-70">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-xs font-medium">
            생성 공급자
            <select
              className={inputClass}
              value={providerId}
              onChange={(event) => {
                setProviderId(event.target.value as MusicProviderId);
                setRightsConfirmed(false);
                onError("");
              }}
            >
              {MUSIC_PROVIDER_CATALOG.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-xs font-medium">
            MP3 또는 WAV · 최대 20MB
            <input
              key={fileInputKey}
              className={inputClass}
              type="file"
              accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setRightsConfirmed(false);
                onError("");
              }}
            />
          </label>
        </div>

        {file ? (
          <p className="text-xs text-fg-3">
            선택: {file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB
          </p>
        ) : null}
        <p className="text-xs leading-5 text-fg-3">{provider.rightsNote}</p>

        <label className="flex items-start gap-3 rounded-xl border border-line bg-canvas p-3 text-xs leading-5">
          <input
            type="checkbox"
            className="mt-1"
            checked={rightsConfirmed}
            onChange={(event) => setRightsConfirmed(event.target.checked)}
          />
          <span>
            이 파일과 입력 자료를 사용할 권한이 있으며, 생성 당시의 공급자 플랜·다운로드·상업 이용 조건을 직접 확인했습니다.
          </span>
        </label>

        <button
          type="button"
          className={buttonClass}
          disabled={disabled || busy || !ownerId || !file || !rightsConfirmed || trackCount >= 20}
          onClick={() => void importTrack()}
        >
          <ShieldCheck size={16} aria-hidden />
          {busy ? "검증·저장 중…" : "검증 후 보관함에 가져오기"}
        </button>
      </fieldset>
    </section>
  );
}
