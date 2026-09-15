import {
  registerProductionPushSubscription,
  unregisterProductionPushSubscription,
} from "./production-api";

function applicationServerKey(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const normalized = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = globalThis.atob(normalized);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes.buffer;
}

export function productionPushSupported(): boolean {
  try {
    return globalThis.isSecureContext
      && "serviceWorker" in navigator
      && "PushManager" in globalThis
      && "Notification" in globalThis;
  } catch {
    return false;
  }
}

export async function subscribeProductionPush(
  projectId: string,
  vapidPublicKey: string,
): Promise<PushSubscription> {
  if (!productionPushSupported()) {
    throw new Error("이 브라우저는 Web Push를 지원하지 않습니다.");
  }
  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("알림 권한이 허용되지 않았습니다.");
  }
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(vapidPublicKey),
  });
  await registerProductionPushSubscription(projectId, subscription.toJSON());
  return subscription;
}

export async function unsubscribeProductionPush(
  projectId: string,
): Promise<void> {
  if (!productionPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  // A single browser PushSubscription can be mapped to multiple projects.
  // Remove only this project's server-side mapping; globally unsubscribing the
  // endpoint would silently disable notifications for every other project.
  await unregisterProductionPushSubscription(projectId, subscription.endpoint);
}
