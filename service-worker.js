// ==========================================================================
// SERVICE WORKER — TruckLocate PWA
// Stratégie : Network First pour JS/HTML, Cache First pour images/fonts
// ==========================================================================

const CACHE_NAME = "trucklocate-v6";

// Fichiers qu'on ne met JAMAIS en cache (toujours réseau)
const NEVER_CACHE = ["/app.js", "/index.html", "/mockData.js", "/styles.css", "/manifest.json", "/service-worker.js"];

// ==========================================================================
// INSTALL
// ==========================================================================
self.addEventListener("install", (event) => {
  console.log("[SW] Install v4");
  self.skipWaiting(); // Active immédiatement sans attendre
});

// ==========================================================================
// ACTIVATE — supprime tous les anciens caches
// ==========================================================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => {
        console.log("[SW] Suppression cache :", key);
        return caches.delete(key);
      }))
    ).then(() => self.clients.claim())
  );
});

// ==========================================================================
// FETCH — Network First pour tout
// ==========================================================================
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith("http")) return;

  const url = new URL(event.request.url);
  const path = url.pathname;

  // Fichiers critiques : toujours réseau, jamais cache
  const isNeverCache = NEVER_CACHE.some(p => path === p || path.endsWith(p));
  if (isNeverCache) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(() =>
        caches.match(event.request)
      )
    );
    return;
  }

  // Tuiles carte : cache pour performances
  if (url.hostname.includes("basemaps.cartocdn.com")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Reste : réseau avec fallback cache
  event.respondWith(
    fetch(event.request, { cache: "no-store" }).catch(() =>
      caches.match(event.request)
    )
  );
});

// ==========================================================================
// MESSAGE
// ==========================================================================
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
