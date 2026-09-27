import { STUDIO_BG3D_SHOT_PSD_MAX_CANVAS_PIXELS } from "./studio-bg3d-shot-psd-contract";

export interface StudioBg3dShotRequestedOutput {
  readonly includeLayeredPsd: boolean;
  readonly shots: readonly { readonly shotId: string; readonly shotName: string }[];
  readonly layeredPsds: readonly { readonly shotId: string; readonly psd: Blob }[];
  readonly psdFallbacks: readonly { readonly shotId: string }[];
}

export function assertStudioBg3dShotPsdCaptureSupported(input: {
  readonly includeLayeredPsd: boolean;
  readonly shots: readonly {
    readonly shotName: string;
    readonly capture: { readonly width: number; readonly height: number };
  }[];
  readonly needsTiles: (width: number, height: number) => boolean;
}): void {
  if (!input.includeLayeredPsd) return;
  const unsupported = input.shots.find(({ capture }) =>
    capture.width * capture.height > STUDIO_BG3D_SHOT_PSD_MAX_CANVAS_PIXELS ||
    input.needsTiles(capture.width, capture.height));
  if (unsupported) {
    throw new Error(`${unsupported.shotName}: 이 크기의 타일 레이어 PSD는 지원하지 않습니다. 출력 크기를 유지하려면 ‘분리 PNG 패스로 전환’을 선택한 뒤 다시 실행하세요. PSD가 필요하면 지원 범위의 출력 크기를 직접 선택하세요.`);
  }
}

/** 요청한 PSD가 빠진 결과는 PNG 성공으로 대체하지 않는다. 복구 데이터에도 같은 검사를 적용한다. */
export function assertStudioBg3dShotRequestedOutput(input: StudioBg3dShotRequestedOutput): void {
  if (!input.includeLayeredPsd) return;
  for (const shot of input.shots) {
    const artifacts = input.layeredPsds.filter(({ shotId }) => shotId === shot.shotId);
    if (artifacts.length !== 1 || !artifacts[0]?.psd.size ||
      input.psdFallbacks.some(({ shotId }) => shotId === shot.shotId)) {
      throw new Error(`${shot.shotName}: 요청한 레이어 PSD를 생성하지 못해 다운로드를 중단했습니다. PSD를 다시 시도하거나 ‘분리 PNG 패스로 전환’을 직접 선택하세요.`);
    }
  }
}
