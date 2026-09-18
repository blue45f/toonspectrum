import { Component, type ReactNode } from "react";

/** An optional readiness panel must never unmount the drawing document on failure. */
export class StudioOfflinePanelBoundary extends Component<
  { readonly children: ReactNode },
  { readonly failed: boolean; readonly dismissed: boolean }
> {
  state = { failed: false, dismissed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    if (this.state.dismissed) return null;
    return (
      <aside className="fixed bottom-[calc(var(--studio-canvas-bottom-inset,7rem)+7.5rem)] right-3 z-40 hidden max-w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-line bg-panel p-3 text-xs text-fg lg:block"
        aria-label="오프라인 안내 로딩 실패">
        <p role="status">오프라인 준비 안내를 열지 못했습니다. 편집기는 유지됩니다. 원고 저장 상태는 저장센터에서 확인해 주세요.</p>
        <button type="button" className="mt-2 min-h-11 rounded-lg border border-line px-3"
          onClick={() => { this.setState({ dismissed: true }); }}>안내 닫기</button>
      </aside>
    );
  }
}
