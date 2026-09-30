/**
 * Studio VRM poser notice slice — a single non-blocking notice banner shared by the
 * poser runtime slices. Replaces the blocking `alert()` calls that used to interrupt
 * pose library, share, and runtime flows.
 */
import {
  useCallback,
  useState,
} from "react";

import type { StudioVrmPoserHost } from "./StudioVrmPoserHost";

export type StudioVrmPoserNoticeVariant = "success" | "error" | "info";

export interface StudioVrmPoserNotice {
  readonly message: string;
  readonly variant: StudioVrmPoserNoticeVariant;
}

export type StudioVrmPoserNotify = (
  message: string,
  variant?: StudioVrmPoserNoticeVariant,
) => void;

export function useStudioVrmPoserNotice(h: StudioVrmPoserHost): void {
  const [notice, setNotice] = useState<StudioVrmPoserNotice | null>(null);

  const notify = useCallback<StudioVrmPoserNotify>((message, variant = "info") => {
    setNotice({ message, variant });
  }, []);

  const dismissNotice = useCallback(() => {
    setNotice(null);
  }, []);

  Object.assign(h, {
    notice,
    notify,
    dismissNotice,
  });
}
