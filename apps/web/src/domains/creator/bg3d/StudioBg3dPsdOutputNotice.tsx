import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function StudioBg3dPsdOutputNotice({
  includeLayeredPsd,
  disabled,
  onSelectPng,
}: {
  readonly includeLayeredPsd: boolean;
  readonly disabled: boolean;
  readonly onSelectPng: () => void;
}) {
  const copy = useBilingual("scene3d-psd-output-notice");
  return (
    <div className="mt-2 rounded-lg border border-line bg-panel p-2 text-xs leading-relaxed text-fg-3">
      <p>
        {copy("레이어 PSD는 캔버스 2,097,152px·최대 4레이어·합계 8,388,608px까지 지원합니다. 큰 타일 PSD는 지원하지 않습니다. PSD를 선택하면 모든 컷의 PSD가 준비되어야 다운로드하며, 실패를 PNG 완료로 표시하지 않습니다.", "Layered PSD supports a 2,097,152-pixel canvas, up to 4 layers and 8,388,608 aggregate layer pixels. Large tiled PSD is unsupported. With PSD selected, every shot must have its PSD ready before download; a failure is not reported as PNG completion.")}
      </p>
      <p className="mt-1">
        {copy("Photoshop과 CLIP STUDIO PAINT에서 레이어 구조 그대로 열립니다. 음영 레이어는 곱하기(Multiply)로 기록되어 밑색을 다시 칠해도 그림자가 유지됩니다.", "Opens with its layer structure intact in Photoshop and CLIP STUDIO PAINT. The shading layer is recorded as Multiply, so shadows survive flat-colour repaints.")}
      </p>
      {includeLayeredPsd ? (
        <button type="button" disabled={disabled} onClick={onSelectPng} className="mt-2 min-h-11 min-w-11 rounded-lg border border-line bg-card px-3 text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-45">
          {copy("분리 PNG 패스로 전환", "Switch to separate PNG passes")}
        </button>
      ) : (
        <p className="mt-1" role="status">{copy("선택한 출력: 분리 PNG 패스. 출력 크기와 선택한 패스를 유지합니다.", "Selected output: separate PNG passes, preserving the chosen size and passes.")}</p>
      )}
    </div>
  );
}
