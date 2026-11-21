import webpush from "web-push";
import { storage } from "./storage";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidSubject = process.env.VAPID_SUBJECT || "";

if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
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

export async function sendSiteNotification(siteId: string, payload: NotificationPayload): Promise<void> {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("[Push] VAPID keys not configured, skipping push notifications");
    return;
  }

  const [siteSubscriptions, adminPlantSubscriptions] = await Promise.all([
    storage.getPushSubscriptionsBySiteId(siteId),
    storage.getNonSitePushSubscriptions(),
  ]);

  const seen = new Set<string>();
  const allSubscriptions = [...adminPlantSubscriptions, ...siteSubscriptions].filter((sub) => {
    if (seen.has(sub.endpoint)) return false;
    seen.add(sub.endpoint);
    return true;
  });

  console.log(`[Push] Site notification "${payload.title}" for site ${siteId}: ${siteSubscriptions.length} site sub(s) + ${adminPlantSubscriptions.length} admin/plant sub(s) = ${allSubscriptions.length} unique`);

  if (allSubscriptions.length === 0) {
    console.log("[Push] No subscriptions found for this site notification");
    return;
  }

  const results = await Promise.allSettled(
    allSubscriptions.map((sub) =>
      sendPushToSubscription(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload
      )
    )
  );

  const succeeded = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
  const failed = results.length - succeeded;
  console.log(`[Push] Site notification complete: ${succeeded} succeeded, ${failed} failed out of ${results.length} total`);
}
