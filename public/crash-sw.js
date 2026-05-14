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
  let url;
  try {
    url = new URL(event.request.url);
  } catch (_) {
    return;
  }
  if (url.hostname !== TARGET_HOST) return;

  const proxied =
    self.location.origin + PROXY_PREFIX + url.pathname + url.search;

  event.respondWith(
    fetch(proxied, { method: event.request.method, credentials: "omit" })
      .then((res) => {
        const headers = new Headers(res.headers);
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers,
        });
      })
      .catch(
        () => new Response("", { status: 502, statusText: "Proxy error" })
      )
  );
});
