// ==========================================================================
// SERVICE WORKER — TruckLocate PWA
// Version : incrémente ce numéro à chaque déploiement pour forcer le refresh
// ==========================================================================

const CACHE_NAME = "trucklocate-v1";

// Fichiers mis en cache lors de l'installation (shell de l'app)
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/mockData.js",
  "/styles.css",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// Ressources externes (Leaflet CDN) — mises en cache à la première visite
const CDN_ASSETS = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

// ==========================================================================
// INSTALL — mise en cache du shell statique
// ==========================================================================
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Installation — mise en cache des assets statiques");
      // On tente le cache des assets locaux (obligatoires)
      return cache.addAll(STATIC_ASSETS).then(() => {
        // On tente le cache des CDN (optionnel, ne bloque pas l'install si offline)
        return Promise.allSettled(
          CDN_ASSETS.map(url => cache.add(url).catch(() => null))
        );
      });
    }).then(() => self.skipWaiting())
  );
});

// ==========================================================================
// ACTIVATE — nettoyage des anciens caches
// ==========================================================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log("[SW] Suppression ancien cache :", name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ==========================================================================
// FETCH — stratégie réseau intelligente
// ==========================================================================
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Ignore les requêtes non-GET (POST, etc.)
  if (event.request.method !== "GET") return;

  // Ignore les extensions Chrome et requêtes non-http
  if (!event.request.url.startsWith("http")) return;

  // --- Requêtes vers l'API Nominatim (géocodage) ---
  // Stratégie : Network First (données temps réel, pas de cache)
  if (url.hostname.includes("nominatim.openstreetmap.org")) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify([]),
          { headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  // --- Tiles de carte (CartoDB) ---
  // Stratégie : Cache First avec fallback réseau (tiles = données lourdes)
  if (url.hostname.includes("basemaps.cartocdn.com")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          // On cache uniquement les réponses valides
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // --- Assets CDN Leaflet / Unsplash images ---
  // Stratégie : Stale While Revalidate
  if (
    url.hostname.includes("unpkg.com") ||
    url.hostname.includes("unsplash.com") ||
    url.hostname.includes("images.unsplash.com")
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // --- Assets locaux (HTML, JS, CSS, icons) ---
  // Stratégie : Cache First, fallback réseau, fallback page offline
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }
        return response;
      }).catch(() => {
        // Fallback : renvoie index.html pour les navigations (SPA)
        if (event.request.mode === "navigate") {
          return caches.match("/index.html");
        }
      });
    })
  );
});

// ==========================================================================
// MESSAGE — permet de forcer la mise à jour depuis l'app
// ==========================================================================
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
