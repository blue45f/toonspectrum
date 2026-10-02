import { useCallback, useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { spaceKoParticle } from "./hud/space-korean";
import { addStudioVirtualDecoration } from "./studio-virtual-space-customization";
import {
  listStudioVirtualCustomFurniture,
  uploadStudioVirtualCustomFurniture,
  type StudioVirtualCustomFurniture,
} from "./studio-virtual-custom-furniture-client";
import {
  addStudioVirtualDecorationSafely,
  type StudioDecorationLayoutResult,
} from "./studio-virtual-space-decoration-layout";
import type { StudioVirtualDecorationState } from "./studio-virtual-space-customization";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

/**
 * 사용자가 직접 올린 가구를 나란히 놓는 창.
 *
 * 아틀라스 카탈로그와 섞지 않는다. 카탈로그는 내장 아트만 다루고, 여기는 사용자의
 * 이미지만 다룬다. 그래야 "내 가구"가 조명이나 나무처럼 보이지 않는다.
 */
const PLACE_REASON: Record<string, string> = {
  bounds: "여기에는 놓을 수 없어요.",
  occupied: "이미 다른 것이 있어요.",
  access: "길가에만 놓을 수 있어요.",
  limit: "가구를 더 놓을 수 없어요.",
  invalid: "지금 놓을 수 없어요.",
};

/**
 * 사용자가 직접 올린 가구를 나란히 놓는 창.
 *
 * 아틀라스 카탈로그와 섞지 않는다. 카탈로그는 내장 아트만 다루고, 여기는 사용자의
 * 이미지만 다룬다. 그래야 "내 가구"가 조명이나 나무처럼 보이지 않는다.
 */
export function StudioVirtualSpaceCustomFurniturePicker({
  decorations,
  selfPoint,
  world,
  onDecorations,
}: {
  readonly decorations: StudioVirtualDecorationState;
  readonly selfPoint: StudioVirtualSpacePoint;
  readonly world?: StudioVirtualSpaceWorldManifest;
  readonly onDecorations: (value: StudioVirtualDecorationState) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceCustomFurniturePicker");
  const [items, setItems] = useState<readonly StudioVirtualCustomFurniture[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const fileRef = useRef<HTMLInputElement>(null);
  const listRequest = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    listRequest.current?.abort();
    const request = new AbortController();
    listRequest.current = request;
    setListState("loading");
    try {
      const next = await listStudioVirtualCustomFurniture(request.signal);
      if (request.signal.aborted) return;
      setItems(next);
      setListState("ready");
    } catch {
      if (!request.signal.aborted) setListState("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => listRequest.current?.abort();
  }, [refresh]);

  const place = useCallback(
    (item: StudioVirtualCustomFurniture) => {
      // 월드 안에서는 안전 배치가 실패할 수 있고 reason 을 준다. 월드 밖에서는
      // 충돌 규칙이 없으므로 항상 그냥 추가된다.
      const result: StudioDecorationLayoutResult = world
        ? addStudioVirtualDecorationSafely(decorations, "custom", selfPoint, world)
        : { ok: true, state: addStudioVirtualDecoration(decorations, "custom", selfPoint) };
      if (!result.ok) {
        setNotice(PLACE_REASON[result.reason]);
        return;
      }
      const placement = {
        ...result.state.placements[result.state.placements.length - 1]!,
        assetId: item.id,
      };
      onDecorations({
        ...result.state,
        placements: [...result.state.placements.slice(0, -1), placement],
      });
      setNotice(bt(`${spaceKoParticle(item.name, "을")} 내 주변에 놓았어요.`, `Placed ${item.name} near you.`));
    },
    [bt, decorations, onDecorations, selfPoint, world],
  );

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      setNotice("");
      const result = await uploadStudioVirtualCustomFurniture(file);
      setBusy(false);
      if (!result.ok) {
        setNotice(result.error);
        return;
      }
      await refresh();
      setNotice(bt(`${spaceKoParticle(result.furniture.name, "을")} 올렸어요.`, `Uploaded ${result.furniture.name}.`));
    },
    [bt, refresh],
  );

  return (
    <fieldset>
      <legend>{bt("내 가구", "My furniture")}</legend>
      <p>
        {bt(
          "PNG 또는 WebP를 1MB 이하로 올리면 알파가 유지된 채 방에 놓을 수 있어요.",
          "Upload a PNG or WebP under 1MB to place it with its transparency intact.",
        )}
      </p>
      <label className="studio-vspace-customization-upload">
        <span>{busy ? bt("올리는 중…", "Uploading…") : bt("가구 이미지 올리기", "Upload furniture image")}</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // 같은 파일을 다시 고를 수 있게 값을 비운다.
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
      </label>
      {items.length > 0 ? (
        <ul className="studio-vspace-customization-own-furniture">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={decorations.placements.length >= 36}
                onClick={() => place(item)}
              >
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      ) : listState === "ready" ? (
        <p>{bt("아직 올린 가구가 없어요.", "You have not uploaded any furniture yet.")}</p>
      ) : null}
      {listState === "loading" ? <p role="status">{bt("가구 목록을 불러오는 중…", "Loading your furniture…")}</p> : null}
      {listState === "error" ? <div>
        <p role="status">{bt("가구 목록을 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.", "Could not load your furniture. Check your connection and try again.")}</p>
        <button type="button" onClick={() => void refresh()}>{bt("목록 다시 불러오기", "Reload furniture")}</button>
      </div> : null}
      {notice ? <p role="status">{notice}</p> : null}
    </fieldset>
  );
}
