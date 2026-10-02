import { useLab, useLabSelector } from "../shell/lab-context";
import { capabilityBadge, describeReason, KIND_LABELS, STATUS_LABELS } from "../state/lane-helpers";

/**
 * 레인별 probe 결과·사유 코드·softwareRenderer 경고. 미지원 레인은 비활성으로 남고
 * 다른 레인으로 자동 전환하지 않는다(ADR-0018). 앱 오류 목록도 여기서 보여준다.
 */
export function CapabilityBanner() {
  const { registry, actions } = useLab();
  const capability = useLabSelector((s) => s.capability);
  const errors = useLabSelector((s) => s.errors);
  const probed = registry.filter((d) => capability[d.id] !== null);
  const allOk =
    probed.length === registry.length &&
    registry.every((d) => d.status === "reserved" || capability[d.id]?.status === "supported");
  return (
    <section
      className={`lab-banner${allOk ? " lab-banner--ok" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="레인 능력 보고"
    >
      <p>
        <strong>레인 능력(probe)</strong> — 미지원 레인은 사유 코드와 함께 비활성이며 다른 레인으로 자동 전환하지
        않는다(무음 대체 없음). probe {probed.length}/{registry.length}.
      </p>
      <ul>
        {registry.map((desc) => {
          const cap = capability[desc.id];
          const badgeClass =
            cap === null
              ? "lab-badge"
              : cap.status === "supported"
                ? cap.softwareRenderer === true
                  ? "lab-badge lab-badge--warn"
                  : "lab-badge lab-badge--pass"
                : "lab-badge lab-badge--fail";
          return (
            <li key={desc.id}>
              <span className="lab-mono">{desc.id}</span> {desc.label} · {KIND_LABELS[desc.kind]} ·{" "}
              {STATUS_LABELS[desc.status]} · <span className={badgeClass}>{capabilityBadge(cap)}</span>
              {cap && cap.status === "unavailable" && cap.reasons.length > 0 ? (
                <ul>
                  {cap.reasons.map((r) => (
                    <li key={r}>
                      <code>{r}</code> — {describeReason(r)}
                    </li>
                  ))}
                </ul>
              ) : null}
              {cap && cap.softwareRenderer === true ? (
                <span className="lab-muted"> 소프트웨어 렌더러 — 성능 증거로 쓰지 않는다.</span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {errors.length > 0 ? (
        <div>
          <ul className="lab-error-list" aria-label="오류 목록">
            {errors.map((e) => (
              <li key={e.seq}>
                [{e.laneId ?? "앱"}] <code>{e.code}</code> {e.message}
              </li>
            ))}
          </ul>
          <div className="lab-button-row">
            <button type="button" className="lab-button" onClick={() => actions.clearErrors()}>
              오류 지우기
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
