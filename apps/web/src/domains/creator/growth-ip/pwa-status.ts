// 앱 설치(PWA) 상태를 사람이 읽는 말로 — 성장·IP 작업대와 사용 환경 안내 페이지가 같은 라벨·안내를 쓴다.
// (예전에는 "available · SW active" 같은 내부 상태 값이 화면에 그대로 보였다.)
import { useSyncExternalStore } from "react";

import {
  getPwaInstallServerSnapshot,
  getPwaInstallSnapshot,
  requestPwaInstall,
  subscribePwaInstall,
  type PwaInstallPlatform,
  type PwaInstallResult,
  type PwaInstallSnapshot,
  type PwaInstallStatus,
  type PwaServiceWorkerStatus,
} from "@/shared/lib/pwa-install-store";

import type { LabelPair } from "./growth-ip-labels";
import { bi } from "./growth-ip-shared";

export const PWA_STATUS_LABEL: Record<PwaInstallStatus, LabelPair> = {
  idle: ["확인 중", "Checking"],
  available: ["설치할 수 있어요", "Ready to install"],
  prompting: ["설치 창을 띄우는 중", "Install prompt open"],
  accepted: ["설치를 수락했어요", "Install accepted"],
  dismissed: ["설치 창을 닫았어요", "Prompt dismissed"],
  manual: ["직접 홈 화면에 추가", "Add to Home Screen manually"],
  installed: ["설치됨", "Installed"],
  unavailable: ["자동 설치 창 없음", "No install prompt"],
};

export const PWA_PLATFORM_LABEL: Record<PwaInstallPlatform, LabelPair> = {
  ios: ["iPhone·iPad", "iPhone/iPad"],
  android: ["Android", "Android"],
  desktop: ["데스크톱", "Desktop"],
  unknown: ["기기 확인 중", "Unknown device"],
};

export const PWA_SERVICE_WORKER_LABEL: Record<PwaServiceWorkerStatus, LabelPair> = {
  unknown: ["확인 중", "Checking"],
  unsupported: ["지원 안 함", "Unsupported"],
  registering: ["준비 중", "Registering"],
  active: ["작동 중", "Active"],
  "update-waiting": ["새 버전 대기", "Update waiting"],
  reset: ["초기화됨", "Reset"],
  failed: ["준비 실패", "Failed"],
};

export function usePwaInstallSnapshot(): PwaInstallSnapshot {
  return useSyncExternalStore(subscribePwaInstall, getPwaInstallSnapshot, getPwaInstallServerSnapshot);
}

export function describePwaInstallResult(result: PwaInstallResult): string {
  switch (result) {
    case "accepted":
    case "installed":
      return bi("앱 설치 흐름을 완료했습니다.", "App installation flow completed.");
    case "manual":
      return bi("iPhone/iPad에서는 Safari 공유 메뉴 → ‘홈 화면에 추가’를 선택하세요.", "On iPhone/iPad, choose Share → Add to Home Screen in Safari.");
    case "dismissed":
      return bi("설치 요청을 닫았습니다. 필요할 때 다시 시도할 수 있습니다.", "Install request dismissed. You can retry later.");
    case "unavailable":
      return bi("이 브라우저는 자동 설치 창을 제공하지 않습니다. 브라우저 메뉴의 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 사용하세요.", "The automatic prompt is unavailable. Use Install app or Add to Home Screen from your browser menu.");
  }
}

/** 설치를 요청하고 결과를 안내 문장으로 돌려준다. */
export async function requestPwaInstallMessage(): Promise<string> {
  return describePwaInstallResult(await requestPwaInstall());
}
