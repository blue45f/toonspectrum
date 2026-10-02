import { useId, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  createStudioTilePortalPairFromPreset,
  createTileEffect,
  STUDIO_TILE_EFFECT_KINDS,
  STUDIO_TILE_PORTAL_PRESET_CONTI_ROOM_RECORDING_BOOTH,
  type StudioTileEffectDefinition,
  type StudioTileEffectError,
  type StudioTileEffectErrorCode,
  type StudioTileEffectInput,
  type StudioTileEffectKind,
  type StudioTileZoneTag,
} from "./studio-virtual-space-tile-effects";

export interface StudioVirtualSpaceTileEffectEditorProps {
  readonly effects: readonly StudioTileEffectDefinition[];
  readonly onChange: (effects: readonly StudioTileEffectDefinition[]) => void;
}

const KIND_LABELS: Readonly<Record<StudioTileEffectKind, readonly [string, string]>> = {
  spawn: ["스폰 지점", "Spawn point"],
  portal: ["포털", "Portal"],
  blocked: ["통과 불가", "Blocked"],
  zone: ["지정 영역", "Zone"],
  spotlight: ["스포트라이트", "Spotlight"],
  youtube: ["유튜브 임베드", "YouTube embed"],
  weblink: ["웹 링크", "Web link"],
  app: ["인월드 앱", "In-world app"],
  bgm: ["BGM", "BGM"],
};

const ZONE_TAG_LABELS: Readonly<Record<StudioTileZoneTag, readonly [string, string]>> = {
  private: ["프라이빗", "Private"],
  silent: ["사일런트", "Silent"],
};

const ERROR_COPY: Readonly<Record<StudioTileEffectErrorCode, readonly [string, string]>> = {
  "unknown-kind": ["알 수 없는 이펙트 종류예요.", "Unknown effect type."],
  "invalid-id": ["ID는 영문·숫자·밑줄·하이픈만 쓸 수 있어요.", "IDs may only use letters, numbers, underscores, or hyphens."],
  "duplicate-id": ["이미 같은 ID의 이펙트가 있어요.", "An effect with this ID already exists."],
  "invalid-tile-x": ["타일 X 좌표는 0 이상 정수여야 해요.", "Tile X must be an integer of 0 or more."],
  "invalid-tile-y": ["타일 Y 좌표는 0 이상 정수여야 해요.", "Tile Y must be an integer of 0 or more."],
  "invalid-size": ["가로·세로는 정수여야 해요.", "Width and height must be integers."],
  "missing-destination-room": ["포털 목적지 구역(방)을 입력해 주세요.", "Enter the portal destination room."],
  "invalid-destination-point": ["목적지 타일 좌표는 0 이상 정수여야 해요.", "Destination tile coordinates must be integers of 0 or more."],
  "invalid-zone-tag": ["구역 태그는 프라이빗 또는 사일런트여야 해요.", "The zone tag must be private or silent."],
  "missing-url": ["URL을 입력해 주세요.", "Enter a URL."],
  "invalid-url": ["올바른 URL 형식이 아니에요.", "That is not a valid URL."],
  "unsupported-url-scheme": ["http 또는 https 주소만 쓸 수 있어요.", "Only http or https URLs are supported."],
  "invalid-youtube-url": ["유튜브 영상 주소 형식이 아니에요.", "That is not a YouTube video URL."],
  "invalid-radius": ["반경은 숫자여야 해요.", "Radius must be a number."],
  "invalid-volume": ["볼륨은 숫자여야 해요.", "Volume must be a number."],
};

interface TileEffectFormState {
  readonly kind: StudioTileEffectKind;
  readonly name: string;
  readonly tileX: string;
  readonly tileY: string;
  readonly width: string;
  readonly height: string;
  readonly destinationRoom: string;
  readonly destinationTileX: string;
  readonly destinationTileY: string;
  readonly zoneTag: StudioTileZoneTag;
  readonly url: string;
  readonly radius: string;
  readonly volume: string;
  /** 인월드 앱: 패널 제목 (비우면 이름/앱 이름). */
  readonly appTitle: string;
  /** 인월드 앱: postMessage 브리지 허용 여부. */
  readonly appAllowApi: boolean;
}

