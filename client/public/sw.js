const SW_VERSION = "1.3.0";

self.addEventListener("install", (event) => {
  console.log("[SW] Installing version:", SW_VERSION);
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Activated version:", SW_VERSION);
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match("/") || new Response("Offline", { status: 503 });
      })
    );
  }
});

self.addEventListener("push", (event) => {
  console.log("[SW] Push event received");

  if (!event.data) {
    console.log("[SW] Push event has no data");
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: "DispatchPro", body: event.data.text() };
  }

  console.log("[SW] Notification payload:", payload.title, payload.body);

  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    tag: payload.tag || "dispatch-notification",
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
    data: payload.data || {},
    actions: [],
  };

  event.waitUntil(self.registration.showNotification(payload.title || "DispatchPro", options));
});

self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification clicked:", event.notification.tag);
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = data.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
