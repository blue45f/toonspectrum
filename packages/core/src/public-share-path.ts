export type PublicShareRoute =
  | { readonly kind: "ranking"; readonly canonicalPath: "/ranking" }
  | { readonly kind: "play"; readonly canonicalPath: "/play" }
  | { readonly kind: "author"; readonly name: string; readonly canonicalPath: string }
  | { readonly kind: "profile"; readonly userId: string; readonly canonicalPath: string }
  | { readonly kind: "creator-work"; readonly id: string; readonly canonicalPath: string }
  | { readonly kind: "creator-series"; readonly id: string; readonly canonicalPath: string }
  | { readonly kind: "community-post"; readonly id: string; readonly canonicalPath: string }
  | { readonly kind: "community-cafe"; readonly slug: string; readonly canonicalPath: string }
  | { readonly kind: "pencafe"; readonly name: string; readonly canonicalPath: string }
  | { readonly kind: "collaboration"; readonly id: string; readonly canonicalPath: string }
  | { readonly kind: "promotion"; readonly id: string; readonly canonicalPath: string };

const MAX_PATH_LENGTH = 512;
const MAX_SEGMENT_LENGTH = 160;
const RESERVED_CREATE_SEGMENTS = new Set(["challenges", "promo", "series"]);
const RESERVED_COLLABORATION_SEGMENTS = new Set(["new", "moderation"]);
const RESERVED_PROMOTION_SEGMENTS = new Set(["new", "moderation"]);

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function decodeSegment(value: string): string | null {
  if (!value || value.length > MAX_SEGMENT_LENGTH * 3) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (
      !decoded
      || decoded.length > MAX_SEGMENT_LENGTH
      || decoded.includes("/")
      || decoded.includes("\\")
      || hasControlCharacter(decoded)
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function encoded(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Parse only public routes that intentionally expose a share entry point.
 * The returned canonical path normalizes legacy showcase aliases without
 * accepting query strings, fragments, repeated slashes, or nested IDs.
 */
export function parsePublicSharePath(pathname: string): PublicShareRoute | null {
  if (
    typeof pathname !== "string"
    || pathname.length === 0
    || pathname.length > MAX_PATH_LENGTH
    || !pathname.startsWith("/")
    || pathname.includes("?")
    || pathname.includes("#")
    || pathname.includes("\\")
    || pathname.includes("//")
    || hasControlCharacter(pathname)
  ) {
    return null;
  }

  if (pathname === "/ranking") return { kind: "ranking", canonicalPath: "/ranking" };
  if (pathname === "/play") return { kind: "play", canonicalPath: "/play" };

  const segments = pathname.split("/").slice(1);
  const values = segments.map(decodeSegment);
  if (values.some((value) => value === null)) return null;
  const decoded = values as string[];

  if (decoded.length === 2 && decoded[0] === "author") {
    return {
      kind: "author",
      name: decoded[1],
      canonicalPath: `/author/${encoded(decoded[1])}`,
    };
  }
  if (decoded.length === 2 && decoded[0] === "u") {
    return {
      kind: "profile",
      userId: decoded[1],
      canonicalPath: `/u/${encoded(decoded[1])}`,
    };
  }
  if (
    decoded.length === 2
    && decoded[0] === "create"
    && !RESERVED_CREATE_SEGMENTS.has(decoded[1])
  ) {
    return {
      kind: "creator-work",
      id: decoded[1],
      canonicalPath: `/create/${encoded(decoded[1])}`,
    };
  }
  if (decoded.length === 3 && decoded[0] === "create" && decoded[1] === "series") {
    return {
      kind: "creator-series",
      id: decoded[2],
      canonicalPath: `/create/series/${encoded(decoded[2])}`,
    };
  }
  if (decoded.length === 3 && decoded[0] === "showcase" && decoded[1] === "work") {
    return {
      kind: "creator-work",
      id: decoded[2],
      canonicalPath: `/create/${encoded(decoded[2])}`,
    };
  }
  if (decoded.length === 3 && decoded[0] === "showcase" && decoded[1] === "series") {
    return {
      kind: "creator-series",
      id: decoded[2],
      canonicalPath: `/create/series/${encoded(decoded[2])}`,
    };
  }
  if (decoded.length === 3 && decoded[0] === "community" && decoded[1] === "post") {
    return {
      kind: "community-post",
      id: decoded[2],
      canonicalPath: `/community/post/${encoded(decoded[2])}`,
    };
  }
  if (decoded.length === 3 && decoded[0] === "community" && decoded[1] === "cafes") {
    return {
      kind: "community-cafe",
      slug: decoded[2],
      canonicalPath: `/community/cafes/${encoded(decoded[2])}`,
    };
  }
  if (
    decoded.length === 3
    && decoded[0] === "community"
    && decoded[1] === "promote"
    && !RESERVED_PROMOTION_SEGMENTS.has(decoded[2])
  ) {
    return {
      kind: "promotion",
      id: decoded[2],
      canonicalPath: `/community/promote/${encoded(decoded[2])}`,
    };
  }
  if (decoded.length === 2 && decoded[0] === "pencafe") {
    return {
      kind: "pencafe",
      name: decoded[1],
      canonicalPath: `/pencafe/${encoded(decoded[1])}`,
    };
  }
  if (
    decoded.length === 2
    && decoded[0] === "collaborate"
    && !RESERVED_COLLABORATION_SEGMENTS.has(decoded[1])
  ) {
    return {
      kind: "collaboration",
      id: decoded[1],
      canonicalPath: `/collaborate/${encoded(decoded[1])}`,
    };
  }
  return null;
}
