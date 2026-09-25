import type { LocalMusicTrack } from "./studio-music-client";
import type { MusicBrief } from "@toonspectrum/core/studio-music";

import {
  findMusicProvider,
  type MusicProviderId,
} from "./studio-music-provider-catalog";

import {
  isMp3,
  isWav,
  MUSIC_IMPORTED_MAX_BYTES,
  MUSIC_IMPORTED_MP3_FORMAT,
  MUSIC_IMPORTED_WAV_FORMAT,
  parseMusicBrief,
} from "@toonspectrum/core/studio-music";

function cleanFilename(value: string | undefined): string {
  const basename = (value ?? "external-music")
    .split(/[\\/]/u)
    .pop()
    ?.trim() || "external-music";
  return [...basename]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? "_" : character;
    })
    .join("")
    .slice(0, 255);
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("이 브라우저는 음원 무결성 해시 생성을 지원하지 않습니다.");
  }
  const digest = new Uint8Array(await subtle.digest("SHA-256", buffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function importExternalMusicTrack(
  file: Blob & { readonly name?: string },
  providerId: MusicProviderId,
  brief: MusicBrief,
  ownerId: string,
  now = new Date(),
): Promise<LocalMusicTrack> {
  if (!/^[a-zA-Z0-9_-]{1,160}$/u.test(ownerId)) {
    throw new Error("로그인 계정을 확인해 주세요.");
  }
  const provider = findMusicProvider(providerId);
  if (!(file instanceof Blob) || file.size <= 44 || file.size > MUSIC_IMPORTED_MAX_BYTES) {
    throw new Error("20MB 이하의 MP3 또는 WAV 파일을 선택해 주세요.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const format = isMp3(bytes)
    ? MUSIC_IMPORTED_MP3_FORMAT
    : isWav(bytes)
      ? MUSIC_IMPORTED_WAV_FORMAT
      : null;
  if (!format) {
    throw new Error("파일 내용이 올바른 MP3 또는 WAV가 아닙니다.");
  }

  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.randomUUID) {
    throw new Error("이 브라우저는 안전한 음원 ID 생성을 지원하지 않습니다.");
  }
  const parsed = parseMusicBrief({ ...brief, rightsConfirmed: true });
  const sourceFilename = cleanFilename(file.name);
  const hash = await sha256(arrayBuffer);
  const audio = new Blob([bytes], {
    type: format === MUSIC_IMPORTED_WAV_FORMAT ? "audio/wav" : "audio/mpeg",
  });

  return {
    ownerId,
    audio,
    metadata: {
      id: cryptoApi.randomUUID(),
      createdAt: now.toISOString(),
      provider: provider.id,
      model: "external",
      format,
      source: "imported",
      sourceFilename,
      licenseNote: `${provider.name}에서 생성·다운로드한 외부 음원입니다. ${provider.rightsNote}`,
      sha256: hash,
      brief: parsed,
      termsUrl: provider.homeUrl,
    },
  };
}
