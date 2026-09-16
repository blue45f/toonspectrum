import { useParams } from "react-router-dom";

import { NotFoundPage } from "@/components/NotFoundPage";

import { AuthCallbackPage } from "./AuthCallbackPage";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { VerifyEmailPage } from "./VerifyEmailPage";

const AUTH_ACTION_PAGES = {
  callback: AuthCallbackPage,
  "reset-password": ResetPasswordPage,
  "verify-email": VerifyEmailPage,
} as const;

export function AuthActionPage() {
  const { action } = useParams<{ action: string }>();
  const Page = action === undefined
    ? undefined
    : AUTH_ACTION_PAGES[action as keyof typeof AUTH_ACTION_PAGES];

  return Page ? <Page /> : <NotFoundPage />;
}

export default AuthActionPage;
