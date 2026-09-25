import { useEffect, useState } from "react";

import {
  checkBrowserCompatibility,
  type BrowserCompatibilityResult,
} from "../platform/browser/browser-check";
import { BrowserCompatModal } from "../app/errors/browser-compat/browser-compat-modal";

import { shouldPromptForBrowserCompatibility } from "./browser-compatibility-scope";
import {
  dismissBrowserCompatibility,
  hasDismissedBrowserCompatibility,
} from "./public-site-storage";

export function BrowserCompatibilityBridge({ pathname }: { readonly pathname: string }) {
  const [compatResult, setCompatResult] = useState<BrowserCompatibilityResult | null>(null);
  const [showCompatModal, setShowCompatModal] = useState(false);

  useEffect(() => {
    setCompatResult(checkBrowserCompatibility());
  }, []);

  useEffect(() => {
    if (!compatResult) return;
    const shouldOpen = shouldPromptForBrowserCompatibility(pathname, compatResult)
      && !hasDismissedBrowserCompatibility();
    setShowCompatModal(shouldOpen);
  }, [compatResult, pathname]);

  if (!compatResult) return null;

  return (
    <BrowserCompatModal
      isOpen={showCompatModal}
      onClose={() => {
        setShowCompatModal(false);
        dismissBrowserCompatibility();
      }}
      missingFeatures={compatResult.missingFeatures}
    />
  );
}
