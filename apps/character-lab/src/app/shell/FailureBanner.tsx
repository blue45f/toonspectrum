/**
 * 실패 배너: 활성 엔진·backend·어댑터, 엔진 실패/손실 사유, 물리 provider 사용 불가 사유, 비전 모델 실패,
 * 슬롯 능력(partial/unavailable) 사유, 마지막 플랜의 미적용 슬롯, failure 이벤트 목록을 전부 보여준다.
 * 닫기만 가능하고 자동 재시도·자동 대체는 없다.
 */
import { PHYSICS_PROVIDER_LABELS_KO, SLOT_LABELS_KO } from "../../contracts";

import { describeEngineStatus } from "./engine-status-text";
import { useApplyPlan, useLabState, useLabStore } from "./lab-store-context";

import type { LabFailure, SlotCapabilityMap, SlotKind } from "../../contracts";

export interface CapabilityIssue {
  readonly slot: SlotKind;
  readonly labelKo: string;
  readonly reasonKo: string;
}

export interface CapabilitySummary {
  readonly unavailable: readonly CapabilityIssue[];
  readonly partial: readonly CapabilityIssue[];
}

export function summarizeCapabilities(capabilities: SlotCapabilityMap): CapabilitySummary {
  const unavailable: CapabilityIssue[] = [];
  const partial: CapabilityIssue[] = [];
  for (const [slot, capability] of Object.entries(capabilities) as Array<[SlotKind, SlotCapabilityMap[SlotKind]]>) {
    const issue: CapabilityIssue = { slot, labelKo: SLOT_LABELS_KO[slot], reasonKo: capability.reasonKo ?? "사유 없음" };
    if (capability.status === "unavailable") unavailable.push(issue);
    else if (capability.status === "partial") partial.push(issue);
  }
  return { unavailable, partial };
}

interface BannerItem {
  readonly key: string;
  readonly tone: "error" | "warn";
  readonly text: string;
  readonly detail?: string;
  readonly dismiss?: LabFailure;
}

export function FailureBanner() {
  const state = useLabState();
  const store = useLabStore();
  const plan = useApplyPlan();
  const engine = describeEngineStatus(state.engine);
  const capabilities = summarizeCapabilities(state.capabilities);

  const items: BannerItem[] = [];
  if (state.engine.phase === "failed" || state.engine.phase === "lost") {
    items.push({ key: "engine", tone: "error", text: engine.text, ...(engine.detail ? { detail: engine.detail } : {}) });
  }
  if (state.physics && state.physics.status === "unavailable") {
    items.push({
      key: "physics",
      tone: "warn",
      text: `물리 provider ${PHYSICS_PROVIDER_LABELS_KO[state.physics.id]}(${state.physics.id}) 사용 불가: ${state.physics.reasonKo}`,
    });
  }
  if (state.vision.phase === "failed") {
    items.push({
      key: "vision",
      tone: "error",
      text: `비전 모델 실패 [${state.vision.failure.code}]: ${state.vision.failure.reasonKo}`,
      ...(state.vision.failure.detail ? { detail: state.vision.failure.detail } : {}),
    });
  }
  for (const unsupported of plan?.unsupported ?? []) {
    items.push({
      key: `unsupported:${unsupported.slot}:${unsupported.presetId}`,
      tone: "warn",
      text: `${SLOT_LABELS_KO[unsupported.slot]} 프리셋 '${unsupported.presetId}' 미적용: ${unsupported.reasonKo}`,
    });
  }
  state.failures.forEach((failure, index) => {
    items.push({
      key: `failure:${failure.code}:${failure.at}:${index}`,
      tone: "error",
      text: `${failure.reasonKo} [${failure.code}]`,
      ...(failure.detail ? { detail: failure.detail } : {}),
      dismiss: failure,
    });
  });

  const issueCount = capabilities.unavailable.length + capabilities.partial.length;

  return (
    <section className="cl-banner" aria-label="엔진·실패 상태" aria-live="polite">
      <p className="cl-banner-engine" data-tone={engine.tone}>
        {engine.text}
      </p>
      {issueCount > 0 && (
        <details className="cl-banner-caps">
          <summary>
            슬롯 능력: 미지원 {capabilities.unavailable.length}개 · 부분 지원 {capabilities.partial.length}개 (다른 프리셋으로 대체하지 않음)
          </summary>
          <ul>
            {capabilities.unavailable.map((issue) => (
              <li key={`u:${issue.slot}`} data-status="unavailable">
                {issue.labelKo}: 미지원 — {issue.reasonKo}
              </li>
            ))}
            {capabilities.partial.map((issue) => (
              <li key={`p:${issue.slot}`} data-status="partial">
                {issue.labelKo}: 부분 지원 — {issue.reasonKo}
              </li>
            ))}
          </ul>
        </details>
      )}
      {items.length > 0 && (
        <ul className="cl-banner-list">
          {items.map((item) => {
            const dismiss = item.dismiss;
            return (
              <li key={item.key} className="cl-banner-item" data-tone={item.tone}>
                <span className="cl-banner-text">{item.text}</span>
                {item.detail && (
                  <details className="cl-banner-detail">
                    <summary>상세</summary>
                    <pre>{item.detail}</pre>
                  </details>
                )}
                {dismiss && (
                  <button
                    type="button"
                    className="cl-button cl-button-small"
                    aria-label={`닫기: ${dismiss.reasonKo}`}
                    onClick={() => store.applyEvent({ type: "failure/dismiss", failure: dismiss })}
                  >
                    닫기
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
