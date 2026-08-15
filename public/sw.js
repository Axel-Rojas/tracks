const CACHE_VERSION = 'v2'
const SHELL_CACHE = `app-shell-${CACHE_VERSION}`

// Solo assets realmente estáticos. El HTML de "/" NO se precachea:
// se guarda recién cuando el usuario lo visita, y únicamente como fallback offline.
const SHELL_ASSETS = ['/manifest.json', '/icon.svg']

const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|flac|opus|aac)$/i

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Audio: siempre red, nunca cache (archivos pesados y de larga duración).
  if (AUDIO_EXT.test(url.pathname)) return

  // Chunks de Next: el nombre lleva hash de contenido, así que son inmutables.
  // Cache-first es seguro acá — un chunk nuevo tiene otra URL.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone()
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone))
            }
            return response
          })
      )
    )
    return
  }

  // Todo lo demás (navegaciones HTML y payloads RSC de `?_rsc=`): network-first.
  // Estas respuestas llevan datos de Convex, así que la copia en cache solo
  // sirve como fallback offline, nunca para ahorrarse el request.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached ?? Response.error()))
  )
})