const INITIAL_FORM: TileEffectFormState = {
  kind: "spawn", name: "", tileX: "0", tileY: "0", width: "1", height: "1",
  destinationRoom: "", destinationTileX: "0", destinationTileY: "0",
  zoneTag: "private", url: "", radius: "3", volume: "0.6", appTitle: "", appAllowApi: false,
};

function parseOptionalNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  return Number(trimmed);
}

export function StudioVirtualSpaceTileEffectEditor({ effects, onChange }: StudioVirtualSpaceTileEffectEditorProps) {
  const bt = useBilingual("StudioVirtualSpaceTileEffectEditor");
  const id = useId();
  const [form, setForm] = useState<TileEffectFormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<readonly StudioTileEffectError[] | null>(null);
  const [notices, setNotices] = useState<readonly string[]>([]);

  const set = <Key extends keyof TileEffectFormState>(key: Key, value: TileEffectFormState[Key]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const buildInput = (): StudioTileEffectInput => {
    const base = {
      kind: form.kind,
      name: form.name.trim() === "" ? undefined : form.name,
      tileX: parseOptionalNumber(form.tileX),
      tileY: parseOptionalNumber(form.tileY),
      width: parseOptionalNumber(form.width),
      height: parseOptionalNumber(form.height),
    };
    switch (form.kind) {
      case "portal":
        return {
          ...base,
          destinationRoom: form.destinationRoom.trim() === "" ? undefined : form.destinationRoom,
          destinationTileX: parseOptionalNumber(form.destinationTileX),
          destinationTileY: parseOptionalNumber(form.destinationTileY),
        };
      case "zone":
        return { ...base, zoneTag: form.zoneTag };
      case "youtube":
      case "weblink":
        return { ...base, url: form.url.trim() === "" ? undefined : form.url };
      case "bgm":
        return {
          ...base,
          url: form.url.trim() === "" ? undefined : form.url,
          radius: parseOptionalNumber(form.radius),
          volume: parseOptionalNumber(form.volume),
        };
      case "app":
        return {
          ...base,
          url: form.url.trim() === "" ? undefined : form.url,
          title: form.appTitle.trim() === "" ? undefined : form.appTitle,
          allowApi: form.appAllowApi,
        };
      case "spawn":
      case "blocked":
      case "spotlight":
        return base;
    }
  };

  const addEffect = () => {
    const result = createTileEffect(buildInput(), effects.map((effect) => effect.id));
    if (!result.ok) {
      setErrors(result.errors);
      setNotices([]);
      return;
    }
    setErrors(null);
    setNotices(result.warnings);
    onChange([...effects, result.effect]);
    setForm({ ...INITIAL_FORM, kind: form.kind });
  };

  const addPortalPairPreset = () => {
    const result = createStudioTilePortalPairFromPreset(
      STUDIO_TILE_PORTAL_PRESET_CONTI_ROOM_RECORDING_BOOTH,
      {
        nameA: bt("콘티룸 → 녹음부스 포털", "Storyboard room → recording booth portal"),
        nameB: bt("녹음부스 → 콘티룸 포털", "Recording booth → storyboard room portal"),
        existingIds: effects.map((effect) => effect.id),
      },
    );
    if (!result.ok) {
      setErrors(result.errors);
      setNotices([]);
      return;
    }
    setErrors(null);
    setNotices(result.warnings);
    onChange([...effects, ...result.effects]);
  };

  const removeEffect = (effectId: string) => {
    onChange(effects.filter((effect) => effect.id !== effectId));
  };

  const describeEffect = (effect: StudioTileEffectDefinition): string => {
    const position = `(${effect.tileX}, ${effect.tileY}) ${effect.width}×${effect.height}`;
    const label = effect.name === "" ? bt(...KIND_LABELS[effect.kind]) : effect.name;
    switch (effect.kind) {
      case "portal":
        return `${label} · ${position} → ${effect.destinationRoom} (${effect.destinationTileX}, ${effect.destinationTileY})`;
      case "zone":
        return `${label} · ${position} · ${bt(...ZONE_TAG_LABELS[effect.zoneTag])}`;
      case "youtube":
        return `${label} · ${position} · ${effect.embedUrl}`;
      case "weblink":
        return `${label} · ${position} · ${effect.url}`;
      case "app":
        return `${label} · ${position} · ${effect.url}${effect.allowApi ? ` · ${bt("API 허용", "API on")}` : ""}`;
      case "bgm":
        return `${label} · ${position} · ${bt("반경", "Radius")} ${effect.radius} · ${bt("볼륨", "Volume")} ${effect.volume}`;
      case "spawn":
      case "blocked":
      case "spotlight":
        return `${label} · ${position}`;
    }
  };

  return (
    <fieldset className="studio-tile-effect-editor">
      <legend>{bt("타일 이펙트 편집", "Edit tile effects")}</legend>
      <p id={`${id}-help`}>
        {bt(
          "이펙트 종류를 고르고 속성을 입력한 뒤 추가하세요. 실제 미디어 재생이나 서버 연동 없이 로컬 배치 목록만 관리합니다.",
          "Choose an effect type, fill in its properties, then add it. This only manages the local placement list — no media playback or server sync.",
        )}
      </p>

      <div className="studio-tile-effect-editor__form" role="group" aria-labelledby={`${id}-form-title`}>
        <p id={`${id}-form-title`} className="studio-tile-effect-editor__form-title">
          {bt("새 이펙트", "New effect")}
        </p>
        <label htmlFor={`${id}-kind`}>{bt("이펙트 종류", "Effect type")}</label>
        <select
          id={`${id}-kind`}
          value={form.kind}
          onChange={(event) => set("kind", event.target.value as StudioTileEffectKind)}
        >
          {STUDIO_TILE_EFFECT_KINDS.map((kind) => (
            <option key={kind} value={kind}>{bt(...KIND_LABELS[kind])}</option>
          ))}
        </select>

        {form.kind === "spotlight" && (
          <p className="studio-tile-effect-editor__hint">
            {bt(
              "무대에 올라선 사람이 발표자가 됩니다. 실제 발표 화면 전환은 발표 트랙과 연동됩니다.",
              "Whoever steps on the stage becomes the presenter. The actual presentation view is handled by the presentation track.",
            )}
          </p>
        )}

        <label htmlFor={`${id}-name`}>{bt("표시 이름 (선택)", "Display name (optional)")}</label>
        <input id={`${id}-name`} type="text" value={form.name} onChange={(event) => set("name", event.target.value)} />

        <div className="studio-tile-effect-editor__row">
          <div>
            <label htmlFor={`${id}-tile-x`}>{bt("타일 X", "Tile X")}</label>
            <input id={`${id}-tile-x`} type="number" min={0} step={1} value={form.tileX} onChange={(event) => set("tileX", event.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-tile-y`}>{bt("타일 Y", "Tile Y")}</label>
            <input id={`${id}-tile-y`} type="number" min={0} step={1} value={form.tileY} onChange={(event) => set("tileY", event.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-width`}>{bt("가로 (타일)", "Width (tiles)")}</label>
            <input id={`${id}-width`} type="number" min={1} step={1} value={form.width} onChange={(event) => set("width", event.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-height`}>{bt("세로 (타일)", "Height (tiles)")}</label>
            <input id={`${id}-height`} type="number" min={1} step={1} value={form.height} onChange={(event) => set("height", event.target.value)} />
          </div>
        </div>

        {form.kind === "portal" && (
          <>
            <label htmlFor={`${id}-destination-room`}>{bt("목적지 구역(방) ID", "Destination room ID")}</label>
            <input
              id={`${id}-destination-room`} type="text" value={form.destinationRoom}
              placeholder={bt("예: recording-booth", "e.g. recording-booth")}
              onChange={(event) => set("destinationRoom", event.target.value)}
            />
            <div className="studio-tile-effect-editor__row">
              <div>
                <label htmlFor={`${id}-destination-x`}>{bt("목적지 타일 X", "Destination tile X")}</label>
                <input id={`${id}-destination-x`} type="number" min={0} step={1} value={form.destinationTileX} onChange={(event) => set("destinationTileX", event.target.value)} />
              </div>
              <div>
                <label htmlFor={`${id}-destination-y`}>{bt("목적지 타일 Y", "Destination tile Y")}</label>
                <input id={`${id}-destination-y`} type="number" min={0} step={1} value={form.destinationTileY} onChange={(event) => set("destinationTileY", event.target.value)} />
              </div>
            </div>
          </>
        )}

        {form.kind === "zone" && (
          <>
            <label htmlFor={`${id}-zone-tag`}>{bt("구역 태그", "Zone tag")}</label>
            <select id={`${id}-zone-tag`} value={form.zoneTag} onChange={(event) => set("zoneTag", event.target.value as StudioTileZoneTag)}>
              <option value="private">{bt(...ZONE_TAG_LABELS.private)}</option>
              <option value="silent">{bt(...ZONE_TAG_LABELS.silent)}</option>
            </select>
          </>
        )}

        {(form.kind === "youtube" || form.kind === "weblink" || form.kind === "bgm" || form.kind === "app") && (
          <>
            <label htmlFor={`${id}-url`}>{bt("URL", "URL")}</label>
            <input
              id={`${id}-url`} type="url" value={form.url}
              placeholder={form.kind === "youtube" ? "https://www.youtube.com/watch?v=…" : form.kind === "app" ? "https://… 또는 toonstudio://timer" : "https://…"}
              onChange={(event) => set("url", event.target.value)}
            />
          </>
        )}

        {form.kind === "app" && (
          <>
            <label htmlFor={`${id}-app-title`}>{bt("패널 제목 (선택)", "Panel title (optional)")}</label>
            <input id={`${id}-app-title`} type="text" value={form.appTitle} onChange={(event) => set("appTitle", event.target.value)} />
            <div className="studio-tile-effect-editor__row">
              <button type="button" onClick={() => set("url", "toonstudio://timer")}>
                {bt("내장 집중 타이머로 채우기", "Use the built-in focus timer")}
              </button>
            </div>
            <label className="studio-tile-effect-editor__check">
              <input
                type="checkbox" checked={form.appAllowApi}
                onChange={(event) => set("appAllowApi", event.target.checked)}
              />
              {bt("내부 API 접근 허용 (postMessage 브리지)", "Allow internal API access (postMessage bridge)")}
            </label>
            <p className="studio-tile-effect-editor__hint">
              {bt(
                "iframe은 항상 샌드박스로 열립니다. API를 허용해도 읽기 전용 공간 정보만 postMessage로 주고받습니다.",
                "The iframe always opens sandboxed. Even with API allowed, only read-only space info crosses via postMessage.",
              )}
            </p>
          </>
        )}

        {form.kind === "bgm" && (
          <div className="studio-tile-effect-editor__row">
            <div>
              <label htmlFor={`${id}-radius`}>{bt("재생 반경 (타일)", "Playback radius (tiles)")}</label>
              <input id={`${id}-radius`} type="number" min={1} step={1} value={form.radius} onChange={(event) => set("radius", event.target.value)} />
            </div>
            <div>
              <label htmlFor={`${id}-volume`}>{bt("볼륨 (0–1)", "Volume (0–1)")}</label>
              <input id={`${id}-volume`} type="number" min={0} max={1} step={0.1} value={form.volume} onChange={(event) => set("volume", event.target.value)} />
            </div>
          </div>
        )}

        <div className="studio-tile-effect-editor__actions">
          <button type="button" onClick={addEffect}>{bt("이펙트 추가", "Add effect")}</button>
          <button type="button" onClick={addPortalPairPreset}>
            {bt("콘티룸 ↔ 녹음부스 포털 쌍 추가", "Add storyboard ↔ recording booth portal pair")}
          </button>
        </div>

        {errors && (
          <ul role="alert" className="studio-tile-effect-editor__errors">
            {errors.map((error, index) => (
              <li key={`${error.code}-${index}`}>{bt(...ERROR_COPY[error.code])}</li>
            ))}
          </ul>
        )}
        {notices.length > 0 && (
          <ul className="studio-tile-effect-editor__notices">
            {notices.map((notice, index) => <li key={index}>{notice}</li>)}
          </ul>
        )}
      </div>

      <div className="studio-tile-effect-editor__list" role="group" aria-labelledby={`${id}-list-title`}>
        <p id={`${id}-list-title`} className="studio-tile-effect-editor__list-title">
          {bt("배치 목록", "Placements")} ({effects.length})
        </p>
        {effects.length === 0 ? (
          <p>{bt("아직 배치된 이펙트가 없어요.", "No effects placed yet.")}</p>
        ) : (
          <ul>
            {effects.map((effect) => (
              <li key={effect.id} className="studio-tile-effect-editor__item">
                <span>{describeEffect(effect)}</span>
                <button type="button" onClick={() => removeEffect(effect.id)} aria-label={bt(`이펙트 ${effect.id} 삭제`, `Delete effect ${effect.id}`)}>
                  {bt("삭제", "Delete")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </fieldset>
  );
}
