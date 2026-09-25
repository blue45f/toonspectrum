import { Suspense } from "react";

import { lazyRetry } from "@/shared/lib/lazy-retry";

export interface BrowserCompatModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: string;
  missingFeatures?: string[];
  isBlocking?: boolean;
}

const BrowserCompatModalContent = lazyRetry(
  () => import("./browser-compat-modal-content").then((module) => ({
    default: module.BrowserCompatModalContent,
  })),
  "BrowserCompatModalContent",
);

/** Supported browsers never need to download the optional compatibility dialog. */
export function BrowserCompatModal(props: BrowserCompatModalProps) {
  if (!props.isOpen) return null;
  return (
    <Suspense fallback={<p role="status" className="fixed bottom-4 left-4 z-[9999] rounded-xl bg-panel p-4 text-fg">브라우저 호환성 안내를 불러오는 중…</p>}>
      <BrowserCompatModalContent {...props} />
    </Suspense>
  );
}
