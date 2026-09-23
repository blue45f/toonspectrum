import { resolveSignupAvatarImage } from "@/shared/lib/avatar";

export function safeAuthProfileImageSrc(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const dataImage = resolveSignupAvatarImage(value);
  if (dataImage) return dataImage;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}
