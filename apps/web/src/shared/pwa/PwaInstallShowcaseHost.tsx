import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { getPwaInstallSnapshot } from "@/shared/lib/pwa-install-store";

import {
  createBrowserPwaShowcaseScheduler,
  PWA_INSTALL_SHOWCASE_OPEN_EVENT,
} from "./pwa-install-showcase-schedule";

interface DialogProps {
  readonly onClose: () => void;
  readonly onInstalled: () => void;
  readonly trigger: "visit-count" | "offline-detected" | "manual" | null;
}

const ShowcaseDialog = lazy(() =>
  import("./PwaInstallShowcase").then((module) => ({
    default: module.PwaInstallShowcase,
  })),
);

function LazyShowcase(props: DialogProps) {
  return (
    <Suspense fallback={null}>
      <ShowcaseDialog
        onClose={props.onClose}
        onInstalled={props.onInstalled}
        trigger={props.trigger}
      />
    </Suspense>
  );
}

const AUTO_OPEN_DELAY_MS = 1_800;

/**
 * 설치 쇼케이스를 "적절한 순간"에 보여주는 호스트.
 * - 3번째 방문 이후 (스케줄러 규칙)
 * - 오프라인 감지 시 (별도 쿨다운)
 * - `toonstudio:open-install-showcase` 이벤트 (설정 메뉴 등에서 수동 호출)
 *
 * 이미 설치된 상태(standalone)에서는 절대 열지 않는다.
 */
export function PwaInstallShowcaseHost() {
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<DialogProps["trigger"]>(null);
  const schedulerRef = useRef<ReturnType<typeof createBrowserPwaShowcaseScheduler> | null>(null);

  const scheduler = useCallback(() => {
    if (!schedulerRef.current) schedulerRef.current = createBrowserPwaShowcaseScheduler();
    return schedulerRef.current;
  }, []);

  const close = useCallback(() => {
    scheduler().recordDismissed();
    setOpen(false);
  }, [scheduler]);

  const handleInstalled = useCallback(() => {
    scheduler().recordInstalled();
    setOpen(false);
  }, [scheduler]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const snapshot = getPwaInstallSnapshot();
    if (snapshot.standalone || snapshot.status === "installed") return;

    const visit = scheduler().recordVisit();
    let timer: number | undefined;
    if (visit.shouldPrompt) {
      timer = window.setTimeout(() => {
        setTrigger(visit.trigger);
        setOpen(true);
      }, AUTO_OPEN_DELAY_MS);
    }

    const onManualOpen = () => {
      setTrigger("manual");
      setOpen(true);
    };
    const onOffline = () => {
      if (scheduler().recordOfflineDetected()) {
        setTrigger("offline-detected");
        setOpen(true);
      }
    };
    window.addEventListener(PWA_INSTALL_SHOWCASE_OPEN_EVENT, onManualOpen);
    window.addEventListener("offline", onOffline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(PWA_INSTALL_SHOWCASE_OPEN_EVENT, onManualOpen);
      window.removeEventListener("offline", onOffline);
    };
  }, [scheduler]);

  if (!open) return null;
  return <LazyShowcase onClose={close} onInstalled={handleInstalled} trigger={trigger} />;
}
