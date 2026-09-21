import { useEffect, useState } from "react";
import type { StudioSessionMaterialAsset } from "@toonspectrum/studio-project-model/work-session";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** Mounted only by an explicit click. Uses the existing bounded, hashed private-asset reader. */
export function StudioSessionMaterialPreview({ workId, asset, title, expiresAt }: {
  readonly workId: string; readonly asset: StudioSessionMaterialAsset; readonly title: string; readonly expiresAt: string;
}) {
  const bt = useBilingual("StudioSessionMaterialPreview");
  const [grantedUntil] = useState(expiresAt);
  const assetId = asset.assetId, elementType = asset.elementType, digest = asset.sha256;
  const key = JSON.stringify([workId, assetId, elementType, digest]);
  const [state, setState] = useState<{ key: string; url: string | null; phase: "loading" | "ready" | "unavailable" }>({ key, url: null, phase: "loading" });
  useEffect(() => {
    const request = new AbortController(); let disposed = false, url: string | null = null;
    const remaining = Math.min(15_000, Date.parse(grantedUntil) - Date.now());
    setState({ key, url: null, phase: "loading" });
    if (elementType !== "image" || !Number.isFinite(remaining) || remaining <= 0) {
      setState({ key, url: null, phase: "unavailable" }); return;
    }
    const clear = () => {
      request.abort(); if (url) URL.revokeObjectURL(url); url = null;
      if (!disposed) setState({ key, url: null, phase: "unavailable" });
    };
    const visibility = () => { if (document.visibilityState === "hidden") clear(); };
    const expiry = setTimeout(clear, remaining);
    document.addEventListener("visibilitychange", visibility);
    void import("../studio-work-asset-client").then(({ downloadStudioWorkAsset }) => downloadStudioWorkAsset(workId, { assetId, elementType }, request.signal)).then((result) => {
      if (disposed || request.signal.aborted || document.visibilityState === "hidden") return;
      if (result.manifest.sha256 !== digest || !/^image\/(png|jpeg|webp)$/u.test(result.blob.type)) throw new Error("Material preview mismatch");
      url = URL.createObjectURL(result.blob); setState({ key, url, phase: "ready" });
    }).catch(() => { if (!disposed) setState({ key, url: null, phase: "unavailable" }); });
    return () => { disposed = true; request.abort(); clearTimeout(expiry); if (url) URL.revokeObjectURL(url); document.removeEventListener("visibilitychange", visibility); };
  }, [key, workId, assetId, elementType, digest, grantedUntil]);
  const visible = state.key === key ? state : null;
  return visible?.url ? <figure className="mt-3"><img className="max-h-64 w-full object-contain" src={visible.url} alt={title} referrerPolicy="no-referrer" />
    <figcaption className="mt-1 text-xs text-fg-3">{bt("현재 권한과 파일 해시를 확인한 미리보기", "Preview verified against current access and file hash")}</figcaption></figure>
    : <p role="status" className="mt-2 text-xs">{visible?.phase === "unavailable"
      ? bt("파일을 확인하지 못했거나 열람 시간이 끝났습니다. 닫은 뒤 다시 확인하세요.", "The file is unavailable or the read lease expired. Close and reopen to recheck.")
      : bt("파일 무결성과 열람 권한 확인 중…", "Checking file integrity and access…")}</p>;
}
