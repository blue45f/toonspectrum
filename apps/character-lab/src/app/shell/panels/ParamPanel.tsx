/**
 * ParamPanel: 체형 9·얼굴 15 파라미터(슬라이더 + 숫자 입력 + 리셋)와 피부·홍채·머리·눈썹 색 팔레트.
 *
 * - 값 범위는 [-1, 1], 0이 기본 형상이다. 지오메트리는 파라미터 0 기준이고 현재 값은 적용 플랜(`paramToMorphWeights`)의
 *   morph 가중치(+는 `param:<키>:+`, −는 `param:<키>:-`)로 반영되므로 슬라이더 이동은 소스 재생성 없이 즉시 형상을 바꾼다.
 * - 슬라이더·숫자 입력의 변경 = `param/set` 1회(`coalesceKey: "<group>:<key>"`)라 같은 파라미터의 연속 드래그·타이핑이
 *   되돌리기 1단계로 병합된다. 행 리셋은 병합하지 않는 별도 1단계다.
 * - 그룹·전체 초기화는 0이 아닌 파라미터마다 `param/set(0)`을 같은 `coalesceKey`(`reset:<group>`)로 연속 dispatch해
 *   store의 병합 윈도우 안에서 되돌리기 1단계가 되게 한다(`recipe/load`처럼 history 라벨을 오염시키지 않는다).
 * - 숫자 입력은 입력 중 초안 문자열을 유지하고(파싱 가능한 값만 즉시 반영, 범위 밖은 클램프), 포커스를 잃으면 실제 값으로 되돌린다.
 * - 팔레트 견본 클릭 = `color/set` 1회. 지정색이 팔레트에 없으면(레시피 불러오기 등) "직접 지정"으로 표시한다.
 * - 요약 한 줄(키·등신·팔·다리 길이)은 `resolveProportions(recipe.body)` 실측이며 슬라이더와 함께 갱신된다.
 * - 스타일 접두 `cl-param-`(core의 character-lab.css가 정의; 추가 클래스는 docs/parity/humanoid.md §4 요청).
 */
import { useId, useState } from "react";

import { BODY_PARAM_KEYS, BODY_PARAM_LABELS_KO, FACE_PARAM_KEYS, FACE_PARAM_LABELS_KO, PARAM_MAX, PARAM_MIN, clampParam } from "../../../contracts";
import { HAIR_COLORS, IRIS_COLORS, SKIN_TONES, findPaletteEntry } from "../../../domains/humanoid/palette";
import { resolveProportions } from "../../../domains/humanoid/proportions";
import { useDispatch, useLabState } from "../lab-store-context";

import type { BodyParamKey, FaceParamKey, ParamKey, RecipeColorKey, SlotKind } from "../../../contracts";
import type { PaletteEntry } from "../../../domains/humanoid/palette";

export type ParamGroup = "body" | "face";

/** [음의 끝, 양의 끝] 한글 설명. 슬라이더 양 끝 표기와 `aria-valuetext`에 쓴다(morph 델타 방향과 일치). */
export const PARAM_POLES_KO: Readonly<Record<ParamKey, readonly [string, string]>> = {
  height: ["작게", "크게"],
  shoulderWidth: ["좁게", "넓게"],
  chestDepth: ["얇게", "두껍게"],
  waist: ["가늘게", "굵게"],
  hip: ["좁게", "넓게"],
  armLength: ["짧게", "길게"],
  legLength: ["짧게", "길게"],
  headSize: ["작게", "크게"],
  neckLength: ["짧게", "길게"],
  faceShape: ["갸름하게", "둥글게"],
  jawWidth: ["좁게", "넓게"],
  chinLength: ["짧게", "길게"],
  cheekVolume: ["홀쭉하게", "통통하게"],
  forehead: ["들어가게", "나오게"],
  eyeSize: ["작게", "크게"],
  eyeSpacing: ["좁게", "넓게"],
  eyeTilt: ["눈꼬리 내림", "눈꼬리 올림"],
  noseHeight: ["낮게", "높게"],
  noseWidth: ["좁게", "넓게"],
  noseDepth: ["납작하게", "오뚝하게"],
  mouthWidth: ["좁게", "넓게"],
  lipFullness: ["얇게", "도톰하게"],
  earSize: ["작게", "크게"],
  earAngle: ["붙게", "벌어지게"],
};

interface PaletteRowSpec {
  readonly key: RecipeColorKey;
  readonly labelKo: string;
  readonly entries: readonly PaletteEntry[];
}

const PALETTE_ROWS: readonly PaletteRowSpec[] = [
  { key: "skin", labelKo: "피부색", entries: SKIN_TONES },
  { key: "iris", labelKo: "홍채색", entries: IRIS_COLORS },
  { key: "hair", labelKo: "머리색", entries: HAIR_COLORS },
  { key: "brow", labelKo: "눈썹색", entries: HAIR_COLORS },
];

