export type ErrorClassificationType = "compatibility" | "network" | "chunk_load" | "general";

export interface ErrorAnalysis {
  type: ErrorClassificationType;
  title: string;
  message: string;
  details?: string;
  isCompatibilityIssue: boolean;
  missingFeatures?: string[];
}

const BROWSER_API_KEYWORDS = [
  "webgpu",
  "webgl",
  "offscreencanvas",
  "sharedarraybuffer",
  "wasm",
  "webassembly",
  "gpuadapter",
  "gpudevice",
  "not supported",
  "unsupported",
  "illegal invocation",
  "object doesn't support property or method",
] as const;

/**
 * Keep the synchronous render-error boundary small. Detailed browser and in-app diagnostics are
 * loaded only after a genuine compatibility signal or by the optional compatibility bridge.
 */
export function classifyRuntimeError(error: unknown): ErrorAnalysis {
  const errObj = error instanceof Error ? error : new Error(String(error));
  const errName = errObj.name || "";
  const errMessage = errObj.message || String(error) || "";
  const stack = errObj.stack || "";

  const lowerMsg = errMessage.toLowerCase();
  const lowerName = errName.toLowerCase();
  const lowerStack = stack.toLowerCase();

  if (
    lowerMsg.includes("failed to fetch dynamically imported module") ||
    lowerMsg.includes("loading chunk") ||
    lowerMsg.includes("error loading dynamically imported module") ||
    lowerName.includes("chunkloaderror")
  ) {
    return {
      type: "chunk_load",
      title: "앱 업데이트 및 모듈 로딩 오류",
      message: "새로운 버전이 배포되었거나 네트워크 연결이 불안정하여 모듈을 불러오지 못했습니다.",
      details: errMessage,
      isCompatibilityIssue: false,
    };
  }

  if (
    lowerMsg.includes("networkerror") ||
    lowerMsg.includes("failed to fetch") ||
    (lowerMsg.includes("fetch") && lowerMsg.includes("failed")) ||
    lowerName.includes("networkerror")
  ) {
    return {
      type: "network",
      title: "네트워크 연결 오류",
      message: "인터넷 연결 상태가 불안정하거나 서버와 통신할 수 없습니다.",
      details: errMessage,
      isCompatibilityIssue: false,
    };
  }

  const hasBrowserApiKeyword = BROWSER_API_KEYWORDS.some(
    (keyword) => lowerMsg.includes(keyword) || lowerName.includes(keyword) || lowerStack.includes(keyword),
  );
  if (
    hasBrowserApiKeyword &&
    (errName === "TypeError" || errName === "ReferenceError" || errName === "NotSupportedError")
  ) {
    return {
      type: "compatibility",
      title: "브라우저 호환성 경고",
      message: "현재 브라우저에서 필요한 그래픽 또는 웹 기능을 사용할 수 없습니다.",
      details: errMessage,
      isCompatibilityIssue: true,
      missingFeatures: [],
    };
  }

  return {
    type: "general",
    title: "시스템 실행 오류",
    message: "화면을 표시하는 중 예상치 못한 문제가 발생했습니다.",
    details: errMessage,
    isCompatibilityIssue: false,
  };
}
