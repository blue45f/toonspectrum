import {
  Activity,
  BadgeDollarSign,
  CreditCard,
  Flag,
  Gauge,
  HandCoins,
  History,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Receipt,
  ShieldCheck,
  Ticket,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import type { AdminRouteIconId } from "./admin-route-manifest";

const ADMIN_ROUTE_ICONS: Record<AdminRouteIconId, LucideIcon> = {
  activity: Activity,
  announcement: Megaphone,
  audit: History,
  community: MessagesSquare,
  funding: HandCoins,
  members: UsersRound,
  operations: Gauge,
  overview: LayoutDashboard,
  plans: CreditCard,
  promotions: Ticket,
  reports: Flag,
  revenue: BadgeDollarSign,
  security: ShieldCheck,
};

export function AdminRouteIcon({
  icon,
  className,
  size = 16,
}: {
  icon: AdminRouteIconId;
  className?: string;
  size?: number;
}) {
  const Icon = ADMIN_ROUTE_ICONS[icon] ?? Receipt;
  return <Icon aria-hidden className={className} size={size} />;
}
