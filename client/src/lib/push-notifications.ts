let swRegistration: ServiceWorkerRegistration | null = null;

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    console.warn("[Push] Service workers not supported");
    return null;
  }

  try {
    swRegistration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    console.log("[Push] Service worker registered, scope:", swRegistration.scope);

    swRegistration.addEventListener("updatefound", () => {
      console.log("[Push] New service worker version found, updating...");
    });

    return swRegistration;
  } catch (error) {
    console.error("[Push] Service worker registration failed:", error);
    return null;
  }
}

export function isNotificationSupported(): boolean {
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

export function getNotificationPermission(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  return await Notification.requestPermission();
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPush(role?: string, siteId?: string): Promise<boolean> {
  try {
    console.log("[Push] Starting subscription flow...");

    const permission = await requestNotificationPermission();
    console.log("[Push] Permission result:", permission);
    if (permission !== "granted") {
      console.warn("[Push] Notification permission not granted:", permission);
      return false;
    }

    let reg = swRegistration;
    if (!reg) {
      reg = await registerServiceWorker();
    }
    if (!reg) {
      console.error("[Push] No service worker registration available");
      return false;
    }

    await navigator.serviceWorker.ready;
    console.log("[Push] Service worker is ready");

    const vapidRes = await fetch("/api/push/vapid-public-key");
    if (!vapidRes.ok) {
      console.error("[Push] Failed to fetch VAPID key:", vapidRes.status);
      return false;
    }
    const { key } = await vapidRes.json();
    if (!key) {
      console.error("[Push] VAPID public key is empty - server may not have VAPID keys configured");
      return false;
    }
    console.log("[Push] Got VAPID public key:", key.substring(0, 20) + "...");

    const existingSub = await reg.pushManager.getSubscription();
    if (existingSub) {
      console.log("[Push] Found existing subscription, removing old one first...");
      try {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existingSub.endpoint }),
        });
      } catch (e) {
        console.warn("[Push] Failed to remove old subscription from server:", e);
      }
      await existingSub.unsubscribe();
    }

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    console.log("[Push] Browser push subscription created");

    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      console.error("[Push] Subscription is missing required fields");
      return false;
    }

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
        role: role || null,
        siteId: siteId || null,
      }),
    });

    if (!response.ok) {
      console.error("[Push] Server rejected subscription:", response.status);
      return false;
    }

    console.log("[Push] Subscription saved to server successfully");
    return true;
  } catch (error) {
    console.error("[Push] Subscription failed:", error);
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const reg = swRegistration || (await navigator.serviceWorker.ready);
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return true;

    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    await subscription.unsubscribe();
    console.log("[Push] Unsubscribed successfully");
    return true;
  } catch (error) {
    console.error("[Push] Unsubscribe failed:", error);
    return false;
  }
}

export async function isPushSubscribed(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}
