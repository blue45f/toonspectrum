import Link from "@/compat/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioReviewEditorRequest } from "./studio-review-editor-handoff";
import { studioReviewEditorHref } from "./studio-review-editor-route";

/** Navigation is explicit; arrival never starts a selection or changes manuscript content. */
export function StudioReviewEditorLink({ request }: { readonly request: StudioReviewEditorRequest }) {
  const bt = useBilingual("StudioReviewEditorLink");
  return <Link href={studioReviewEditorHref(request)} className={buttonClass({ variant: "outline", size: "sm" })}>
    {bt("편집기에서 의견 위치 확인", "Locate comment in editor")}
  </Link>;
}
