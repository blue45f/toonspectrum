import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  // 값이 바뀌면(예: 경로 변경) 에러 상태를 초기화해 다음 화면이 정상 렌더되도록 한다.
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

// 라우트 렌더 중 예외를 잡아 레이아웃(헤더·푸터)을 유지한 채 폴백을 보여준다.
// 에러 바운더리는 클래스 컴포넌트로만 구현할 수 있다.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("화면 렌더 중 오류:", error, info.componentStack);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto w-full max-w-[1320px] px-4 py-16 sm:px-6">
          <div
            className="mx-auto max-w-md rounded-2xl border border-bad/40 bg-[oklch(0.66_0.2_25/0.12)] p-12 text-center"
            role="alert"
          >
            <AlertTriangle size={24} className="mx-auto mb-3 text-bad" />
            <p className="text-sm font-medium text-fg">이 화면을 표시하는 중 문제가 발생했어요.</p>
            {/* 틴트된 에러 표면 위 본문 대비 확보(fg-3 → fg-2) */}
            <p className="mt-1 text-sm text-fg-2">다시 시도하거나 홈으로 이동해 주세요.</p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
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