/** 소수 2자리 문자열. -0·-0.00을 만들지 않는다. */
export function formatParam(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return (rounded === 0 ? 0 : rounded).toFixed(2);
}

/** 부호를 붙인 값 + 가까운 끝의 설명("+0.35 · 크게", 0은 "0.00 · 기본"). */
export function describeParamValue(value: number, poles: readonly [string, string]): string {
  const text = formatParam(value);
  if (Number(text) === 0) return `${text} · 기본`;
  return `${Number(text) > 0 ? "+" : ""}${text} · ${Number(text) > 0 ? poles[1] : poles[0]}`;
}

interface ParamRowProps {
  readonly paramKey: ParamKey;
  readonly labelKo: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly onReset: () => void;
}

function ParamRow({ paramKey, labelKo, value, onChange, onReset }: ParamRowProps) {
  const ids = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const poles = PARAM_POLES_KO[paramKey];
  const parsedDraft = draft === null ? null : Number(draft);
  const outOfRange = parsedDraft !== null && Number.isFinite(parsedDraft) && draft?.trim() !== "" && (parsedDraft < PARAM_MIN || parsedDraft > PARAM_MAX);

  return (
    <div className="cl-param-row" data-param={paramKey}>
      <label htmlFor={`${ids}-range`}>{labelKo}</label>
      <span className="cl-param-pole cl-param-pole--negative" aria-hidden="true">
        {poles[0]}
      </span>
      <input
        id={`${ids}-range`}
        type="range"
        min={PARAM_MIN}
        max={PARAM_MAX}
        step={0.01}
        value={value}
        aria-valuetext={describeParamValue(value, poles)}
        onChange={(event) => {
          setDraft(null);
          onChange(Number(event.target.value));
        }}
      />
      <span className="cl-param-pole cl-param-pole--positive" aria-hidden="true">
        {poles[1]}
      </span>
      <input
        type="number"
        className="cl-param-number"
        aria-label={`${labelKo} 숫자`}
        aria-invalid={outOfRange ? true : undefined}
        min={PARAM_MIN}
        max={PARAM_MAX}
        step={0.01}
        value={draft ?? formatParam(value)}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const parsed = Number(text);
          if (text.trim() !== "" && Number.isFinite(parsed)) onChange(parsed);
        }}
        onBlur={() => setDraft(null)}
      />
      <button
        type="button"
        className="cl-param-reset"
        aria-label={`${labelKo} 초기화`}
        disabled={value === 0}
        onClick={() => {
          setDraft(null);
          onReset();
        }}
      >
        초기화
      </button>
    </div>
  );
}

interface PaletteRowProps {
  readonly spec: PaletteRowSpec;
  readonly current: string;
  readonly onPick: (key: RecipeColorKey, hex: string) => void;
}

function PaletteRow({ spec, current, onPick }: PaletteRowProps) {
  const matched = findPaletteEntry(spec.entries, current);
  return (
    <div className="cl-param-palette-row" data-color-key={spec.key}>
      <span className="cl-param-palette-label">{spec.labelKo}</span>
      <div className="cl-param-palette" role="group" aria-label={spec.labelKo}>
        {spec.entries.map((entry) => {
          const selected = entry.hex === current;
          return (
            <button
              key={entry.id}
              type="button"
              className={`cl-param-swatch${selected ? " cl-param-swatch--selected" : ""}`}
              aria-label={`${spec.labelKo} ${entry.labelKo}`}
              aria-pressed={selected}
              title={`${entry.labelKo} ${entry.hex}`}
              data-hex={entry.hex}
              style={{ backgroundColor: entry.hex, width: 22, height: 22, borderRadius: "50%", border: selected ? "2px solid var(--lab-accent, #4c8dff)" : "1px solid var(--lab-line, #888)", padding: 0, cursor: "pointer" }}
              onClick={() => onPick(spec.key, entry.hex)}
            />
          );
        })}
      </div>
      <span className="cl-param-palette-name">{matched ? `${matched.labelKo} (${matched.hex})` : `직접 지정 (${current})`}</span>
    </div>
  );
}

/** 슬롯 능력이 완전하지 않을 때의 사유 줄(체형·얼굴형 슬롯 기준) */
const CAPABILITY_SLOTS: readonly { readonly slot: SlotKind; readonly labelKo: string }[] = [
  { slot: "body", labelKo: "체형" },
  { slot: "face-shape", labelKo: "얼굴형" },
];

function meters(value: number): string {
  return value.toFixed(2);
}

