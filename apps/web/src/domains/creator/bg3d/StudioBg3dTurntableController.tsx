import { Play, Pause, RotateCw, RotateCcw, Compass } from "lucide-react";
import { useState } from "react";

export interface StudioBg3dTurntableControllerProps {
  readonly isRotating?: boolean;
  readonly speedRpm?: number;
  readonly onToggleRotation?: (rotating: boolean) => void;
  readonly onSpeedChange?: (speedRpm: number) => void;
  readonly disabled?: boolean;
}

export function StudioBg3dTurntableController({
  isRotating,
  speedRpm: controlledSpeedRpm,
  onToggleRotation,
  onSpeedChange,
  disabled = false,
}: StudioBg3dTurntableControllerProps) {
  const [localRotating, setLocalRotating] = useState(false);
  const rotating = isRotating ?? localRotating;
  const [localSpeedRpm, setLocalSpeedRpm] = useState(2);
  const signedSpeedRpm = controlledSpeedRpm ?? localSpeedRpm;
  const speedRpm = Math.abs(signedSpeedRpm);
  const direction = signedSpeedRpm < 0 ? "ccw" : "cw";

  const handleToggle = () => {
    const next = !rotating;
    if (isRotating === undefined) setLocalRotating(next);
    onToggleRotation?.(next);
  };

  const updateSpeed = (nextSpeed: number) => {
    if (controlledSpeedRpm === undefined) setLocalSpeedRpm(nextSpeed);
    onSpeedChange?.(nextSpeed);
  };

  const handleSpeed = (newSpeed: number) => updateSpeed(direction === "cw" ? newSpeed : -newSpeed);
  const handleToggleDirection = () => updateSpeed(-signedSpeedRpm);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-card/90 px-2.5 py-1.5 text-xs text-fg shadow-sm backdrop-blur">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={rotating}
        onClick={handleToggle}
        className={`flex min-h-11 items-center gap-1 rounded-md px-2 py-1 text-[0.68rem] font-bold transition-all ${
          rotating
            ? "bg-accent text-accent-fg shadow-sm"
            : "bg-raised text-fg hover:bg-line/40"
        }`}
      >
        {rotating ? (
          <>
            <Pause className="size-3" />
            <span>턴테이블 정지</span>
          </>
        ) : (
          <>
            <Play className="size-3" />
            <span>턴테이블 회전</span>
          </>
        )}
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={handleToggleDirection}
        title="회전 방향 전환"
        aria-label="회전 방향 전환"
        aria-pressed={direction === "ccw"}
        className="grid size-11 shrink-0 place-items-center rounded border border-line bg-raised p-1 text-fg-2 hover:bg-line/40 hover:text-fg"
      >
        {direction === "cw" ? <RotateCw className="size-3.5" /> : <RotateCcw className="size-3.5" />}
      </button>

      <div className="flex items-center gap-1.5 pl-1">
        <Compass className="size-3 text-fg-3" />
        <input
          type="range"
          aria-label="턴테이블 회전 속도"
          aria-valuetext={`${speedRpm.toFixed(1)} RPM`}
          disabled={disabled}
          min="0.5"
          max="8.0"
          step="0.5"
          value={speedRpm}
          onChange={(e) => handleSpeed(Number(e.target.value))}
          className="h-11 w-16 cursor-pointer accent-accent"
        />
        <span className="w-8 text-right font-mono text-[0.62rem] text-fg-3">{speedRpm.toFixed(1)} RPM</span>
      </div>
    </div>
  );
}
