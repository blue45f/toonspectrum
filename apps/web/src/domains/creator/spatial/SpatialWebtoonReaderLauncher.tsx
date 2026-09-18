import { Glasses } from "lucide-react";
import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import type { SpatialReaderDirection } from "./spatial-reader-model";

const Reader = lazy(() => import("./SpatialWebtoonReader"));
export interface SpatialWebtoonReaderLauncherProps {
  pages?: readonly string[]; workId?: string; title?: string; direction?: SpatialReaderDirection;
}
class ReaderLoadBoundary extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div role="alert" className="mt-3 text-sm text-fg-2">
      공간 리더를 불러오지 못했습니다. 기존 작품 보기는 계속 사용할 수 있습니다. 다시 시도하려면 페이지를 새로 열어 주세요.
      <button type="button" onClick={this.props.onClose} className="ml-2 min-h-11 rounded border border-line px-3">안내 닫기</button>
    </div> : this.props.children;
  }
}
/** Read-only lazy entry. Callers must enforce their existing content access gate. */
export function SpatialWebtoonReaderLauncher(props: SpatialWebtoonReaderLauncherProps) {
  const [open, setOpen] = useState(false);
  return <div className="my-3 rounded-xl border border-line bg-card p-3" data-testid="spatial-webtoon-reader-launcher">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-2"><Glasses size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div><p className="text-sm font-bold text-fg">AR/VR 공간 웹툰 읽기</p><p className="mt-1 text-xs leading-relaxed text-fg-3">집중·곡면·벽면 배치, 긴 원고 구간 읽기. 헤드셋이 없어도 2D로 이용할 수 있습니다.</p></div>
      </div>
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 rounded-lg border border-line bg-panel px-4 py-2 text-xs font-bold text-fg hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">공간 리더 열기</button>
    </div>
    {open && <ReaderLoadBoundary onClose={() => setOpen(false)}><Suspense fallback={<p className="mt-3 text-xs text-fg-3" role="status">공간 리더를 여는 중입니다…</p>}>
      <Reader key={props.workId ?? "local"} {...props} onClose={() => setOpen(false)} />
    </Suspense></ReaderLoadBoundary>}
  </div>;
}
