/* Progress is stored independently in localStorage, never in these caches. */
const VERSION = "sitqvana-v1";
const CORE = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/router.js",
  "./js/crossword-engine.js",
  "./js/crossword-renderer.js",
  "./js/keyboard.js",
  "./js/storage.js",
  "./js/scoring.js",
  "./js/statistics.js",
  "./js/achievements.js",
  "./js/utils.js",
  "./js/daily-puzzle.js",
  "./js/puzzle-loader.js",
  "./assets/fonts/NotoSansGeorgian-Regular.ttf",
  "./assets/fonts/NotoSansGeorgian-Bold.ttf",
  "./assets/fonts/NotoSerifGeorgian-Regular.ttf",
  "./assets/fonts/NotoSansSymbols2-Regular.ttf",
  "./assets/icons/icon.svg",
  "./assets/fonts/NotoSans-Regular.ttf",
  "./assets/fonts/NotoSansSymbols-Regular.ttf",
  "./manifest.webmanifest",
  "./data/puzzles/index.json",
];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(CORE))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      for (const name of await caches.keys()) {
        if (name.startsWith("sitqvana-") && name !== VERSION) {
          const old = await caches.open(name);
          for (const request of await old.keys()) {
            if (
              /\/data\/puzzles\/(?!index\.json)[^/]+\.json$/.test(
                new URL(request.url).pathname,
              ) &&
              !(await cache.match(request))
            )
              await cache.put(request, await old.match(request));
          }
          await caches.delete(name);
        }
      }
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.href.startsWith(self.registration.scope)
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION),
        cached = await cache.match(event.request);
      const isData = url.pathname.endsWith(".json");
      if (cached && !isData) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response.ok ? response : cached || response;
      } catch {
        if (cached) return cached;
        if (event.request.mode === "navigate")
          return await cache.match("./index.html");
        return new Response("Offline", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        });
      }
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_ALL") return;
  event.waitUntil(
    (async () => {
      const port = event.ports[0];
      try {
        const cache = await caches.open(VERSION),
          url = new URL("./data/puzzles/index.json", self.registration.scope);
        let response;
        try {
          response = await fetch(url);
        } catch {
          response = await cache.match(url);
        }
        if (!response?.ok) throw Error("manifest unavailable");
        const index = await response.json();
        let count = 0;
        for (const p of index.puzzles) {
          if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(p.id)) throw Error("bad ID");
          await cache.add(
            new URL(`./data/puzzles/${p.id}.json`, self.registration.scope),
          );
          port?.postMessage({ progress: ++count });
        }
        port?.postMessage({ done: true });
      } catch {
        port?.postMessage({ error: true });
      }
    })(),
  );
});
