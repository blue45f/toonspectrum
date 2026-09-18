import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from "react";

import {
  STUDIO_IMPORT_HANDOFF_QUERY_KEY,
  consumeStudioImportHandoff,
  peekStudioImportHandoff,
  type StudioImportHandoffTarget,
} from "../studio-import-handoff";

interface StudioImportHandoffHostProps {
  readonly brushPackImporting: boolean;
  readonly collaborationDocumentLocked: boolean;
  readonly interchangeImportBusy: boolean;
  readonly projectArchiveBusy: boolean;
  readonly psdImportBusy: boolean;
  readonly onImage: (event: ChangeEvent<HTMLInputElement>) => unknown;
  readonly onBrushPack: (event: ChangeEvent<HTMLInputElement>) => unknown;
  readonly onInterchange: (event: ChangeEvent<HTMLInputElement>) => unknown;
  readonly onProjectJson: (event: ChangeEvent<HTMLInputElement>) => unknown;
  readonly onPsd: (event: ChangeEvent<HTMLInputElement>) => unknown;
}

type HandoffStatus =
  | Readonly<{ state: "idle" }>
  | Readonly<{ state: "waiting"; fileName: string }>
  | Readonly<{ state: "failed"; message: string }>;

function syntheticChangeEvent(file: File): ChangeEvent<HTMLInputElement> {
  const input = { files: [file], value: "" } as unknown as HTMLInputElement;
  return { currentTarget: input, target: input } as ChangeEvent<HTMLInputElement>;
}

function removeHandoffQuery(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(STUDIO_IMPORT_HANDOFF_QUERY_KEY);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

function targetBusy(target: StudioImportHandoffTarget, props: StudioImportHandoffHostProps): boolean {
  if (target === "brush-pack") return props.brushPackImporting;
  if (target === "project-json") return props.projectArchiveBusy || props.collaborationDocumentLocked;
  if (target === "psd") {
    return props.psdImportBusy || props.interchangeImportBusy || props.collaborationDocumentLocked;
  }
  if (target === "interchange") {
    return props.interchangeImportBusy || props.psdImportBusy || props.collaborationDocumentLocked;
  }
  return false;
}

function invokeHandoff(
  target: StudioImportHandoffTarget,
  event: ChangeEvent<HTMLInputElement>,
  props: StudioImportHandoffHostProps,
): unknown {
  if (target === "image") return props.onImage(event);
  if (target === "brush-pack") return props.onBrushPack(event);
  if (target === "interchange") return props.onInterchange(event);
  if (target === "project-json") return props.onProjectJson(event);
  return props.onPsd(event);
}

/** Owns the single-use transition from the Studio import front door into existing editor handlers. */
export function StudioImportHandoffHost(props: StudioImportHandoffHostProps): ReactElement | null {
  const startedTokenRef = useRef<string | null>(null);
  const [status, setStatus] = useState<HandoffStatus>({ state: "idle" });

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get(STUDIO_IMPORT_HANDOFF_QUERY_KEY);
    if (!token || startedTokenRef.current === token) return;
    const pending = peekStudioImportHandoff(token);
    if (!pending) {
      startedTokenRef.current = token;
      removeHandoffQuery();
      setStatus({
        state: "failed",
        message: "가져올 파일 전달이 만료되었거나 새로고침으로 사라졌습니다. 파일을 다시 선택해 주세요.",
      });
      return;
    }
    if (targetBusy(pending.target, props)) {
      setStatus({ state: "waiting", fileName: pending.file.name });
      return;
    }

    const handoff = consumeStudioImportHandoff(token);
    if (!handoff) return;
    startedTokenRef.current = token;
    removeHandoffQuery();
    setStatus({ state: "idle" });
    try {
      const result = invokeHandoff(handoff.target, syntheticChangeEvent(handoff.file), props);
      void Promise.resolve(result).catch((error: unknown) => {
        setStatus({
          state: "failed",
          message: error instanceof Error ? error.message : "파일 가져오기를 시작하지 못했습니다.",
        });
      });
    } catch (error) {
      setStatus({
        state: "failed",
        message: error instanceof Error ? error.message : "파일 가져오기를 시작하지 못했습니다.",
      });
    }
  }, [props]);

  if (status.state === "idle") return null;
  if (status.state === "waiting") {
    return (
      <div
        role="status"
        className="mx-3 mt-2 flex shrink-0 items-center gap-2 rounded-xl border border-warning/35 bg-warning-soft/20 px-3 py-2 text-xs font-medium text-warning"
      >
        <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
        기존 가져오기 작업이 끝나면 {status.fileName} 파일을 이어서 처리합니다.
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="mx-3 mt-2 flex shrink-0 items-center gap-2 rounded-xl border border-danger/40 bg-danger-soft/20 px-3 py-2 text-xs font-medium text-danger"
    >
      <AlertTriangle size={15} aria-hidden="true" />
      {status.message}
    </div>
  );
}
