// Service worker minimo de LIPgo.
// Su unico proposito es habilitar la instalacion de la PWA (los navegadores
// exigen un SW con manejador de `fetch` para ofrecer "Instalar"). NO cachea
// nada para no servir paginas ni datos obsoletos: pasa todo a la red.
self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", (event) => {
  // Solo GET; el resto lo maneja el navegador normalmente.
  if (event.request.method !== "GET") return
  // Passthrough a la red (con fallback de error offline). Requisito para que
  // el navegador considere la app instalable.
  event.respondWith(fetch(event.request).catch(() => Response.error()))
})
