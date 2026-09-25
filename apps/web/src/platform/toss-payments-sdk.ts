const TOSS_SDK_URL = "https://js.tosspayments.com/v2/standard";

export interface TossWidgetControl {
  destroy?: () => void | Promise<void>;
}

export interface TossWidgets {
  setAmount(input: { currency: "KRW"; value: number }): Promise<void>;
  renderPaymentMethods(input: {
    selector: string;
    variantKey?: string;
  }): Promise<TossWidgetControl>;
  renderAgreement(input: {
    selector: string;
    variantKey?: string;
  }): Promise<TossWidgetControl>;
  requestPayment(input: {
    orderId: string;
    orderName: string;
    successUrl: string;
    failUrl: string;
  }): Promise<void>;
}

export interface TossPaymentsInstance {
  widgets(input: { customerKey: string }): TossWidgets;
}

export interface TossPaymentsFactory {
  (clientKey: string): TossPaymentsInstance;
  readonly ANONYMOUS: string;
}

declare global {
  interface Window {
    TossPayments?: TossPaymentsFactory;
  }
}

let sdkPromise: Promise<TossPaymentsFactory> | null = null;

export function loadTossPaymentsSdk(): Promise<TossPaymentsFactory> {
  if (window.TossPayments) return Promise.resolve(window.TossPayments);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="' + TOSS_SDK_URL + '"]',
    );
    const script = existing ?? document.createElement("script");
    const done = () => window.TossPayments
      ? resolve(window.TossPayments)
      : reject(new Error("toss_sdk_missing"));
    script.addEventListener("load", done, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("toss_sdk_load_failed")),
      { once: true },
    );
    if (!existing) {
      script.src = TOSS_SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return sdkPromise;
}
