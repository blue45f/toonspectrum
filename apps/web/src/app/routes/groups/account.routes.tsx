import { createElement, type ComponentType } from "react";

import { defineAppRoutes, type AppRouteDefinition } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

type LazyPageModule = Record<string, ComponentType>;

function lazyPage(load: () => Promise<unknown>, name: string) {
  return lazyRetry(
    () => load().then((module) => ({
      default: (module as LazyPageModule)[name]!,
    })),
    name,
  );
}

function route(id: string, path: string, Page: ComponentType): AppRouteDefinition {
  return { id, path, element: createElement(Page) };
}

const MySpaceHubPage = lazyPage(
  () => import("@/domains/account/MySpaceHubPage"),
  "MySpaceHubPage",
);
const AccountPage = lazyPage(() => import("@/domains/account/AccountPage"), "AccountPage");
const UserProfilePage = lazyPage(
  () => import("@/domains/account/UserProfilePage"),
  "UserProfilePage",
);
const CreatorDirectoryPage = lazyPage(
  () => import("@/domains/account/CreatorDirectoryPage"),
  "CreatorDirectoryPage",
);
const SettingsPage = lazyPage(() => import("@/domains/account/SettingsPage"), "SettingsPage");
const AuthActionPage = lazyPage(
  () => import("@/domains/account/AuthActionPage"),
  "AuthActionPage",
);
const AiSettingsPage = lazyPage(
  () => import("@/domains/account/AiSettingsPage"),
  "AiSettingsPage",
);
const MembershipUsagePage = lazyPage(
  () => import("@/domains/account/MembershipUsagePage"),
  "MembershipUsagePage",
);
const MessagesPage = lazyPage(() => import("@/domains/messages/MessagesPage"), "MessagesPage");
const MessageRequestPage = lazyPage(
  () => import("@/domains/messages/MessageRequestPage"),
  "MessageRequestPage",
);

export const accountRoutes = defineAppRoutes([
  route("account-ai-settings", "/settings/ai", AiSettingsPage),
  route("account-membership-usage", "/membership/usage", MembershipUsagePage),
  route("account-my-space", "/my", MySpaceHubPage),
  route("account-me", "/me", AccountPage),
  route("account-creators", "/creators", CreatorDirectoryPage),
  route("account-profile", "/u/:userId", UserProfilePage),
  route("account-messages-new", "/messages/new", MessageRequestPage),
  route("account-messages-thread", "/messages/:threadId", MessagesPage),
  route("account-messages", "/messages", MessagesPage),
  route("account-settings", "/settings", SettingsPage),
  route("account-auth-action", "/auth/:action", AuthActionPage),
]);
