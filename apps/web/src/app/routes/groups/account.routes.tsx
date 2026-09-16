import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const MySpaceHubPage = lazyRetry(
  () => import("@/domains/account/MySpaceHubPage").then((module) => ({
    default: module.MySpaceHubPage,
  })),
  "MySpaceHubPage",
);
const AccountPage = lazyRetry(
  () => import("@/domains/account/AccountPage").then((module) => ({
    default: module.AccountPage,
  })),
  "AccountPage",
);
const UserProfilePage = lazyRetry(
  () => import("@/domains/account/UserProfilePage").then((module) => ({
    default: module.UserProfilePage,
  })),
  "UserProfilePage",
);
const SettingsPage = lazyRetry(
  () => import("@/domains/account/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
  "SettingsPage",
);
const AuthCallbackPage = lazyRetry(
  () => import("@/domains/account/AuthCallbackPage").then((module) => ({
    default: module.AuthCallbackPage,
  })),
  "AuthCallbackPage",
);
const VerifyEmailPage = lazyRetry(
  () => import("@/domains/account/VerifyEmailPage").then((module) => ({
    default: module.VerifyEmailPage,
  })),
  "VerifyEmailPage",
);
const ResetPasswordPage = lazyRetry(
  () => import("@/domains/account/ResetPasswordPage").then((module) => ({
    default: module.ResetPasswordPage,
  })),
  "ResetPasswordPage",
);

const AiSettingsPage = lazyRetry(() => import("@/domains/account/AiSettingsPage").then(module => ({ default: module.AiSettingsPage })), "AiSettingsPage");

const MessagesPage = lazyRetry(
  () => import("@/domains/messages/MessagesPage").then((module) => ({
    default: module.MessagesPage,
  })),
  "MessagesPage",
);
const MessageRequestPage = lazyRetry(
  () => import("@/domains/messages/MessageRequestPage").then((module) => ({
    default: module.MessageRequestPage,
  })),
  "MessageRequestPage",
);

export const accountRoutes = defineAppRoutes([
  { id: "account-ai-settings", path: "/settings/ai", element: <AiSettingsPage /> },
  { id: "account-my-space", path: "/my", element: <MySpaceHubPage /> },
  { id: "account-me", path: "/me", element: <AccountPage /> },
  { id: "account-profile", path: "/u/:userId", element: <UserProfilePage /> },
  { id: "account-messages-new", path: "/messages/new", element: <MessageRequestPage /> },
  { id: "account-messages-thread", path: "/messages/:threadId", element: <MessagesPage /> },
  { id: "account-messages", path: "/messages", element: <MessagesPage /> },
  { id: "account-settings", path: "/settings", element: <SettingsPage /> },
  {
    id: "account-auth-callback",
    path: "/auth/callback",
    element: <AuthCallbackPage />,
  },
  {
    id: "account-verify-email",
    path: "/auth/verify-email",
    element: <VerifyEmailPage />,
  },
  {
    id: "account-reset-password",
    path: "/auth/reset-password",
    element: <ResetPasswordPage />,
  },
]);
