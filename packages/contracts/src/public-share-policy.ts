const SHARE_DESCRIPTION_MAX_LENGTH = 200;

export function compactPublicShareDescription(
  value: string | null | undefined,
  fallback: string,
): string {
  const compact = (value ?? "").replace(/\s+/gu, " ").trim();
  return (compact || fallback.trim()).slice(0, SHARE_DESCRIPTION_MAX_LENGTH);
}

export function publicShareImageUrl(
  value: string | null | undefined,
): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  if (candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.includes("\\")) {
    return candidate;
  }
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function canShareCommunityPost(post: { readonly scope: string }): boolean {
  // Cafe posts can belong to private/member-only communities, and the post payload
  // does not carry enough visibility metadata to prove that the thread is public.
  return post.scope !== "cafe";
}

export function canShareCommunityCafe(cafe: {
  readonly visibility: string;
  readonly status: string;
}): boolean {
  return cafe.visibility === "public" && cafe.status === "active";
}

export function canShareCollaborationPost(post: {
  readonly hidden: boolean;
  readonly status: string;
  readonly expired: boolean;
}): boolean {
  return !post.hidden && post.status === "open" && !post.expired;
}

export function canSharePromotionPost(post: {
  readonly hidden: boolean;
  readonly archived: boolean;
}): boolean {
  return !post.hidden && !post.archived;
}

export function canShareCreatorWork(
  work: { readonly status: string },
  publication: { readonly visibility: string },
): boolean {
  // Unlisted publications are intentionally link-shareable, while private works and drafts are not.
  return work.status === "published" && publication.visibility !== "private";
}

export function canShareCreatorSeries(
  episodes: readonly { readonly status: string }[],
): boolean {
  return episodes.some((episode) => episode.status === "published");
}
