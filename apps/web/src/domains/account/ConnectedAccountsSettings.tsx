import { CheckCircle2, Link2, Loader2, Unlink } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  parseAuthProviderDiscovery,
  type AuthProviderDiscovery,
} from "@/domains/auth/components/auth-provider-discovery";
import { GoogleIdentityButton } from "@/domains/auth/components/google-identity-button";
import { persistSession } from "@/compat/auth-session-store";
import { api, apiPath } from "@/infrastructure/api";

type ProviderId = "google" | "kakao" | "naver" | "github";

type LinkedAccounts = {
  password: boolean;
  emailVerified: boolean;
  providers: ProviderId[];
  loginMethodCount: number;
};
const PROVIDERS: ReadonlyArray<{
  id: ProviderId;
  label: string;
}> = [
  { id: "google", label: "Google" },
  { id: "kakao", label: "카카오" },
  { id: "naver", label: "네이버" },
  { id: "github", label: "GitHub" },
];

function responseError(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return fallback;
  }
  const error = (payload as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : fallback;
}

export function ConnectedAccountsSettings({ userId }: { userId: string | null }) {
  const [accounts, setAccounts] = useState<LinkedAccounts | null>(null);
  const [discovery, setDiscovery] = useState<AuthProviderDiscovery>({});
  const [loading, setLoading] = useState(Boolean(userId));
  const [busyProvider, setBusyProvider] = useState<ProviderId | null>(null);
  const [confirmProvider, setConfirmProvider] = useState<ProviderId | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!userId) {
      setAccounts(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [accountResponse, providerResponse] = await Promise.all([
        api.raw(apiPath("/auth/accounts"), {
          method: "GET",
          cache: "no-store",
          throwHttpErrors: false,
        }),
        api.raw(apiPath("/auth/providers"), {
          method: "GET",
          cache: "no-store",
          throwHttpErrors: false,
        }),
      ]);
      const accountPayload = await accountResponse.json<LinkedAccounts>().catch(() => null);
      const providerPayload = await providerResponse.json<unknown>().catch(() => null);
      if (!accountResponse.ok || !accountPayload) {
        throw new Error("연결된 로그인 수단을 불러오지 못했어요.");
      }
      setAccounts(accountPayload);
      setDiscovery(parseAuthProviderDiscovery(providerPayload));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "로그인 수단을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);
  const linkedProviders = useMemo(
    () => new Set(accounts?.providers ?? []),
    [accounts?.providers],
  );

  const submitGoogleCredential = useCallback(async (
    credential: string,
    options: { signal: AbortSignal },
  ) => {
    setBusyProvider("google");
    setError("");
    setMessage("");
    try {
      const response = await api.raw(apiPath("/auth/oauth/google/link"), {
        method: "POST",
        throwHttpErrors: false,
        json: { idToken: credential },
        signal: options.signal,
      });
      const payload = await response.json<unknown>().catch(() => null);
      if (!response.ok) {
        return {
          ok: false,
          error: responseError(payload, "Google 계정을 연결하지 못했어요."),
        };
      }
      await load();
      setMessage("Google 계정을 연결했어요.");
      return { ok: true, error: null };
    } catch (caught: unknown) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        return { ok: false, error: "Google 계정 연결이 취소되었어요." };
      }
      return { ok: false, error: "계정 연결 서버에 접속하지 못했어요." };
    } finally {
      setBusyProvider(null);
    }
  }, [load]);
  const startRedirectLink = (provider: Exclude<ProviderId, "google"> | "google") => {
    setError("");
    setMessage("");
    setBusyProvider(provider);
    globalThis.location.assign(apiPath(`/auth/oauth/${provider}/link/start`));
  };

  const unlinkProvider = async (provider: ProviderId) => {
    if (confirmProvider !== provider) {
      setConfirmProvider(provider);
      setError("");
      setMessage("한 번 더 누르면 연결을 해제해요.");
      return;
    }
    setBusyProvider(provider);
    setConfirmProvider(null);
    setError("");
    setMessage("");
    try {
      const response = await api.raw(apiPath(`/auth/accounts/${provider}`), {
        method: "DELETE",
        cache: "no-store",
        throwHttpErrors: false,
      });
      const payload = await response.json<{
        error?: unknown;
        reauthenticationRequired?: unknown;
      } | null>().catch(() => null);
      if (!response.ok) {
        setError(responseError(payload, "로그인 수단 연결을 해제하지 못했어요."));
        return;
      }
      if (payload?.reauthenticationRequired === true) {
        persistSession(null);
        globalThis.location.assign("/?auth=reauthentication-required");
        return;
      }
      await load();
      setMessage("로그인 수단 연결을 해제했어요.");
    } catch {
      setError("로그인 수단 연결 해제 서버에 접속하지 못했어요.");
    } finally {
      setBusyProvider(null);
    }
  };
  if (!userId) {
    return (
      <div className="rounded-xl border border-line bg-card/50 p-4 text-sm text-fg-2">
        로그인하면 연결된 로그인 수단을 관리할 수 있어요.
      </div>
    );
  }

  if (loading && !accounts) {
    return (
      <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-fg-3">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        로그인 수단 확인 중…
      </div>
    );
  }

  return (
    <div className="space-y-3 py-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Link2 size={16} aria-hidden />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-fg">연결된 로그인 수단</h3>
          <p className="mt-0.5 text-[0.78rem] leading-relaxed text-fg-2">
            같은 이메일만으로 계정을 합치지 않아요. 로그인한 상태에서 직접 연결해 주세요.
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-xs text-bad" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-good/30 bg-good/5 px-3 py-2 text-xs text-good" role="status">
          {message}
        </p>
      )}
      <div className="rounded-xl border border-line bg-card/50">
        <div className="flex items-center justify-between gap-3 border-b border-line/60 px-3 py-3">
          <div>
            <p className="text-sm font-medium text-fg">이메일과 비밀번호</p>
            <p className="mt-0.5 text-xs text-fg-3">
              {accounts?.emailVerified
                ? "확인된 이메일로 로그인할 수 있어요."
                : "이메일 확인이 필요해요."}
            </p>
          </div>
          {accounts?.password ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-good">
              <CheckCircle2 size={14} aria-hidden /> 연결됨
            </span>
          ) : (
            <span className="text-xs font-medium text-fg-3">미설정</span>
          )}
        </div>

        {PROVIDERS.map(({ id, label }) => {
          const linked = linkedProviders.has(id);
          const provider = discovery[id];
          const canRedirect = provider?.mode === "oauth"
            && provider.redirectAvailable;
          const canUseGoogleIdentity = id === "google"
            && provider?.mode === "oauth"
            && Boolean(provider.clientId);
          const canLink = canRedirect || canUseGoogleIdentity;
          const isBusy = busyProvider === id;
          const lastMethod = linked && (accounts?.loginMethodCount ?? 0) <= 1;

          return (
            <div
              key={id}
              className="flex flex-col gap-3 border-b border-line/60 px-3 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-fg">{label}</p>
                <p className="mt-0.5 text-xs text-fg-3">
                  {linked
                    ? "이 계정으로 로그인할 수 있어요."
                    : canLink
                      ? "직접 인증한 뒤 현재 회원 계정에 연결해요."
                      : "현재 계정 연결을 사용할 수 없어요."}
                </p>
              </div>
              <div className="sm:min-w-44 sm:text-right">
                {linked ? (
                  <button
                    type="button"
                    disabled={isBusy || lastMethod}
                    onClick={() => { void unlinkProvider(id); }}
                    title={lastMethod ? "마지막 로그인 수단은 해제할 수 없어요." : undefined}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-bad/50 hover:bg-bad/5 hover:text-bad disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {isBusy ? (
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                    ) : (
                      <Unlink size={14} aria-hidden />
                    )}
                    {confirmProvider === id ? "연결 해제 확인" : "연결 해제"}
                  </button>
                ) : canUseGoogleIdentity && provider?.clientId ? (
                  <div className="ml-auto w-full max-w-72">
                    <GoogleIdentityButton
                      clientId={provider.clientId}
                      submitCredential={submitGoogleCredential}
                      onSuccess={() => undefined}
                      onRedirectFallback={
                        canRedirect
                          ? () => startRedirectLink("google")
                          : undefined
                      }
                    />
                  </div>
                ) : canRedirect ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => startRedirectLink(id)}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {isBusy ? (
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                    ) : (
                      <Link2 size={14} aria-hidden />
                    )}
                    계정 연결
                  </button>
                ) : (
                  <span className="text-xs font-medium text-fg-3">설정 필요</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[0.72rem] leading-relaxed text-fg-3">
        연결 해제 시 보안을 위해 모든 기기에서 로그아웃돼요. 다른 로그인 수단이 하나 이상 있어야 해제할 수 있어요.
      </p>
    </div>
  );
}
