import webpush from "web-push";
import { storage } from "./storage";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@dispatchpro.app";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  console.log("[Push] VAPID keys configured successfully");
} else {
  console.warn("[Push] VAPID keys not configured - push notifications disabled");
}

export function getVapidPublicKey(): string {
  return vapidPublicKey;
}

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export async function sendPushToSubscription(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: NotificationPayload
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload)
    );
    console.log(`[Push] Sent successfully to ${subscription.endpoint.substring(0, 60)}...`);
    return true;
  } catch (error: any) {
    console.error(`[Push] Failed to send to ${subscription.endpoint.substring(0, 60)}... - Status: ${error.statusCode || "unknown"}, Error: ${error.message}`);
    if (error.statusCode === 410 || error.statusCode === 404) {
      console.log(`[Push] Removing expired/invalid subscription: ${subscription.endpoint.substring(0, 60)}...`);
      await storage.removePushSubscription(subscription.endpoint);
    }
    return false;
  }
}

export async function broadcastNotification(payload: NotificationPayload): Promise<void> {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("[Push] VAPID keys not configured, skipping push notifications");
    return;
  }

  const subscriptions = await storage.getAllPushSubscriptions();
  console.log(`[Push] Broadcasting "${payload.title}" to ${subscriptions.length} subscription(s)`);

  if (subscriptions.length === 0) {
    console.log("[Push] No subscriptions found - no notifications sent");
    return;
  }

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      sendPushToSubscription(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload
      )
    )
  );

  const succeeded = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
  const failed = results.length - succeeded;
  console.log(`[Push] Broadcast complete: ${succeeded} succeeded, ${failed} failed out of ${results.length} total`);
}
