// Service Worker: يعترض الطلبات إلى dz.1xbet.com ويعيد توجيهها
// إلى proxy على نفس الأصل لتجاوز CORS.
const TARGET_HOST = "dz.1xbet.com";
const PROXY_PREFIX = "/proxy-1xbet";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  try {
    const url = new URL(event.request.url);
    if (url.hostname === TARGET_HOST) {
      const proxied = new URL(
        PROXY_PREFIX + url.pathname + url.search,
        self.location.origin
      );
      const newReq = new Request(proxied.toString(), {
        method: event.request.method,
        headers: event.request.headers,
        mode: "cors",
        credentials: "omit",
        redirect: "follow",
      });
      event.respondWith(fetch(newReq));
    }
  } catch (_) {
    // ignore
  }
});
