import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Code2,
  Eye,
  EyeOff,
  ImagePlus,
  LockKeyhole,
  LogIn,
  Mail,
  Sparkles,
  Trash2,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";

import { ToonStudioMark } from "@/shared/components/toonstudio-mark";

import {
  parseAuthProviderDiscovery,
  parseAuthEmailAvailability,
  type AuthProviderDiscovery,
} from "./auth-provider-discovery";
import { resolveAuthEmailActionResult } from "./auth-email-action-result";
import { GoogleIdentityButton } from "./google-identity-button";
import { GuestEntryButton } from "./guest-entry-button";

import {
  AVATAR_PRESETS,
  MAX_AVATAR_IMAGE_BYTES,
  pickAvatarPreset,
  resolveSignupAvatar,
  resolveSignupAvatarImage,
} from "@toonstudio/contracts/avatar";
import { withCsrfProtection } from "@/shared/lib/csrf";
import { cn } from "@/shared/lib/utils";
import { signIn } from "@/domains/auth/public/session/auth-session-store";
import { apiFetch, apiPath } from "@/platform/api";

// 실제 OAuth 미설정 시 데모 폴백임을 버튼에 명확히 표시(정직성).
function DemoTag({ dark }: { dark?: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide",
        dark
          ? "bg-[oklch(0.2_0.02_60/0.16)] text-on-accent"
          : "border border-line bg-raised text-fg-3"
      )}
    >
      {translateCurrentStaticSourceText(
        "domains.auth.components.auth.modal",
        "ko",
        "데모"
      )}
    </span>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const authSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "이메일을 입력해 주세요.")
    .email("이메일 형식을 확인해 주세요."),
  password: z
    .string()
    .min(1, "비밀번호를 입력해 주세요.")
    .max(128, "비밀번호가 너무 깁니다."),
  name: z.string(),
  avatar: z.string(),
  image: z.string().nullable(),
});

type AuthFormValues = z.infer<typeof authSchema>;

export interface AuthFormProps {
  initialMode?: "login" | "signup";
  /**
   * dialog: 모달 셸(AuthModal) 안에서 렌더. page: 인증 페이지 본문에 직접 렌더.
   * 폼 본체만 그리고, 오버레이·포커스 트랩·스크롤 잠금 같은 셸 책임은 dialog에서 셸이 맡는다.
   */
  variant?: "dialog" | "page";
  /** 자격 증명·Google 로그인이 끝났을 때. dialog에서는 모달 닫기, page에서는 원래 목적지로 이동한다. */
  onSignedIn?: () => void;
  /** 닫기 버튼이 필요할 때만 제공한다(dialog). page에서는 닫을 대상이 없어 버튼을 그리지 않는다. */
  onDismiss?: () => void;
  /** 게스트 세션을 시작하면 이어서 이동할 곳. 기본값은 기존 모달 동작과 같은 "/home". */
  guestNext?: string;
  /** 다이얼로그 aria 연결용 제목 id. dialog에서는 셸이 발급해 넘긴다. */
  titleId?: string;
  /** 다이얼로그 aria 연결용 설명 id. dialog에서는 셸이 발급해 넘긴다. */
  descriptionId?: string;
}

