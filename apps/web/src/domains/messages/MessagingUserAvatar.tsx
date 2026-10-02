import { UserRound } from "lucide-react";

import type { MessagingThreadSummary } from "@/platform/messaging-client";
import { cn } from "@/shared/lib/utils";

export function UserAvatar({
  user,
  size = "md",
}: {
  user: MessagingThreadSummary["otherUser"];
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass = size === "lg" ? "size-12 text-base" : size === "sm" ? "size-8 text-xs" : "size-10 text-sm";
  if (user.image) {
    return (
      <img
        src={user.image}
        alt=""
        className={cn("shrink-0 rounded-full border border-line object-cover", sizeClass)}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-line bg-raised font-semibold text-fg-2",
        sizeClass
      )}
    >
      {user.avatar || user.name.charAt(0) || <UserRound size={16} />}
    </span>
  );
}
