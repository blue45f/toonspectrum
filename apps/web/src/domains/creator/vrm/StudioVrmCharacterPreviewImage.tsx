import {
  type SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from "react";

export interface StudioVrmCharacterPreviewImageProps {
  readonly alt: string;
  readonly className?: string;
  readonly fallbackDelayMs?: number;
  readonly fallbackSrc: string;
  readonly src: string | null;
}

interface PendingPreview {
  readonly id: number;
  readonly src: string;
}

const DEFAULT_FALLBACK_DELAY_MS = 1_200;

function previewClassName(...values: Array<string | undefined>): string {
  return values
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

/**
 * Keeps the last decoded character frame visible until its replacement has
 * loaded and decoded. Brief null hydration windows therefore do not expose
 * the initials fallback, while real image failures still fail over safely.
 */
export function StudioVrmCharacterPreviewImage({
  alt,
  className,
  fallbackDelayMs = DEFAULT_FALLBACK_DELAY_MS,
  fallbackSrc,
  src,
}: StudioVrmCharacterPreviewImageProps) {
  const initialSrc = src ?? fallbackSrc;
  const [displayedSrc, setDisplayedSrc] = useState(initialSrc);
  const [isDisplayedReady, setIsDisplayedReady] = useState(false);
  const [pending, setPending] = useState<PendingPreview | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (src === displayedSrc) {
      requestIdRef.current += 1;
      setPending(null);
      return;
    }

    const id = requestIdRef.current + 1;
    requestIdRef.current = id;

    if (src !== null) {
      setPending({ id, src });
      return;
    }

    if (displayedSrc === fallbackSrc) {
      setPending(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      if (requestIdRef.current !== id) return;
      setPending({ id, src: fallbackSrc });
    }, Math.max(0, fallbackDelayMs));

    return () => window.clearTimeout(timeout);
  }, [displayedSrc, fallbackDelayMs, fallbackSrc, src]);

  const commitPending = async (
    event: SyntheticEvent<HTMLImageElement>,
    candidate: PendingPreview,
  ): Promise<void> => {
    const image = event.currentTarget;
    try {
      await image.decode?.();
    } catch {
      // A completed load already provides a usable frame. Some WebViews reject
      // decode() after load, which must not turn a valid thumbnail into a blank.
    }
    if (requestIdRef.current !== candidate.id) return;
    setDisplayedSrc(candidate.src);
    setIsDisplayedReady(true);
    setPending(null);
  };

  const handleDisplayedError = (): void => {
    if (displayedSrc === fallbackSrc) return;
    requestIdRef.current += 1;
    setDisplayedSrc(fallbackSrc);
    setIsDisplayedReady(false);
    setPending(null);
  };

  const handlePendingError = (candidate: PendingPreview): void => {
    if (requestIdRef.current !== candidate.id) return;
    if (candidate.src !== fallbackSrc) {
      const id = candidate.id + 1;
      requestIdRef.current = id;
      setPending({ id, src: fallbackSrc });
      return;
    }
    setPending(null);
  };

  return (
    <span
      className="relative block h-full w-full overflow-hidden"
      data-preview-ready={isDisplayedReady ? "true" : "false"}
    >
      <img
        alt={alt}
        className={previewClassName("h-full w-full", className)}
        data-testid="vrm-preview-visible"
        decoding="async"
        draggable={false}
        loading="eager"
        onError={handleDisplayedError}
        onLoad={() => setIsDisplayedReady(true)}
        src={displayedSrc}
      />
      {pending ? (
        <img
          alt=""
          aria-hidden="true"
          className={previewClassName(
            "pointer-events-none absolute inset-0 h-full w-full opacity-0",
            className,
          )}
          data-testid="vrm-preview-pending"
          decoding="async"
          draggable={false}
          loading="eager"
          onError={() => handlePendingError(pending)}
          onLoad={(event) => void commitPending(event, pending)}
          src={pending.src}
        />
      ) : null}
      {!isDisplayedReady ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-br from-white/4 via-white/8 to-transparent"
          data-testid="vrm-preview-skeleton"
        />
      ) : null}
    </span>
  );
}
