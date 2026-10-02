/**
 * 좌측 슬롯 레일(15칸): 얼굴 6 · 몸/의상 6 · 연기 3. 각 칸은 현재 프리셋 이름과 능력 배지(부분/미지원 + 사유 tooltip)를
 * 보여주고 클릭하면 UI 상태의 활성 슬롯이 바뀐다(SlotPanel·썸네일 드라이버가 이를 읽는다).
 * 미지원 슬롯도 숨기지 않는다 — 사유를 그대로 보여준다.
 */
import { SLOT_GROUPS, SLOT_GROUP_LABELS_KO, SLOT_LABELS_KO, presetName } from "../../contracts";

import { useCatalog, useLabState, useUiActions, useUiState } from "./lab-store-context";

import type { SlotGroup } from "../../contracts";

const GROUP_ORDER: readonly SlotGroup[] = ["identity", "figure", "performance"];

export function SlotRail() {
  const state = useLabState();
  const catalog = useCatalog();
  const ui = useUiState();
  const { setActiveSlot } = useUiActions();

  return (
    <nav className="cl-slot-rail" aria-label="슬롯 레일(15칸)">
      {GROUP_ORDER.map((group) => (
        <section key={group} className="cl-slot-group">
          <h2 className="cl-slot-group-title">{SLOT_GROUP_LABELS_KO[group]}</h2>
          <ul className="cl-slot-list">
            {SLOT_GROUPS[group].map((slot) => {
              const capability = state.capabilities[slot];
              const presetId = state.recipe.slots[slot];
              const entry = presetId ? catalog.get(presetId) : undefined;
              const presetLabel = entry?.labelKo ?? (presetId ? presetName(presetId) : "없음");
              const active = ui.activeSlot === slot;
              return (
                <li key={slot}>
                  <button
                    type="button"
                    className="cl-slot-cell"
                    data-status={capability.status}
                    aria-current={active ? "true" : undefined}
                    title={capability.reasonKo}
                    onClick={() => setActiveSlot(slot)}
                  >
                    <span className="cl-slot-cell-name">{SLOT_LABELS_KO[slot]}</span>
                    <span className="cl-slot-cell-preset">{presetLabel}</span>
                    {capability.status !== "available" && (
                      <span className="cl-slot-cell-badge" data-status={capability.status}>
                        {capability.status === "partial" ? "부분" : "미지원"}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