export function ParamPanel() {
  const { recipe, capabilities } = useLabState();
  const dispatch = useDispatch();

  const setParam = (group: ParamGroup, key: BodyParamKey | FaceParamKey, value: number, options: { readonly coalesceKey?: string } = {}): void => {
    dispatch({ type: "param/set", group, key, value: clampParam(value), ...(options.coalesceKey !== undefined ? { coalesceKey: options.coalesceKey } : {}) });
  };

  const bodyValue = (key: BodyParamKey): number => recipe.body[key] ?? 0;
  const faceValue = (key: FaceParamKey): number => recipe.face[key] ?? 0;
  const activeBody = BODY_PARAM_KEYS.filter((key) => bodyValue(key) !== 0);
  const activeFace = FACE_PARAM_KEYS.filter((key) => faceValue(key) !== 0);

  const resetGroup = (which: ParamGroup | "all"): void => {
    const coalesceKey = `reset:${which}`;
    if (which !== "face") for (const key of activeBody) setParam("body", key, 0, { coalesceKey });
    if (which !== "body") for (const key of activeFace) setParam("face", key, 0, { coalesceKey });
  };

  const proportions = resolveProportions(recipe.body);
  const headCount = proportions.height / (proportions.head.scale * 2);
  const armLength = proportions.upperArmLength + proportions.lowerArmLength;
  const legLength = proportions.upperLegLength + proportions.lowerLegLength;
  const limited = CAPABILITY_SLOTS.map((item) => ({ ...item, capability: capabilities[item.slot] })).filter((item) => item.capability.status !== "available");

  return (
    <section className="cl-param-panel" aria-label="체형·얼굴">
      <h2 className="cl-param-title">체형·얼굴</h2>
      <p className="cl-param-hint">
        각 슬라이더는 −1(왼쪽 끝)~+1(오른쪽 끝)이고 0이 기본 형상입니다. 같은 파라미터의 연속 드래그·타이핑은 되돌리기 1단계로 묶입니다.
      </p>
      {recipe.source.kind === "package" ? (
        <p className="cl-param-reason" role="note">
          제작 패키지 소스에서는 패키지의 셰이프 키에 매핑된 파라미터만 형상에 반영됩니다(매핑이 없는 항목은 값만 기록됩니다).
        </p>
      ) : null}
      {limited.map((item) => (
        <p key={item.slot} className="cl-param-reason" role="note">
          {item.labelKo} 슬롯 {item.capability.status === "partial" ? "부분 지원" : "미지원"}: {item.capability.reasonKo ?? "사유 없음"}
        </p>
      ))}
      <p className="cl-param-status" role="status">
        키 {meters(proportions.height)} m · 약 {headCount.toFixed(1)}등신 · 팔 {meters(armLength)} m · 다리 {meters(legLength)} m
      </p>

      <div className="cl-param-actions">
        <button type="button" onClick={() => resetGroup("body")} disabled={activeBody.length === 0}>
          체형 초기화
        </button>
        <button type="button" onClick={() => resetGroup("face")} disabled={activeFace.length === 0}>
          얼굴 초기화
        </button>
        <button type="button" onClick={() => resetGroup("all")} disabled={activeBody.length + activeFace.length === 0}>
          모두 초기화
        </button>
      </div>

      <div className="cl-param-group" role="group" aria-label="체형 파라미터">
        <h3 className="cl-param-subtitle">체형 ({BODY_PARAM_KEYS.length})</h3>
        {BODY_PARAM_KEYS.map((key) => (
          <ParamRow
            key={key}
            paramKey={key}
            labelKo={BODY_PARAM_LABELS_KO[key]}
            value={bodyValue(key)}
            onChange={(value) => setParam("body", key, value, { coalesceKey: `body:${key}` })}
            onReset={() => setParam("body", key, 0)}
          />
        ))}
      </div>

      <div className="cl-param-group" role="group" aria-label="얼굴 파라미터">
        <h3 className="cl-param-subtitle">얼굴 ({FACE_PARAM_KEYS.length})</h3>
        {FACE_PARAM_KEYS.map((key) => (
          <ParamRow
            key={key}
            paramKey={key}
            labelKo={FACE_PARAM_LABELS_KO[key]}
            value={faceValue(key)}
            onChange={(value) => setParam("face", key, value, { coalesceKey: `face:${key}` })}
            onReset={() => setParam("face", key, 0)}
          />
        ))}
      </div>

      <div className="cl-param-group" role="group" aria-label="색 팔레트">
        <h3 className="cl-param-subtitle">색 팔레트</h3>
        {PALETTE_ROWS.map((spec) => (
          <PaletteRow key={spec.key} spec={spec} current={recipe.colors[spec.key]} onPick={(key, hex) => dispatch({ type: "color/set", key, value: hex })} />
        ))}
      </div>
      <p className="cl-param-hint">색은 적용 플랜으로 즉시 반영되며 소스를 다시 만들지 않습니다. 눈썹색은 속눈썹에도 쓰입니다.</p>
    </section>
  );
}
