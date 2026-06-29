import { AlertTriangle, Download, Monitor, RefreshCw, WifiOff } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

import { classifyError, type ErrorAnalysis } from "../compat/browser-check";

import { BrowserCompatModal } from "./browser-compat-modal";

interface Props {
  children: ReactNode;
  // 값이 바뀌면(예: 경로 변경) 에러 상태를 초기화해 다음 화면이 정상 렌더되도록 한다.
  resetKey?: unknown;
}

interface State {
  error: Error | null;
  analysis: ErrorAnalysis | null;
  showModal: boolean;
}

// 라우트 렌더 중 예외를 잡아 레이아웃(헤더·푸터)을 유지한 채 폴백을 보여준다.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, analysis: null, showModal: false };

  static getDerivedStateFromError(error: Error): State {
    const analysis = classifyError(error);
    return {
      error,
      analysis,
      showModal: analysis.type === "compatibility",
    };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, analysis: null, showModal: false });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("화면 렌더 중 오류:", error, info.componentStack);
    }
  }

  render() {
    const { error, analysis, showModal } = this.state;

    if (error && analysis) {
      // A. 브라우저 호환성 문제인 경우
      if (analysis.type === "compatibility") {
        return (
          <>
            <div className="mx-auto w-full max-w-[1320px] px-4 py-16 sm:px-6">
              <div
                className="mx-auto max-w-xl rounded-3xl border border-amber-500/30 bg-amber-500/10 p-8 sm:p-10 text-center shadow-2xl backdrop-blur-md"
                role="alert"
              >
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Monitor size={28} />
                </div>
                <h3 className="text-xl font-bold text-fg sm:text-2xl">{analysis.title}</h3>
                <p className="mt-2 text-sm text-fg-2 leading-relaxed">{analysis.message}</p>

                {analysis.details && (
                  <p className="mt-3 rounded-xl bg-black/30 p-3 text-xs text-amber-300/90 font-mono break-all">
                    {analysis.details}
                  </p>
                )}

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => this.setState({ showModal: true })}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-xs font-semibold text-black hover:bg-amber-400 transition-colors shadow-lg"
                  >
                    <Download size={16} />
                    브라우저 업데이트 안내 보기
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 text-xs font-medium text-fg hover:bg-white/10 transition-colors"
                  >
                    <RefreshCw size={14} />
                    새로고침
                  </button>
                </div>
              </div>
            </div>

            <BrowserCompatModal
              isOpen={showModal}
              onClose={() => this.setState({ showModal: false })}
              reason={analysis.details}
              missingFeatures={analysis.missingFeatures}
            />
          </>
        );
      }

      // B. 네트워크 오류인 경우
      if (analysis.type === "network") {
        return (
          <div className="mx-auto w-full max-w-[1320px] px-4 py-16 sm:px-6">
            <div
              className="mx-auto max-w-md rounded-2xl border border-blue-500/30 bg-blue-500/10 p-10 text-center"
              role="alert"
            >
              <WifiOff size={28} className="mx-auto mb-3 text-blue-400" />
              <h3 className="text-lg font-bold text-fg">{analysis.title}</h3>
              <p className="mt-2 text-sm text-fg-2">{analysis.message}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 text-xs font-semibold text-white hover:bg-blue-600 transition-colors"
              >
                <RefreshCw size={14} />
                연결 재시도
              </button>
            </div>
          </div>
        );
      }

      // C. 일반 오류 또는 청크 오류
      return (
        <div className="mx-auto w-full max-w-[1320px] px-4 py-16 sm:px-6">
          <div
            className="mx-auto max-w-md rounded-2xl border border-bad/40 bg-[oklch(0.66_0.2_25/0.12)] p-12 text-center"
            role="alert"
          >
            <AlertTriangle size={24} className="mx-auto mb-3 text-bad" />
            <p className="text-sm font-medium text-fg">{analysis.message}</p>
            <p className="mt-1 text-sm text-fg-2">다시 시도하거나 홈으로 이동해 주세요.</p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => this.setState({ error: null, analysis: null })}
                className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[0.7rem] border border-line-strong/90 px-3 text-[0.8125rem] font-medium text-fg transition-[background,color,border-color,transform,box-shadow,filter] duration-150 ease-out-expo hover:border-accent/70 hover:bg-accent-soft/80 hover:text-accent active:scale-[0.985] active:bg-accent active:text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                <RefreshCw size={14} />
                다시 시도
              </button>
              <a
                href="/"
                className="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-[0.7rem] bg-accent px-3 text-[0.8125rem] font-medium text-on-accent shadow-[0_1px_0_0_oklch(1_0_0/0.12)_inset] transition-[background,color,border-color,transform,box-shadow,filter] duration-150 ease-out-expo hover:bg-accent-2 hover:shadow-[0_1px_0_0_oklch(1_0_0/0.12)_inset,0_8px_24px_-8px_oklch(0.72_0.185_42/0.55)] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                홈으로
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
