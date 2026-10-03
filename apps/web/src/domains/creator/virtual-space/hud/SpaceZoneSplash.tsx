import { useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  STUDIO_ZONE_SPLASH_MS,
  studioZoneSplashEligible,
} from "../studio-virtual-space-zone-transition";

export interface SpaceZoneSplashInput {
  readonly roomId: string | null;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo?: string;
  readonly descriptionEn?: string;
  readonly privateZone: boolean;
  readonly reason: "initial" | "enter";
  readonly worldReady: boolean;
}

interface ShownSplash {
  readonly key: string;
  readonly input: SpaceZoneSplashInput;
}

/**
 * 구역 진입 스플래시: 경계를 넘는 순간 구역 이름을 큰 카드로 보여 주고
 * 1.2초 뒤 사라진다. 예전의 구석 토스트("X에 들어왔어요")는 작아서
 * "지금 어디에 있는지"가 눈에 들어오지 않았고, 첫 진입(initial)은
 * 아예 억제돼 있어 입장 직후 위치 감각이 없었다. 둘 다 이 카드가 맡는다.
 * 구역이 빠르게 연속으로 바뀌면 마지막 구역으로 갈아 끼우고 시간을 다시 센다.
 */
export function SpaceZoneSplash({ input }: { readonly input: SpaceZoneSplashInput }) {
  const bt = useBilingual("SpaceZoneSplash");
  const [shown, setShown] = useState<ShownSplash | null>(null);

  useEffect(() => {
    if (!input.worldReady || !studioZoneSplashEligible(input)) return;
    const key = `${input.reason}:${input.roomId}`;
    setShown((previous) => (previous?.key === key ? previous : { key, input }));
  }, [input]);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), STUDIO_ZONE_SPLASH_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  const snapshot = shown.input;
  return (
    <div className="space-zone-splash" role="status">
      <span className="space-zone-splash__kicker">
        {snapshot.reason === "initial"
          ? bt("지금 이곳에 있어요", "You are here")
          : bt("구역 이동", "Now entering")}
      </span>
      <strong className="space-zone-splash__title">{bt(snapshot.labelKo, snapshot.labelEn)}</strong>
      {snapshot.descriptionKo || snapshot.descriptionEn ? (
        <span className="space-zone-splash__description">
          {bt(snapshot.descriptionKo ?? "", snapshot.descriptionEn ?? "")}
        </span>
      ) : null}
      {snapshot.privateZone ? (
        <span className="space-zone-splash__private">{bt("프라이빗 구역", "Private zone")}</span>
      ) : null}
    </div>
  );
}
