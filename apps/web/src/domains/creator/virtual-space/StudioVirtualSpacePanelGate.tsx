import { Suspense, useState, type ReactNode } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 기본적으로 열린 패널만 마운트하고, 저장 전 초안이 있는 패널만 최초 개방 후 보존한다. */
export function StudioVirtualSpacePanelGate({ active, children, preserveAfterOpen = false }: { readonly active: boolean; readonly children: ReactNode; readonly preserveAfterOpen?: boolean }) {
  const bt = useBilingual("StudioVirtualSpacePage");
  const [opened, setOpened] = useState(active);
  if (active && !opened) setOpened(true);
  return active || (preserveAfterOpen && opened) ? <div hidden={!active}><Suspense fallback={<p role="status">{bt("패널 불러오는 중…", "Loading panel…")}</p>}>{children}</Suspense></div> : null;
}
