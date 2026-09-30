import { useParams } from "react-router-dom";

import { NotFoundPage } from "@/shared/components/feedback/NotFoundPage";

import { AuthCallbackPage } from "./AuthCallbackPage";
import { AuthEntryPage } from "./AuthEntryPage";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { VerifyEmailPage } from "./VerifyEmailPage";

const AUTH_ACTION_PAGES = {
  callback: AuthCallbackPage,
  login: () => <AuthEntryPage mode="login" />,
  signup: () => <AuthEntryPage mode="signup" />,
  "reset-password": ResetPasswordPage,
  "verify-email": VerifyEmailPage,
} as const;

type AuthAction = keyof typeof AUTH_ACTION_PAGES;

function isAuthAction(action: string | undefined): action is AuthAction {
  return action !== undefined && Object.hasOwn(AUTH_ACTION_PAGES, action);
}

export function AuthActionPage() {
  const { action } = useParams<{ action: string }>();
  if (!isAuthAction(action)) return <NotFoundPage />;
  const Page = AUTH_ACTION_PAGES[action];
  return <Page />;
}

export default AuthActionPage;
