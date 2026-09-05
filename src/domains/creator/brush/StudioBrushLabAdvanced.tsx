import { StudioBrushStudio } from "./StudioBrushStudio";

import type { StudioBrushSnapshot, StudioSavedBrush } from "./studio-brush-library";

export function StudioBrushLabAdvanced({ snapshot, baseline, onChange }: {
  snapshot: StudioBrushSnapshot;
  baseline: StudioSavedBrush | null;
  onChange: (next: StudioBrushSnapshot, expected: StudioBrushSnapshot) => void;
}) {
  const patch = (next: Partial<StudioBrushSnapshot>) => onChange({ ...snapshot, ...next }, snapshot);
  return (
    <StudioBrushStudio
      brushId={snapshot.brushId}
      strokeWidth={snapshot.strokeWidth}
      color={snapshot.color}
      currentSnapshot={snapshot}
      savedBrushBaseline={baseline}
      settings={snapshot.brushDynamics}
      onSettingsChange={(brushDynamics) => patch({ brushDynamics })}
      onSelectDynamicsPreset={(id, brushDynamics) => patch({
        brushId: id, brushDynamics, enginePrograms: null, stampTuning: null,
        sourcePresetId: "", sourcePresetName: "",
      })}
      useVelocityPressure={snapshot.useVelocityPressure}
      onUseVelocityPressureChange={(useVelocityPressure) => patch({ useVelocityPressure })}
      velocitySensitivity={snapshot.velocitySensitivity}
      onVelocitySensitivityChange={(velocitySensitivity) => patch({ velocitySensitivity })}
      pressureCurve={snapshot.pressureCurve}
      onPressureCurveChange={(pressureCurve) => patch({ pressureCurve })}
      pressureMinSize={snapshot.pressureMinSize}
      onPressureMinSizeChange={(pressureMinSize) => patch({ pressureMinSize })}
      tiltEnabled={snapshot.tiltEnabled}
      onTiltEnabledChange={(tiltEnabled) => patch({ tiltEnabled })}
      tipAngle={snapshot.tipAngle}
      onTipAngleChange={(tipAngle) => patch({ tipAngle })}
      tipRoundness={snapshot.tipRoundness}
      onTipRoundnessChange={(tipRoundness) => patch({ tipRoundness })}
      onRestoreDefaults={(transaction, direction) => patch(
        direction === "undo" ? transaction.before : transaction.after,
      )}
      onEngineProgramsChange={(enginePrograms) => patch({ enginePrograms })}
    />
  );
}
