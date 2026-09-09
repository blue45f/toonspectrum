import {
  applyStudioStrokeProposalTransaction,
  cancelConnectedStudioStrokeProposal,
  requestStudioStrokeProposal,
  useStudioStrokeProposalBridgeSnapshot,
} from "./studio-stroke-proposal-bridge";
import { StudioStrokeProposalReviewPanel } from "./StudioStrokeProposalReviewPanel";

export function StudioConnectedStrokeProposalPanel() {
  const bridge = useStudioStrokeProposalBridgeSnapshot();
  if (!bridge.connected) {
    return (
      <section
        aria-label="AI 획 제안 검토"
        className="rounded-xl border border-line bg-card p-3 text-xs text-fg-3"
        data-studio-stroke-proposal-panel="disconnected"
      >
        현재 캔버스가 준비되면 최근 확정 획을 읽는 로컬 공동 창작 도구가 연결됩니다.
      </section>
    );
  }
  return (
    <StudioStrokeProposalReviewPanel
      proposal={bridge.proposal}
      transform={{
        viewportWidthCss: 960,
        viewportHeightCss: 720,
        zoom: 1,
        dpr: globalThis.devicePixelRatio || 1,
        rotationDeg: 0,
        panXCss: 0,
        panYCss: 0,
      }}
      documentId={bridge.documentId}
      documentGeneration={bridge.documentGeneration}
      activePointerStroke={bridge.activePointerStroke}
      busy={bridge.busy}
      error={bridge.error}
      onRequestProposal={() => void requestStudioStrokeProposal()}
      onApplyTransaction={applyStudioStrokeProposalTransaction}
      onCancel={cancelConnectedStudioStrokeProposal}
    />
  );
}
