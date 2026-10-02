import { CANVAS_PRESET_IDS, CANVAS_PRESETS } from "../../bench/fixtures/canvas-presets";
import { parseCapturedStroke, serializeCapturedStroke } from "../../bench/fixtures/fixture-schema";
import { fixtureDescription, FIXTURE_IDS, isFixtureId } from "../../bench/fixtures/stroke-fixtures";
import { downloadJson } from "../../platform/download";
import { useLab, useLabSelector } from "../shell/lab-context";
import { messageOf } from "../state/run-compare";

import type { ChangeEvent } from "react";

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * fixture 선택(내장 9종 또는 캡처 획), 캔버스 크기, 시드, 실시간 캡처·결정성 재실행 토글, 캡처 JSON 저장/불러오기.
 */
export function FixturePicker() {
  const { actions } = useLab();
  const fixtureId = useLabSelector((s) => s.fixtureId);
  const fixtureSource = useLabSelector((s) => s.fixtureSource);
  const captured = useLabSelector((s) => s.captured);
  const liveCapture = useLabSelector((s) => s.liveCapture);
  const determinismRerun = useLabSelector((s) => s.determinismRerun);
  const canvasSize = useLabSelector((s) => s.canvasSize);
  const seed = useLabSelector((s) => s.seed);
  const running = useLabSelector((s) => s.running);

  const onLoadFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseCapturedStroke(JSON.parse(text));
      actions.setCaptured(parsed);
    } catch (error) {
      actions.pushError({ laneId: null, code: "captured-parse-error", message: `캡처 JSON 불러오기 실패: ${messageOf(error)}` });
    } finally {
      input.value = "";
    }
  };

  return (
    <div className="lab-form-grid" data-testid="lab-fixture-picker">
      <div className="lab-field">
        <label htmlFor="lab-fixture">
          <span>fixture</span>
        </label>
        <select
          id="lab-fixture"
          value={fixtureId}
          disabled={running}
          onChange={(e) => {
            if (isFixtureId(e.target.value)) actions.setFixture(e.target.value);
          }}
        >
          {FIXTURE_IDS.map((id) => (
            <option key={id} value={id}>
              {id} — {fixtureDescription(id)}
            </option>
          ))}
        </select>
      </div>
      <div className="lab-field">
        <label htmlFor="lab-fixture-source">
          <span>입력 출처</span>
        </label>
        <select
          id="lab-fixture-source"
          value={fixtureSource}
          disabled={running}
          onChange={(e) => actions.setFixtureSource(e.target.value === "captured" ? "captured" : "builtin")}
        >
          <option value="builtin">내장 fixture</option>
          <option value="captured" disabled={!captured}>
            캡처 획{captured ? ` (${captured.samples.length} 표본, ${captured.width}×${captured.height})` : " (없음)"}
          </option>
        </select>
      </div>
      <div className="lab-field">
        <label htmlFor="lab-canvas-size">
          <span>캔버스</span>
        </label>
        <select
          id="lab-canvas-size"
          value={String(canvasSize)}
          disabled={running}
          onChange={(e) => actions.setCanvasSize(Number(e.target.value))}
        >
          {CANVAS_PRESET_IDS.map((id) => (
            <option key={id} value={String(CANVAS_PRESETS[id].width)}>
              {id} {CANVAS_PRESETS[id].width}²
            </option>
          ))}
        </select>
      </div>
      <div className="lab-field">
        <label htmlFor="lab-seed">
          <span>시드</span>
        </label>
        <input
          id="lab-seed"
          type="number"
          min={0}
          step={1}
          value={seed}
          disabled={running}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= 0) actions.setSeed(v);
          }}
        />
      </div>
      <label className="lab-check">
        <input
          type="checkbox"
          checked={liveCapture}
          disabled={running}
          onChange={(e) => actions.setLiveCapture(e.target.checked)}
        />
        실시간 입력(레인 A 캔버스에 직접 그린다 · getCoalescedEvents/getPredictedEvents)
      </label>
      <label className="lab-check">
        <input
          type="checkbox"
          checked={determinismRerun}
          disabled={running}
          onChange={(e) => actions.setDeterminismRerun(e.target.checked)}
        />
        결정성 재실행(같은 입력 2회 → 픽셀 해시 동일 판정, 실행 시간 2배)
      </label>
      <div className="lab-button-row">
        <button
          type="button"
          className="lab-button"
          disabled={!captured}
          onClick={() => {
            if (captured) downloadJson(`captured-stroke-${dateStamp()}.json`, serializeCapturedStroke(captured));
          }}
        >
          캡처 JSON 저장
        </button>
        <label className="lab-button lab-file-input">
          캡처 JSON 불러오기
          <input
            type="file"
            accept="application/json,.json"
            className="lab-visually-hidden"
            disabled={running}
            onChange={(e) => {
              void onLoadFile(e);
            }}
          />
        </label>
      </div>
    </div>
  );
}
