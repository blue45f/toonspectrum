import { useId, useSyncExternalStore } from "react";

import type {
  GpuDiagnosticReason,
  StudioScene3dGpuDiagnostics,
} from "../scene3d/studio-scene3d-gpu-diagnostics";

const MESSAGES: Readonly<Record<GpuDiagnosticReason, string>> = {
  "not-mounted": "3D 뷰포트가 준비되면 측정할 수 있습니다.",
  unsupported: "이 렌더러에서는 GPU timestamp 측정을 지원하지 않습니다. 프레임 시간으로 대신 계산하지 않습니다.",
  "other-profiler": "다른 GPU 측정 작업이 사용 중입니다. 해당 작업이 종료된 뒤 뷰포트를 다시 열어 주세요.",
  paused: "캡처·변형·몰입 모드 또는 숨겨진 탭에서는 측정을 잠시 중지합니다.",
  "waiting-for-frame": "다음 화면 렌더 제출을 기다리고 있습니다.",
  "reading-gpu": "제출한 GPU 작업의 결과를 읽고 있습니다. 새 측정은 결과 정리 후 가능합니다.",
  "no-fresh-timestamps": "이번 제출의 유효한 GPU timestamp를 얻지 못했습니다. 이전 수치는 표시하지 않습니다.",
  "render-failed": "렌더 제출 중 오류가 발생해 측정하지 못했습니다.",
  "readback-failed": "GPU 측정 결과를 읽지 못했습니다.",
  "timed-out": "측정 대기 시간이 초과됐습니다. 제출된 조회는 종료될 때까지 중복 실행하지 않습니다.",
};

export function StudioBg3dGpuDiagnostics({ diagnostics }: {
  readonly diagnostics: StudioScene3dGpuDiagnostics;
}) {
  const state = useSyncExternalStore(diagnostics.subscribe, diagnostics.getSnapshot, diagnostics.getSnapshot);
  const descriptionId = useId();
  return (
    <div className="mt-3 border-t border-line pt-3" data-testid="studio-bg3d-gpu-diagnostics">
      <button type="button" onClick={diagnostics.request} disabled={!state.canRequest}
        aria-describedby={descriptionId}
        className="min-h-11 rounded-lg border border-line px-3 text-xs disabled:opacity-50">
        GPU 렌더 시간 측정
      </button>
      {state.busy ? (
        <button type="button" onClick={diagnostics.cancel}
          className="ml-2 min-h-11 rounded-lg border border-line px-3 text-xs">
          측정 취소
        </button>
      ) : null}
      <p id={descriptionId} className="mt-2 text-[0.7rem] leading-relaxed text-fg-3">
        화면 렌더 제출 1회의 GPU 패스 합계입니다. 전체 프레임 시간이나 안정 상태 평균이 아니며,
        첫 측정에는 준비 비용이 포함될 수 있습니다. CPU 제출 시간은 별도로 표시합니다.
      </p>
      <div role="status" aria-live="polite" className="mt-2 text-xs text-fg-2">
        {state.reason ? MESSAGES[state.reason] : state.sample ? (
          <dl className="grid grid-cols-2 gap-1 font-mono tabular-nums">
            <dt>GPU 패스 합계</dt><dd>{state.sample.gpuPassTotalMs.toFixed(3)} ms</dd>
            <dt>CPU 제출 시간</dt><dd>{state.sample.cpuSubmitMs.toFixed(3)} ms</dd>
            <dt>측정 패스</dt><dd>{state.sample.passCount}개</dd>
            <dt>캔버스 크기</dt><dd>{state.sample.width} × {state.sample.height}</dd>
          </dl>
        ) : "버튼을 눌렀을 때만 GPU 측정을 실행합니다."}
      </div>
    </div>
  );
}
