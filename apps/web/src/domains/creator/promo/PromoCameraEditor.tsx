import { PROMO_CAMERA_EASINGS } from "./promo-model";

import type { PromoCamera, PromoCameraPose, PromoPanel, PromoScene } from "./promo-model";

export function PromoCameraEditor({ scene, onChange, onSeek }: {
  scene: PromoScene; onChange: (patch: Partial<PromoPanel>) => void; onSeek?: (frame: number) => void;
}) {
  const { panel } = scene;
  const camera = panel.camera;
  const enable = () => onChange({ camera: { from: { x: panel.focusX ?? 0.5, y: panel.focusY ?? 0.5, zoom: 1 },
    to: { x: panel.focusX ?? 0.5, y: panel.focusY ?? 0.5, zoom: 1.2 }, easing: "smooth" } });
  const changePose = (endpoint: "from" | "to", axis: keyof PromoCameraPose, value: number) => {
    if (camera) onChange({ camera: { ...camera, [endpoint]: { ...camera[endpoint], [axis]: value } } });
  };
  return <div className="promo-camera-editor">
    <label htmlFor={`camera-mode-${panel.id}`}>카메라 제어 방식<select id={`camera-mode-${panel.id}`} value={camera ? "custom" : "preset"} onChange={(event) => { if (event.target.value === "custom") enable(); else onChange({ camera: undefined }); }}><option value="preset">카메라 모션 프리셋</option><option value="custom">시작·끝 키프레임 직접 지정</option></select></label>
    {camera ? <>
      <p className="promo-muted">직접 지정한 구도가 모션 프리셋보다 우선합니다. 초점 0%는 왼쪽·위, 100%는 오른쪽·아래입니다. 움직임 줄이기에서는 시작 구도를 고정합니다.</p>
      <div className="promo-camera-poses">{(["from", "to"] as const).map((endpoint) => <fieldset key={endpoint}>
        <legend>{endpoint === "from" ? "시작 구도" : "끝 구도"}</legend>
        {(["x", "y", "zoom"] as const).map((axis) => <label key={axis} htmlFor={`camera-${endpoint}-${axis}-${panel.id}`}>
          {axis === "x" ? "가로 초점" : axis === "y" ? "세로 초점" : "확대"} {Math.round(camera[endpoint][axis] * 100)}%
          <input id={`camera-${endpoint}-${axis}-${panel.id}`} type="range" min={axis === "zoom" ? 1 : 0} max={axis === "zoom" ? 3 : 1} step={0.01} value={camera[endpoint][axis]} onChange={(event) => changePose(endpoint, axis, Number(event.target.value))} />
        </label>)}
        {onSeek ? <button type="button" onClick={() => onSeek(scene.from + (endpoint === "from" ? 0 : scene.duration - 1))}>{endpoint === "from" ? "시작 구도 확인" : "끝 구도 확인"}</button> : null}
      </fieldset>)}</div>      <label htmlFor={`camera-easing-${panel.id}`}>카메라 속도 변화<select id={`camera-easing-${panel.id}`} value={camera.easing} onChange={(event) => onChange({ camera: { ...camera, easing: event.target.value as PromoCamera["easing"] } })}>{Object.entries(PROMO_CAMERA_EASINGS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button type="button" onClick={() => onChange({ camera: { ...camera, from: { ...camera.to }, to: { ...camera.from } } })}>시작·끝 구도 맞바꾸기</button>
    </> : null}
  </div>;
}
