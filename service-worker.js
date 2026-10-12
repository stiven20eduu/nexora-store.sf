/* NEXORA STORE PWA · Cache limitado a recursos públicos del propio sitio.
   No almacena llamadas a Firebase, métodos POST, APIs ni respuestas privadas. */
const CACHE_NAME = "nexora-public-v6";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./nexora-premium.css?v=2",
  "./nexora-experience.js?v=2",
  "./icon-192.png",
  "./icon-512.png",
  "./Emblema%20Nexora%20Store%20SF%20con%20corona.png"
];
const ROOT = new URL("./", self.registration.scope);
const allowedFiles = /\.(?:css|js|svg|png|jpe?g|webp|gif|ico|woff2?|json)$/i;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(SHELL.map(path => cache.add(path).catch(() => undefined)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("nexora-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // No interceptar APIs, Firebase, URLs externas, peticiones de usuario o descargas.
  if (url.origin !== self.location.origin ||
      !url.pathname.startsWith(ROOT.pathname) ||
      url.pathname.includes("/api/") ||
      request.headers.has("Authorization")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => {
        const home = new URL("index.html", ROOT);
        return caches.match(home.href).then(res => res || Response.error());
      })
    );
    return;
  }

  if (!allowedFiles.test(url.pathname)) return;
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {}));
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || Response.error()))
  );
});