export function AuthForm({
  initialMode = "login",
  variant = "dialog",
  onSignedIn,
  onDismiss,
  guestNext = "/home",
  titleId: titleIdProp,
  descriptionId: descriptionIdProp,
}: AuthFormProps) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [providers, setProviders] = useState<AuthProviderDiscovery>({});
  const [providerStatus, setProviderStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [providerAttempt, setProviderAttempt] = useState(0);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [emailAction, setEmailAction] = useState<"reset" | "resend" | null>(
    null
  );
  const [imageErr, setImageErr] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const ownTitleId = useId();
  const ownDescriptionId = useId();
  const titleId = titleIdProp ?? ownTitleId;
  const descriptionId = descriptionIdProp ?? ownDescriptionId;
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const emailRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: "",
      password: "",
      name: "",
      avatar: AVATAR_PRESETS[1].id,
      image: null,
    },
  });

  const [nameValue, emailValue, avatarValue, imageValue] = watch([
    "name",
    "email",
    "avatar",
    "image",
  ]);
  const selectedPreset =
    AVATAR_PRESETS.find(
      (preset) => preset.id === avatarValue || preset.color === avatarValue
    ) ?? AVATAR_PRESETS[0];
  const selectedAvatarColor = resolveSignupAvatar(avatarValue);
  const avatarInitial = (nameValue.trim() || emailValue.trim() || "W")
    .slice(0, 1)
    .toUpperCase();
  const avatarBackground = `radial-gradient(circle at 32% 24%, ${selectedPreset.accent}, transparent 35%), linear-gradient(145deg, ${selectedAvatarColor}, oklch(0.26 0.04 60))`;

  // RHF의 register ref 와 포커스용 emailRef 를 함께 연결
  const emailField = register("email");

  useEffect(() => {
    setMode(initialMode);
    setPasswordVisible(false);
  }, [initialMode]);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let recoveryAvailable = false;
    const fail = () => {
      setProviders({});
      setProviderStatus("error");
      recoveryAvailable = true;
    };
    const retryAfterReturn = () => {
      if (
        disposed ||
        !recoveryAvailable ||
        document.visibilityState === "hidden"
      )
        return;
      // A focus + visibility + online burst must create only one new request.
      recoveryAvailable = false;
      setProviderAttempt((value) => value + 1);
    };
    // Bound both the response and JSON body read. Some transports can settle
    // even after abort, so every continuation also checks the request lifetime.
    const timeout = globalThis.setTimeout(() => {
      if (disposed || controller.signal.aborted) return;
      fail();
      controller.abort();
    }, 15_000);
    setProviders({});
    setProviderStatus("loading");
    apiFetch(apiPath("/auth/providers"), {
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`provider discovery failed (${response.status})`);
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        if (disposed || controller.signal.aborted) return;
        setProviders(parseAuthProviderDiscovery(payload));
        setEmailAvailable(parseAuthEmailAvailability(payload));
        setProviderStatus("ready");
      })
      .catch(() => {
        if (disposed || controller.signal.aborted) return;
        fail();
      })
      .finally(() => globalThis.clearTimeout(timeout));
    globalThis.addEventListener("online", retryAfterReturn);
    globalThis.addEventListener("focus", retryAfterReturn);
    document.addEventListener("visibilitychange", retryAfterReturn);
    return () => {
      disposed = true;
      globalThis.clearTimeout(timeout);
      controller.abort();
      globalThis.removeEventListener("online", retryAfterReturn);
      globalThis.removeEventListener("focus", retryAfterReturn);
      document.removeEventListener("visibilitychange", retryAfterReturn);
    };
  }, [providerAttempt]);

  // 페이지형에서만 마운트 직후 이메일 입력에 먼저 포커스를 둔다.
  // 다이얼로그형의 초기 포커스는 셸(AuthModal)이 트랩 설치 전에 트리거를 캡처해야 해서 셸이 맡는다.
  // Escape 닫기·스크롤 잠금·탭 순환 트랩·닫힘 시 포커스 복원도 다이얼로그 셸의 책임이다.
  useEffect(() => {
    if (variant === "page") emailRef.current?.focus();
  }, [variant]);

  const submit = handleSubmit(
    async ({ email, password, name, avatar, image }) => {
      setErr("");
      setNotice("");
      try {
        if (mode === "signup") {
          if (emailAvailable === false) return;
          if (Array.from(password).length < 15) {
            setErr("비밀번호는 15자 이상이어야 해요.");
            return;
          }
          const response = await apiFetch(
            apiPath("/auth/signup"),
            withCsrfProtection({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, password, name, avatar, image }),
            })
          );
          const payload: unknown = await response.json().catch(() => null);
          const result = resolveAuthEmailActionResult(response.status, payload, "signup");
          if (!result.ok) {
            setErr(result.message);
            return;
          }
          setMode("login");
          setValue("password", "");
          setNotice(result.message);
          return;
        }
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });
        if (result?.error) {
          setErr(
            result.error === "auth-failed"
              ? "이메일 또는 비밀번호를 확인해 주세요."
              : result.error
          );
          return;
        }
        onSignedIn?.();
      } catch {
        setErr("문제가 발생했어요. 다시 시도해 주세요.");
      }
    }
  );

  const requestEmailAction = async (action: "reset" | "resend") => {
    if (emailAvailable === false) return;
    const email = emailValue.trim();
    setErr("");
    setNotice("");
    if (!email) {
      setErr("이메일을 먼저 입력해 주세요.");
      emailRef.current?.focus();
      return;
    }
    setEmailAction(action);
    try {
      const endpoint =
        action === "reset"
          ? "/auth/password/reset/request"
          : "/auth/email/verification/resend";
      const response = await apiFetch(
        apiPath(endpoint),
        withCsrfProtection({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        })
      );
      const payload: unknown = await response.json().catch(() => null);
      const result = resolveAuthEmailActionResult(response.status, payload, "email");
      if (!result.ok) {
        setErr(result.message);
        return;
      }
      setNotice(result.message);
    } catch {
      setErr("메일 요청 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setEmailAction(null);
    }
  };

  const avatarImage = resolveSignupAvatarImage(imageValue);

  const onAvatarImageChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    setImageErr("");
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setImageErr("PNG, JPG, WebP 이미지만 업로드할 수 있어요.");
      return;
    }

    if (file.size > MAX_AVATAR_IMAGE_BYTES) {
      setImageErr("이미지는 180KB 이하로 올려 주세요.");
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    const safeImage = resolveSignupAvatarImage(dataUrl);
    if (!safeImage) {
      setImageErr("이미지를 읽을 수 없어요. 다른 파일을 선택해 주세요.");
      return;
    }

    setValue("image", safeImage, { shouldDirty: true, shouldValidate: true });
  };

  const TitleTag = variant === "page" ? "h1" : "h2";

  return (
    <div data-auth-form="true" data-auth-mode={mode} className="relative">
      {onDismiss ? (
        <button
          type="button"
          aria-label={translateCurrentStaticSourceText(
            "domains.auth.components.auth.modal",
            "ko",
            "로그인 창 닫기"
          )}
          onClick={onDismiss}
          className="absolute right-3 top-3 z-10 flex size-11 items-center justify-center rounded-[0.9rem] border border-line/80 bg-panel/80 text-fg-3 shadow-sm backdrop-blur-xl transition-[border-color,background-color,color,transform] hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97]"
        >
          <X size={18} aria-hidden="true" />
        </button>
      ) : null}
      <div className={variant === "dialog" ? "p-5 sm:p-7" : undefined}>
        <div
          className={cn(
            "relative",
            variant === "dialog"
              ? "mb-5 overflow-hidden rounded-2xl border border-line/80 bg-[radial-gradient(circle_at_18%_0%,var(--color-accent-soft),transparent_58%),linear-gradient(145deg,var(--color-card),var(--color-panel))] p-4 pr-14 shadow-sm"
              : "mb-7"
          )}
        >
          {variant === "dialog" ? (
            <span
              aria-hidden="true"
              className="absolute -right-8 -top-8 size-28 rounded-full border border-accent/15 bg-accent/5"
            />
          ) : null}
            <div className="relative flex items-start gap-3">
              <ToonStudioMark className="size-11 rounded-xl" />
              <div className="min-w-0">
                <p className="font-display text-[0.66rem] font-bold uppercase tracking-[0.16em] text-accent">
                  {translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "툰스튜디오 계정"
                  )}
                </p>
                <TitleTag
                  id={titleId}
                  className={cn(
                    "mt-1 font-display font-bold tracking-[-0.025em] text-fg",
                    variant === "page" ? "text-[1.65rem] leading-snug" : "text-xl"
                  )}
                >
                  {mode === "login"
                    ? translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "다시 만나 반가워요"
                      )
                    : translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "새 창작 여정을 시작해요"
                      )}
                </TitleTag>
              </div>
            </div>
            <p
              id={descriptionId}
              className="relative mt-3 text-sm leading-relaxed text-fg-3"
            >
              {mode === "login"
                ? translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "작품, 서재와 스튜디오 작업을 어느 기기에서나 이어가세요."
                  )
                : translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "하나의 계정으로 감상 기록과 제작 프로젝트를 안전하게 연결하세요."
                  )}
            </p>
          </div>

          <div
            role="tablist"
            aria-label={translateCurrentStaticSourceText(
              "domains.auth.components.auth.modal",
              "ko",
              "로그인 방식"
            )}
            className="mb-5 grid grid-cols-2 rounded-xl border border-line bg-canvas/75 p-1"
          >
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setPasswordVisible(false);
                  setErr("");
                  setNotice("");
                }}
                className={cn(
                  "min-h-11 rounded-lg px-3 py-2 text-sm font-semibold outline-none transition-[background-color,color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  mode === m
                    ? "bg-panel text-fg shadow-sm ring-1 ring-inset ring-line"
                    : "text-fg-3 hover:bg-raised/60 hover:text-fg-2"
                )}
              >
                {m === "login"
                  ? translateCurrentStaticSourceText(
                      "domains.auth.components.auth.modal",
                      "ko",
                      "로그인"
                    )
                  : translateCurrentStaticSourceText(
                      "domains.auth.components.auth.modal",
                      "ko",
                      "회원가입"
                    )}
              </button>
            ))}
          </div>

          {emailAvailable === false ? <div role="status" className="mb-4 rounded-xl border border-warn/40 bg-panel p-3 text-sm leading-6 text-fg">
            <p>{translateCurrentStaticSourceText("domains.auth.components.auth.modal", "ko", "이메일 신규 가입·인증 메일 발송이 아직 준비되지 않았습니다. 기존 계정 로그인은 아래에서, 소셜 로그인은 설정된 제공자에서 시도할 수 있습니다.")}</p>
            <button type="button" disabled={providerStatus === "loading"} onClick={() => setProviderAttempt((value) => value + 1)}
              className="mt-2 min-h-11 rounded-lg border border-line px-3 text-sm font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              {translateCurrentStaticSourceText("domains.auth.components.auth.modal", "ko", "이메일 서비스 다시 확인")}
            </button>
          </div> : null}
          <form className="flex flex-col gap-3.5" onSubmit={submit}>
            {mode === "signup" && (
              <>
                <label
                  htmlFor={nameId}
                  className="block text-xs font-semibold text-fg-2"
                >
                  {translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "닉네임"
                  )}
                  <span className="relative mt-1.5 block">
                    <UserRound
                      size={16}
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3"
                    />
                    <input
                      id={nameId}
                      {...register("name")}
                      autoComplete="nickname"
                      placeholder={translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "표시할 이름을 입력하세요"
                      )}
                      className="h-12 w-full rounded-xl border border-line bg-canvas pl-11 pr-3.5 text-sm font-normal text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-3 focus:border-accent/70 focus:ring-2 focus:ring-accent/15"
                    />
                  </span>
                </label>
                <details className="group overflow-hidden rounded-2xl border border-line bg-canvas/70 open:border-line-strong">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3 py-2 outline-none marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                    <span
                      aria-hidden="true"
                      className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-line text-sm font-bold text-fg"
                      style={{ background: avatarBackground }}
                    >
                      {avatarImage ? (
                        <img
                          src={avatarImage}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        avatarInitial
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-fg-2">
                        {translateCurrentStaticSourceText(
                          "domains.auth.components.auth.modal",
                          "ko",
                          "프로필 이미지 꾸미기"
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[0.68rem] text-fg-3">
                        {translateCurrentStaticSourceText(
                          "domains.auth.components.auth.modal",
                          "ko",
                          "선택 사항 · 색상 또는 이미지 업로드"
                        )}
                      </span>
                    </span>
                    <span className="text-[0.68rem] font-semibold text-accent group-open:hidden">
                      {translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "열기"
                      )}
                    </span>
                    <span className="hidden text-[0.68rem] font-semibold text-accent group-open:inline">
                      {translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "접기"
                      )}
                    </span>
                  </summary>
                  <div className="border-t border-line p-3">
                    <Controller
                      control={control}
                      name="avatar"
                      render={({ field }) => (
                        <div className="rounded-xl bg-canvas p-1">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold text-fg-2">
                              {translateCurrentStaticSourceText(
                                "domains.auth.components.auth.modal",
                                "ko",
                                "아바타"
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const preset = pickAvatarPreset(
                                  nameValue,
                                  emailValue
                                );
                                field.onChange(preset.id);
                              }}
                              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-raised px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                              <Sparkles size={13} />
                              {translateCurrentStaticSourceText(
                                "domains.auth.components.auth.modal",
                                "ko",
                                "추천"
                              )}
                            </button>
                          </div>
                          <div className="mb-3 flex items-center gap-3">
                            <div
                              aria-hidden="true"
                              className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[oklch(0.95_0.01_85/0.16)] text-xl font-bold text-fg shadow-[0_1px_0_oklch(0.95_0.01_85/0.12)_inset]"
                              style={{ background: avatarBackground }}
                            >
                              {avatarImage ? (
                                <img
                                  src={avatarImage}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                avatarInitial
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-fg">
                                {selectedPreset.name}
                              </p>
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-3">
                                {selectedPreset.tone}
                              </p>
                            </div>
                          </div>
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <input
                              ref={imageInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="sr-only"
                              onChange={onAvatarImageChange}
                            />
                            <button
                              type="button"
                              onClick={() => imageInputRef.current?.click()}
                              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                              <ImagePlus size={13} />
                              {translateCurrentStaticSourceText(
                                "domains.auth.components.auth.modal",
                                "ko",
                                "이미지 업로드"
                              )}
                            </button>
                            {avatarImage && (
                              <button
                                type="button"
                                onClick={() => {
                                  setValue("image", null, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  });
                                  setImageErr("");
                                }}
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-3 transition-colors hover:border-bad/60 hover:text-bad focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                              >
                                <Trash2 size={13} />
                                {translateCurrentStaticSourceText(
                                  "domains.auth.components.auth.modal",
                                  "ko",
                                  "제거"
                                )}
                              </button>
                            )}
                            <span className="text-[0.68rem] text-fg-3">
                              {translateCurrentStaticSourceText(
                                "domains.auth.components.auth.modal",
                                "ko",
                                "PNG/JPG/WebP · 180KB 이하"
                              )}
                            </span>
                          </div>
                          {imageErr && (
                            <p className="mb-3 text-xs text-bad" role="alert">
                              {imageErr}
                            </p>
                          )}
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {AVATAR_PRESETS.map((preset) => {
                              const active =
                                field.value === preset.id ||
                                field.value === preset.color;
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => field.onChange(preset.id)}
                                  aria-label={formatI18nTemplate(
                                    translateCurrentStaticSourceText(
                                      "domains.auth.components.auth.modal",
                                      "ko",
                                      "{v0} 아바타 선택"
                                    ),
                                    { v0: String(preset.name) }
                                  )}
                                  aria-pressed={active}
                                  className={cn(
                                    "flex min-h-14 items-center gap-2 rounded-xl border bg-panel p-2 text-left transition-[border-color,background,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                                    active
                                      ? "border-accent bg-accent-soft text-fg"
                                      : "border-line text-fg-2 hover:border-line-strong hover:bg-raised"
                                  )}
                                >
                                  <span
                                    className="size-7 shrink-0 rounded-lg border border-[oklch(0.95_0.01_85/0.14)]"
                                    style={{
                                      background: `radial-gradient(circle at 32% 24%, ${preset.accent}, transparent 35%), linear-gradient(145deg, ${preset.color}, oklch(0.26 0.04 60))`,
                                    }}
                                  />
                                  <span className="min-w-0">
                                    <span className="block truncate text-xs font-semibold">
                                      {preset.name}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[0.68rem] text-fg-3">
                                      {preset.tone}
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    />
                  </div>
                </details>
              </>
            )}
            <label
              htmlFor={emailId}
              className="block text-xs font-semibold text-fg-2"
            >
              {translateCurrentStaticSourceText(
                "domains.auth.components.auth.modal",
                "ko",
                "이메일"
              )}
              <span className="relative mt-1.5 block">
                <Mail
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3"
                />
                <input
                  id={emailId}
                  {...emailField}
                  ref={(el) => {
                    emailField.ref(el);
                    emailRef.current = el;
                  }}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "name@example.com"
                  )}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={
                    errors.email ? "auth-email-error" : undefined
                  }
                  className="h-12 w-full rounded-xl border border-line bg-canvas pl-11 pr-3.5 text-sm font-normal text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-3 focus:border-accent/70 focus:ring-2 focus:ring-accent/15"
                />
              </span>
            </label>
            {errors.email?.message && (
              <p
                id="auth-email-error"
                className="text-xs text-bad"
                role="alert"
              >
                {errors.email.message}
              </p>
            )}
            <div>
              <label
                htmlFor={passwordId}
                className="flex items-center justify-between gap-3 text-xs font-semibold text-fg-2"
              >
                <span>
                  {translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "비밀번호"
                  )}
                </span>
                {mode === "signup" ? (
                  <span
                    id="auth-password-help"
                    className="font-medium text-fg-3"
                  >
                    {translateCurrentStaticSourceText(
                      "domains.auth.components.auth.modal",
                      "ko",
                      "15자 이상"
                    )}
                  </span>
                ) : null}
              </label>
              <div className="relative mt-1.5">
                <LockKeyhole
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3"
                />
                <input
                  id={passwordId}
                  {...register("password")}
                  type={passwordVisible ? "text" : "password"}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  placeholder={
                    mode === "signup"
                      ? translateCurrentStaticSourceText(
                          "domains.auth.components.auth.modal",
                          "ko",
                          "안전한 비밀번호를 입력하세요"
                        )
                      : translateCurrentStaticSourceText(
                          "domains.auth.components.auth.modal",
                          "ko",
                          "비밀번호를 입력하세요"
                        )
                  }
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password
                      ? "auth-password-error"
                      : mode === "signup"
                      ? "auth-password-help"
                      : undefined
                  }
                  className="h-12 w-full rounded-xl border border-line bg-canvas pl-11 pr-14 text-sm text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-3 focus:border-accent/70 focus:ring-2 focus:ring-accent/15"
                />
                <button
                  type="button"
                  aria-label={
                    passwordVisible
                      ? translateCurrentStaticSourceText(
                          "domains.auth.components.auth.modal",
                          "ko",
                          "비밀번호 숨기기"
                        )
                      : translateCurrentStaticSourceText(
                          "domains.auth.components.auth.modal",
                          "ko",
                          "비밀번호 표시"
                        )
                  }
                  aria-pressed={passwordVisible}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-xl text-fg-3 outline-none transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                >
                  {passwordVisible ? (
                    <EyeOff size={17} aria-hidden="true" />
                  ) : (
                    <Eye size={17} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
            {errors.password?.message && (
              <p
                id="auth-password-error"
                className="text-xs text-bad"
                role="alert"
              >
                {errors.password.message}
              </p>
            )}
            {mode === "login" && (
              <div className="grid grid-cols-1 gap-1 rounded-xl border border-line/70 bg-canvas/45 p-1 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={emailAction !== null || emailAvailable === false}
                  onClick={() => {
                    void requestEmailAction("resend");
                  }}
                  className="min-h-11 rounded-lg px-3 text-xs font-semibold text-fg-3 outline-none transition-colors hover:bg-raised hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50"
                >
                  {emailAction === "resend"
                    ? translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "전송 중…"
                      )
                    : translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "인증 메일 다시 보내기"
                      )}
                </button>
                <button
                  type="button"
                  disabled={emailAction !== null || emailAvailable === false}
                  onClick={() => {
                    void requestEmailAction("reset");
                  }}
                  className="min-h-11 rounded-lg px-3 text-xs font-semibold text-fg-3 outline-none transition-colors hover:bg-raised hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50"
                >
                  {emailAction === "reset"
                    ? translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "전송 중…"
                      )
                    : translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "비밀번호를 잊으셨나요?"
                      )}
                </button>
              </div>
            )}
            {notice && (
              <p
                className="rounded-xl border border-good/35 bg-good/5 px-3.5 py-3 text-xs leading-relaxed text-good"
                role="status"
                aria-live="polite"
              >
                {notice}
              </p>
            )}
            {err && (
              <p
                className="rounded-xl border border-bad/35 bg-bad/5 px-3.5 py-3 text-xs leading-relaxed text-bad"
                role="alert"
              >
                {err}
              </p>
            )}
            <button
              type="submit"
              disabled={isSubmitting || (mode === "signup" && emailAvailable === false)}
              className="group mt-0.5 flex h-12 items-center justify-center gap-2 rounded-xl border border-accent bg-accent text-sm font-bold text-on-accent shadow-lg shadow-accent/15 outline-none transition-[background-color,box-shadow,transform] hover:bg-accent-2 hover:shadow-accent/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
            >
              {mode === "login" ? (
                <LogIn
                  size={17}
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5"
                />
              ) : (
                <UserPlus
                  size={17}
                  aria-hidden="true"
                  className="transition-transform group-hover:scale-105"
                />
              )}
              {isSubmitting
                ? translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "처리 중…"
                  )
                : mode === "login"
                ? translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "로그인"
                  )
                : translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "가입하고 시작"
                  )}
            </button>
          </form>

          {(providerStatus !== "ready" ||
            providers.kakao ||
            providers.google ||
            providers.naver ||
            providers.apple ||
            providers.github) && (
            <>
              <div className="my-4 flex items-center gap-3 text-[0.7rem] text-fg-3">
                <span className="h-px flex-1 bg-line" />
                {translateCurrentStaticSourceText(
                  "domains.auth.components.auth.modal",
                  "ko",
                  "또는"
                )}
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className="flex flex-col gap-2">
                {providerStatus === "loading" && (
                  <div
                    className="flex h-12 animate-pulse items-center justify-center rounded-xl border border-line bg-card text-xs font-medium text-fg-3"
                    role="status"
                  >
                    {translateCurrentStaticSourceText(
                      "domains.auth.components.auth.modal",
                      "ko",
                      "소셜 로그인 확인 중…"
                    )}
                  </div>
                )}
                {providerStatus === "error" && (
                  <div className="rounded-xl border border-line bg-card p-3 text-center">
                    <p
                      className="text-xs leading-relaxed text-fg-3"
                      role="status"
                    >
                      {translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "로그인 서비스를 확인하지 못했어요. 일시적인 연결 문제나 서비스 점검 중일 수 있어요. 잠시 후 다시 확인해 주세요."
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => setProviderAttempt((value) => value + 1)}
                      className="mt-3 min-h-11 rounded-xl border border-line bg-panel px-4 text-xs font-semibold text-fg-2 outline-none transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "다시 확인"
                      )}
                    </button>
                  </div>
                )}
                {providers.kakao && (
                  <button
                    type="button"
                    onClick={() => signIn("kakao")}
                    className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-[#FEE500] bg-[#FEE500] text-sm font-bold text-[#191600] shadow-sm outline-none transition-[opacity,transform] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99]"
                  >
                    {translateCurrentStaticSourceText(
                      "domains.auth.components.auth.modal",
                      "ko",
                      "카카오로 계속하기"
                    )}
                    {providers.kakao.mode === "demo" && <DemoTag dark />}
                  </button>
                )}
                {providers.google &&
                  (providers.google.mode === "oauth" &&
                  providers.google.clientId ? (
                    // 실연동 Google: GIS 공식 버튼(ID 토큰 흐름) — 리다이렉트 없이 모달에서 로그인.
                    <GoogleIdentityButton
                      clientId={providers.google.clientId}
                      onSuccess={() => onSignedIn?.()}
                      onRedirectFallback={
                        providers.google.redirectAvailable
                          ? () => {
                              void signIn("google");
                            }
                          : undefined
                      }
                    />
                  ) : (
                    <div
                      className="rounded-xl border border-line bg-card px-3.5 py-3"
                      role="status"
                      aria-label={translateCurrentStaticSourceText(
                        "domains.auth.components.auth.modal",
                        "ko",
                        "Google 로그인 설정 필요"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-fg-2">
                          {translateCurrentStaticSourceText(
                            "domains.auth.components.auth.modal",
                            "ko",
                            "Google로 계속하기"
                          )}
                        </span>
                        <span className="rounded-md border border-line bg-raised px-1.5 py-0.5 text-[0.62rem] font-bold text-fg-3">
                          {translateCurrentStaticSourceText(
                            "domains.auth.components.auth.modal",
                            "ko",
                            "설정 필요"
                          )}
                        </span>
                      </div>
                      <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                        {translateCurrentStaticSourceText(
                          "domains.auth.components.auth.modal",
                          "ko",
                          "Google 로그인 설정이 아직 완료되지 않았어요. 지금은 이메일 로그인을 이용해 주세요."
                        )}
                      </p>
                    </div>
                  ))}
                {providers.naver && (
                  <button
                    type="button"
                    onClick={() => signIn("naver")}
                    className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-[#03C75A] bg-[#03C75A] text-sm font-bold text-white shadow-sm outline-none transition-[opacity,transform] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99]"
                  >
                    {translateCurrentStaticSourceText(
                      "domains.auth.components.auth.modal",
                      "ko",
                      "네이버로 계속하기"
                    )}
                    {providers.naver.mode === "demo" && <DemoTag dark />}
                  </button>
                )}
                {providers.apple && (
                  <button
                    type="button"
                    onClick={() => signIn("apple")}
                    className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-black text-sm font-bold text-white shadow-sm outline-none transition-[opacity,transform] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99]"
                  >
                    <span className="text-lg leading-none" aria-hidden="true">
                      
                    </span>
                    Apple로 계속하기
                  </button>
                )}
                {providers.github && (
                  <button
                    type="button"
                    onClick={() => signIn("github")}
                    className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-[oklch(0.22_0.015_70)] text-sm font-bold text-white shadow-sm outline-none transition-[opacity,transform] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99]"
                  >
                    <Code2 size={17} aria-hidden="true" />
                    {translateCurrentStaticSourceText(
                      "domains.auth.components.auth.modal",
                      "ko",
                      "GitHub로 계속하기"
                    )}
                  </button>
                )}
              </div>
              {(providers.kakao?.mode === "demo" ||
                providers.naver?.mode === "demo") && (
                <p className="mt-2 text-center text-[0.66rem] text-fg-3">
                  {translateCurrentStaticSourceText(
                    "domains.auth.components.auth.modal",
                    "ko",
                    "데모 표시는 실제 소셜 연동이 아직 설정되지 않아 체험용 계정으로 로그인됨을 뜻해요."
                  )}
                </p>
              )}
            </>
          )}
          <div className="mt-5 grid gap-2">
            <div className="flex items-center gap-3 text-[0.7rem] text-fg-3">
              <span className="h-px flex-1 bg-line" />
              {translateCurrentStaticSourceText(
                "domains.auth.components.auth.modal",
                "ko",
                "또는 둘러보기",
              )}
              <span className="h-px flex-1 bg-line" />
            </div>
            <GuestEntryButton next={guestNext} onDone={onSignedIn} />
          </div>
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-line/70 bg-canvas/45 px-3.5 py-3 text-[0.7rem] leading-relaxed text-fg-3">
            <LockKeyhole
              size={15}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-accent"
            />
            <p>
              {translateCurrentStaticSourceText(
                "domains.auth.components.auth.modal",
                "ko",
                "로그인하면 작품·서재·스튜디오 작업이 계정에 안전하게 연결됩니다. 공용 기기에서는 작업 후 로그아웃해 주세요."
              )}
            </p>
          </div>
      </div>
    </div>
  );
}
