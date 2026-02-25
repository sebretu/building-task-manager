// Service Worker for Task Manager PWA
const CACHE_NAME = "task-manager-v2";
const RUNTIME_CACHE = "task-manager-runtime";
const API_CACHE = "task-manager-api";
const IMAGE_CACHE = "task-manager-images";

// Assets to cache on install
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/auth/login",
  "/offline.html",
];

// API routes to cache
const CACHEABLE_API_ROUTES = [
  "/api/projects",
  "/api/profiles",
  "/api/companies",
];

self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Service Worker: Caching precache assets");
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.log("Some assets could not be cached:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activating...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (
            cacheName !== CACHE_NAME &&
            cacheName !== RUNTIME_CACHE &&
            cacheName !== API_CACHE &&
            cacheName !== IMAGE_CACHE
          ) {
            console.log("Service Worker: Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and external URLs
  if (request.method !== "GET" || !url.origin.includes(self.location.origin)) {
    return;
  }

  // API requests - Network first, fallback to cache
  // Skip binary downloads like /api/reports/ — let browser handle them directly
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname.startsWith("/api/reports")) {
      // Pass through directly — binary PDF downloads must not be intercepted
      return;
    }
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses
          if (response.ok) {
            const cache = caches.open(API_CACHE);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          // Return cached response if network fails
          return caches.match(request).then((cachedResponse) => {
            return (
              cachedResponse ||
              new Response(
                JSON.stringify({
                  error: "Offline - cached data may not be available",
                }),
                { status: 503, headers: { "Content-Type": "application/json" } }
              )
            );
          });
        })
    );
    return;
  }

  // Image requests - Cache first
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          return (
            cachedResponse ||
            fetch(request)
              .then((response) => {
                if (response.ok) {
                  cache.put(request, response.clone());
                }
                return response;
              })
              .catch(() => {
                return new Response(null, { status: 404 });
              })
          );
        });
      })
    );
    return;
  }

  // HTML pages - Network first, fallback to cache
  if (request.headers.get("accept").includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const cache = caches.open(RUNTIME_CACHE);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          return caches
            .match(request)
            .then((cachedResponse) => {
              return (
                cachedResponse ||
                caches
                  .match("/offline.html")
                  .then((offlinePage) => offlinePage)
              );
            });
        })
    );
    return;
  }

  // CSS/JS - Cache first, fallback to network
  if (
    /\.(css|js)$/i.test(url.pathname) ||
    request.headers.get("accept").includes("application/javascript")
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          return (
            cachedResponse ||
            fetch(request).then((response) => {
              if (response.ok) {
                cache.put(request, response.clone());
              }
              return response;
            })
          );
        });
      })
    );
    return;
  }

  // Default - Network first
  event.respondWith(
    fetch(request)
      .then((response) => response)
      .catch(() => {
        return caches.match(request);
      })
  );
});
