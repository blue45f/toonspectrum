// 현재 브라우저가 실제로 제공하는 기능 진단 — 성장·IP 작업대와 사용 환경 안내 페이지가 같은 판정을 쓴다.
// (예전에는 두 페이지가 비슷한 감지 코드를 각자 가지고 있어 결과·문구가 어긋날 수 있었다.)
// 감지는 한 번만(WebGL 컨텍스트 생성 비용), 문구는 화면을 그릴 때마다 현재 언어로 만든다.
import { bi } from "./growth-ip-shared";

export const ENVIRONMENT_CAPABILITY_IDS = [
  "secure",
  "service-worker",
  "indexed-db",
  "pointer",
  "media",
  "share",
  "webgl2",
  "speech",
] as const;

export type EnvironmentCapabilityId = (typeof ENVIRONMENT_CAPABILITY_IDS)[number];
export type EnvironmentSupport = Readonly<Record<EnvironmentCapabilityId, boolean>>;

export interface EnvironmentCapability {
  readonly id: EnvironmentCapabilityId;
  readonly title: string;
  readonly supported: boolean;
  /** 이 기능이 어디에 쓰이는지. */
  readonly purpose: string;
  /** 지원하지 않을 때 해 볼 일. */
  readonly fix: string;
}

const NO_SUPPORT: EnvironmentSupport = {
  secure: false,
  "service-worker": false,
  "indexed-db": false,
  pointer: false,
  media: false,
  share: false,
  webgl2: false,
  speech: false,
};

function supportsWebGl2(): boolean {
  // WebGL2 자체가 없는 환경(구형 브라우저·테스트 DOM)에서는 캔버스를 만들지 않는다.
  if (typeof WebGL2RenderingContext === "undefined") return false;
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

/** 브라우저 기능 지원 여부만 감지한다(권한 요청 없음). */
export function detectEnvironmentSupport(): EnvironmentSupport {
  if (typeof window === "undefined" || typeof navigator === "undefined") return NO_SUPPORT;
  return {
    secure: window.isSecureContext,
    "service-worker": "serviceWorker" in navigator,
    "indexed-db": "indexedDB" in window,
    pointer: "PointerEvent" in window,
    media: Boolean(navigator.mediaDevices?.getUserMedia),
    share: typeof navigator.share === "function",
    webgl2: supportsWebGl2(),
    speech: "speechSynthesis" in window,
  };
}

function capabilityCopy(id: EnvironmentCapabilityId): Omit<EnvironmentCapability, "id" | "supported"> {
  switch (id) {
    case "secure":
      return {
        title: bi("보안 연결(HTTPS)", "Secure context (HTTPS)"),
        purpose: bi("웹캠·마이크·클립보드·앱 설치 같은 민감 기능의 기본 조건", "Baseline for camera, microphone, clipboard and app install"),
        fix: bi("https:// 주소 또는 localhost에서 다시 여세요.", "Open the app over HTTPS or localhost."),
      };
    case "service-worker":
      return {
        title: bi("오프라인 캐시(Service Worker)", "Offline cache (Service Worker)"),
        purpose: bi("오프라인 캐시, 업데이트 감지, 설치형 웹앱 기반", "Foundation for offline caching, update detection and installable web apps"),
        fix: bi("최신 Safari·Chrome·Edge 계열 브라우저를 권장합니다.", "Use a current Safari, Chrome or Edge-class browser."),
      };
    case "indexed-db":
      return {
        title: bi("로컬 저장소(IndexedDB)", "Local storage (IndexedDB)"),
        purpose: bi("큰 프로젝트·복구 데이터·로컬 작업 기록 저장", "Stores large projects, recovery data and local work history"),
        fix: bi("시크릿/제한 모드나 저장공간 차단 설정을 확인하세요.", "Check private/restricted browsing and storage-blocking settings."),
      };
    case "pointer":
      return {
        title: bi("펜·터치 입력(Pointer Events)", "Pen & touch input (Pointer Events)"),
        purpose: bi("펜·터치·마우스 입력 통합과 드로잉 압력 처리 기반", "Unified pen, touch and mouse input for drawing"),
        fix: bi("브라우저와 OS를 최신 버전으로 업데이트하세요.", "Update the browser and operating system."),
      };
    case "media":
      return {
        title: bi("카메라·마이크", "Camera & microphone"),
        purpose: bi("화상 협업·음성 입력·카메라 기능", "Video collaboration, voice input and camera workflows"),
        fix: bi("브라우저 사이트 권한에서 카메라·마이크를 허용하세요.", "Allow camera and microphone in site permissions."),
      };
    case "share":
      return {
        title: bi("기기 공유 시트(Web Share)", "Device share sheet (Web Share)"),
        purpose: bi("모바일 OS 공유 시트로 SNS·메신저 앱 연결", "Connects to the mobile OS share sheet"),
        fix: bi("지원하지 않는 데스크톱 브라우저에서는 통합 공유/링크 복사를 사용하세요.", "Use the built-in share dialog or copy-link fallback on unsupported desktop browsers."),
      };
    case "webgl2":
      return {
        title: bi("3D 그래픽(WebGL 2)", "3D graphics (WebGL 2)"),
        purpose: bi("3D 배경·고급 렌더링·일부 GPU 가속 기능", "3D backgrounds, advanced rendering and selected GPU acceleration"),
        fix: bi("브라우저 하드웨어 가속을 켜고 그래픽 드라이버/OS를 업데이트하세요.", "Enable browser hardware acceleration and update graphics drivers/OS."),
      };
    case "speech":
      return {
        title: bi("음성 합성(Speech)", "Speech synthesis"),
        purpose: bi("페이지 음성 안내와 웹툰 대사 읽어주기 검수", "Page voice guidance and dialogue read-aloud proofing"),
        fix: bi("OS 음성 엔진이 있는 최신 브라우저를 사용하거나 음성 파일 첨부를 이용하세요.", "Use a current browser with an OS speech engine, or attach voice audio instead."),
      };
  }
}

/** 감지 결과를 현재 언어의 제목·용도·해결 방법과 묶는다. */
export function describeEnvironmentCapabilities(support: EnvironmentSupport): EnvironmentCapability[] {
  return ENVIRONMENT_CAPABILITY_IDS.map((id) => ({ id, supported: support[id], ...capabilityCopy(id) }));
}

export function detectEnvironmentCapabilities(): EnvironmentCapability[] {
  return describeEnvironmentCapabilities(detectEnvironmentSupport());
}
