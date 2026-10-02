import { useLab, useLabSelector } from "../shell/lab-context";
import {
  capabilityBadge,
  findDescriptor,
  isLaneId,
  KIND_LABELS,
  laneAvailability,
  STATUS_LABELS,
} from "../state/lane-helpers";

export interface LaneSelectorProps {
  slot: "a" | "b";
}

/** LANE_REGISTRY 기반 레인 선택. reserved·unavailable 레인은 사유와 함께 비활성 옵션으로 남긴다. */
export function LaneSelector({ slot }: LaneSelectorProps) {
  const { registry, actions } = useLab();
  const laneId = useLabSelector((s) => (slot === "a" ? s.laneA : s.laneB));
  const capability = useLabSelector((s) => s.capability);
  const running = useLabSelector((s) => s.running);
  const desc = findDescriptor(registry, laneId);
  const cap = capability[laneId];
  const id = `lab-lane-${slot}`;
  const badgeClass =
    cap === null ? "lab-badge" : cap.status === "supported" ? "lab-badge lab-badge--pass" : "lab-badge lab-badge--fail";
  return (
    <div className="lab-field">
      <label htmlFor={id}>
        <span>레인 {slot.toUpperCase()}</span>
      </label>
      <select
        id={id}
        value={laneId}
        disabled={running}
        onChange={(e) => {
          const next = e.target.value;
          if (isLaneId(next)) actions.setLane(slot, next);
        }}
      >
        {registry.map((d) => {
          const { enabled, reason } = laneAvailability(d, capability[d.id]);
          return (
            <option key={d.id} value={d.id} disabled={!enabled}>
              {d.label} ({d.id}){reason ? ` — ${reason}` : ""}
            </option>
          );
        })}
      </select>
      <p className="lab-muted" data-testid={`lab-lane-badge-${slot}`}>
        <span className={badgeClass}>{capabilityBadge(cap)}</span>{" "}
        {desc ? `${KIND_LABELS[desc.kind]} · ${STATUS_LABELS[desc.status]} · 엔진 ${desc.id}` : "레지스트리에 없는 레인"}
      </p>
    </div>
  );
}
