import { useEffect, useState } from "react";

import { studioAnimaticPngDecodedBytes } from "./studio-animatic-image-budget";
import { ANIMATIC_WORKSPACE_LIMITS, studioAnimaticWorkspaceAssetRefs, type StudioAnimaticWorkspaceDocument } from "./studio-animatic-workspace";

import type { StudioAnimaticWorkspaceRepository } from "./studio-animatic-workspace-persistence";

export async function decodeStudioAnimaticAudio(blob: Blob): Promise<AudioBuffer> {
  const url = URL.createObjectURL(blob);
  const audio = new Audio();
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("오디오 파일 정보를 읽는 시간이 초과되었습니다.")), 15000);
      audio.preload = "metadata";
      audio.onloadedmetadata = () => { clearTimeout(timeout); resolve(audio.duration); };
      audio.onerror = () => { clearTimeout(timeout); reject(new Error("이 브라우저에서 읽을 수 없는 오디오 파일입니다.")); };
      audio.src = url;
    });
    if (!Number.isFinite(duration) || duration <= 0 || duration > 600) throw new Error("오디오는 최대 10분까지 가져올 수 있습니다.");
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      if (buffer.length * buffer.numberOfChannels * 4 > ANIMATIC_WORKSPACE_LIMITS.assetBytes) throw new Error("오디오의 압축 해제 크기가 256MB를 넘습니다.");
      return buffer;
    } finally { await context.close().catch(() => undefined); }
  } finally {
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(url);
  }
}

export function useStudioAnimaticMedia(workspace: StudioAnimaticWorkspaceDocument | null, repository: StudioAnimaticWorkspaceRepository) {
  const refs = workspace ? studioAnimaticWorkspaceAssetRefs(workspace) : [];
  const signature = JSON.stringify(refs);
  const [state, setState] = useState<{ images: ReadonlyMap<string, ImageBitmap>; audio: ReadonlyMap<string, AudioBuffer>; busy: boolean; error: string | null }>({ images: new Map(), audio: new Map(), busy: false, error: null });
  useEffect(() => {
    let active = true;
    const images = new Map<string, ImageBitmap>();
    const audio = new Map<string, AudioBuffer>();
    setState((current) => ({ ...current, busy: true, error: null }));
    void (async () => {
      let decodedBytes = 0;
      const assets = JSON.parse(signature) as typeof refs;
      for (const ref of assets) {
        if (!active) return;
        const bytes = await repository.getAsset(ref);
        const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: ref.mime });
        if (ref.mime === "image/png") {
          const reservedBytes = studioAnimaticPngDecodedBytes(bytes, ANIMATIC_WORKSPACE_LIMITS.assetBytes - decodedBytes);
          const bitmap = await createImageBitmap(blob);
          if (!active) { bitmap.close(); return; }
          if (bitmap.width * bitmap.height * 4 !== reservedBytes) { bitmap.close(); throw new Error("PNG 헤더와 실제 이미지 크기가 다릅니다."); }
          decodedBytes += bitmap.width * bitmap.height * 4;
          images.set(ref.hash, bitmap);
        } else {
          const buffer = await decodeStudioAnimaticAudio(blob);
          if (!active) return;
          decodedBytes += buffer.length * buffer.numberOfChannels * 4;
          audio.set(ref.hash, buffer);
        }
        if (decodedBytes > ANIMATIC_WORKSPACE_LIMITS.assetBytes) throw new Error("미리보기에 필요한 이미지·오디오가 256MB를 넘습니다. 사용하지 않는 버전이나 트랙을 정리하세요.");
      }
      if (active) setState({ images, audio, busy: false, error: null });
    })().catch((error: unknown) => {
      for (const bitmap of images.values()) bitmap.close();
      if (active) setState({ images: new Map(), audio: new Map(), busy: false, error: error instanceof Error ? error.message : String(error) });
    });
    return () => { active = false; for (const bitmap of images.values()) bitmap.close(); images.clear(); audio.clear(); };
  }, [repository, signature]);
  return state;
}
