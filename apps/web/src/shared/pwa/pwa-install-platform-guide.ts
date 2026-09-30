import type { PwaInstallPlatform } from "@/shared/lib/pwa-install-store";

export interface PwaInstallGuideStep {
  /** 단계 제목 */
  readonly ko: string;
  readonly en: string;
  /** 단계 설명 */
  readonly koDescription: string;
  readonly enDescription: string;
}

export interface PwaInstallPlatformGuide {
  readonly platform: PwaInstallPlatform;
  readonly tabKo: string;
  readonly tabEn: string;
  readonly headlineKo: string;
  readonly headlineEn: string;
  readonly steps: readonly PwaInstallGuideStep[];
}

const IOS_GUIDE: PwaInstallPlatformGuide = {
  platform: "ios",
  tabKo: "iPhone·iPad",
  tabEn: "iPhone & iPad",
  headlineKo: "Safari에서 10초면 설치돼요",
  headlineEn: "Install in 10 seconds from Safari",
  steps: [
    {
      ko: "Safari로 툰스튜디오 열기",
      en: "Open ToonStudio in Safari",
      koDescription: "Safari 앱에서 이 페이지를 열어 주세요. 다른 브라우저에서는 홈 화면 추가가 안 될 수 있어요.",
      enDescription: "Open this page in the Safari app. Other browsers may not support Add to Home Screen.",
    },
    {
      ko: "공유 버튼 누르기",
      en: "Tap the Share button",
      koDescription: "화면 아래쪽(또는 위쪽)의 공유 아이콘을 눌러 주세요.",
      enDescription: "Tap the Share icon at the bottom (or top) of the screen.",
    },
    {
      ko: "'홈 화면에 추가' 선택",
      en: "Choose “Add to Home Screen”",
      koDescription: "공유 시트에서 '홈 화면에 추가'를 찾아 눌러 주세요.",
      enDescription: "Find and tap “Add to Home Screen” in the share sheet.",
    },
    {
      ko: "추가 확인",
      en: "Confirm Add",
      koDescription: "오른쪽 위 '추가'를 누르면 홈 화면에 툰스튜디오 아이콘이 생깁니다.",
      enDescription: "Tap “Add” at the top right — the ToonStudio icon appears on your Home Screen.",
    },
  ],
};

const ANDROID_GUIDE: PwaInstallPlatformGuide = {
  platform: "android",
  tabKo: "Android",
  tabEn: "Android",
  headlineKo: "Chrome에서 바로 설치해요",
  headlineEn: "Install right from Chrome",
  steps: [
    {
      ko: "Chrome으로 툰스튜디오 열기",
      en: "Open ToonStudio in Chrome",
      koDescription: "Chrome 앱에서 이 페이지를 열어 주세요.",
      enDescription: "Open this page in the Chrome app.",
    },
    {
      ko: "메뉴 열기",
      en: "Open the menu",
      koDescription: "오른쪽 위 점 3개 메뉴를 눌러 주세요.",
      enDescription: "Tap the three-dot menu at the top right.",
    },
    {
      ko: "'앱 설치' 또는 '홈 화면에 추가'",
      en: "“Install app” or “Add to Home screen”",
      koDescription: "메뉴에서 '앱 설치'를 눌러 주세요. 기기에 따라 문구가 다를 수 있어요.",
      enDescription: "Tap “Install app” in the menu. The wording may vary by device.",
    },
    {
      ko: "설치 확인",
      en: "Confirm install",
      koDescription: "'설치'를 누르면 앱 목록에 툰스튜디오가 추가됩니다.",
      enDescription: "Tap “Install” — ToonStudio is added to your app list.",
    },
  ],
};

const DESKTOP_GUIDE: PwaInstallPlatformGuide = {
  platform: "desktop",
  tabKo: "PC·Mac",
  tabEn: "Desktop",
  headlineKo: "브라우저에서 앱처럼 실행해요",
  headlineEn: "Run it like an app from your browser",
  steps: [
    {
      ko: "Chrome·Edge로 열기",
      en: "Open in Chrome or Edge",
      koDescription: "Chromium 기반 브라우저에서 이 페이지를 열어 주세요.",
      enDescription: "Open this page in a Chromium-based browser.",
    },
    {
      ko: "주소창의 설치 아이콘 클릭",
      en: "Click the install icon in the address bar",
      koDescription: "주소창 오른쪽에 뜨는 설치(모니터+화살표) 아이콘을 눌러 주세요.",
      enDescription: "Click the install icon that appears on the right side of the address bar.",
    },
    {
      ko: "설치 확인",
      en: "Confirm install",
      koDescription: "'설치'를 누르면 독립 창으로 실행되는 툰스튜디오 앱이 생깁니다.",
      enDescription: "Click “Install” — ToonStudio opens in its own app window.",
    },
  ],
};

const UNKNOWN_GUIDE: PwaInstallPlatformGuide = {
  platform: "unknown",
  tabKo: "기타",
  tabEn: "Other",
  headlineKo: "홈 화면에 추가해 보세요",
  headlineEn: "Try adding it to your home screen",
  steps: [
    {
      ko: "브라우저 메뉴 열기",
      en: "Open the browser menu",
      koDescription: "사용 중인 브라우저의 메뉴를 열어 주세요.",
      enDescription: "Open the menu of the browser you are using.",
    },
    {
      ko: "'홈 화면에 추가' 또는 '앱 설치' 찾기",
      en: "Find “Add to Home Screen” or “Install app”",
      koDescription: "메뉴에서 설치 관련 항목을 찾아 눌러 주세요.",
      enDescription: "Find and tap the install option in the menu.",
    },
  ],
};

const GUIDES: Record<PwaInstallPlatform, PwaInstallPlatformGuide> = {
  ios: IOS_GUIDE,
  android: ANDROID_GUIDE,
  desktop: DESKTOP_GUIDE,
  unknown: UNKNOWN_GUIDE,
};

/** 플랫폼에 맞는 설치 단계 가이드를 반환한다. */
export function getPwaInstallPlatformGuide(platform: PwaInstallPlatform): PwaInstallPlatformGuide {
  return GUIDES[platform] ?? UNKNOWN_GUIDE;
}

/** 탭 순서에 표시할 전체 가이드 목록. */
export function listPwaInstallPlatformGuides(): readonly PwaInstallPlatformGuide[] {
  return [IOS_GUIDE, ANDROID_GUIDE, DESKTOP_GUIDE];
}
