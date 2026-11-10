import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
const worker = fs.readFileSync(
  new URL("../service-worker.js", import.meta.url),
  "utf8",
);
function runtime() {
  const listeners = {},
    stores = new Map(),
    base = "https://example.org/georgian-crossword/";
  let offline = false;
  const normalize = (x) =>
    new URL(typeof x === "string" ? x : x.url, base).href;
  const caches = {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        addAll: async (urls) => {
          for (const u of urls) store.set(normalize(u), new Response("asset"));
        },
        add: async (u) => store.set(normalize(u), new Response("asset")),
        match: async (u) => store.get(normalize(u))?.clone(),
        put: async (u, response) => store.set(normalize(u), response.clone()),
        keys: async () => [...store.keys()].map((u) => new Request(u)),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
  const self = {
    location: { origin: "https://example.org" },
    registration: { scope: base },
    clients: { claim: async () => {} },
    addEventListener: (name, fn) => (listeners[name] = fn),
  };
  const context = {
    self,
    caches,
    URL,
    Response,
    fetch: async () => {
      if (offline) throw Error("offline");
      return new Response("network");
    },
  };
  vm.runInNewContext(worker, context);
  const dispatch = async (name, extra = {}) => {
    let promise;
    listeners[name]({
      ...extra,
      waitUntil: (p) => (promise = p),
      respondWith: (p) => (promise = p),
    });
    return await promise;
  };
  return { caches, dispatch, offline: () => (offline = true), base, stores };
}
test("service worker precaches local core assets under repository subpath", async () => {
  const r = runtime();
  await r.dispatch("install");
  const cache = await r.caches.open("sitqvana-v1");
  assert.ok(await cache.match(r.base + "js/app.js"));
  assert.ok(
    await cache.match(r.base + "assets/fonts/NotoSansGeorgian-Regular.ttf"),
  );
});
test("previously opened puzzle is available after network disappears", async () => {
  const r = runtime();
  await r.dispatch("install");
  const request = new Request(r.base + "data/puzzles/original-001.json");
  assert.equal(
    await (await r.dispatch("fetch", { request })).text(),
    "network",
  );
  r.offline();
  assert.equal(
    await (await r.dispatch("fetch", { request })).text(),
    "network",
  );
});
test("uncached offline puzzle returns controlled 503 response", async () => {
  const r = runtime();
  await r.dispatch("install");
  r.offline();
  const response = await r.dispatch("fetch", {
    request: new Request(r.base + "data/puzzles/missing.json"),
  });
  assert.equal(response.status, 503);
});
test("cache update carries opened puzzles and leaves unrelated caches intact", async () => {
  const r = runtime();
  await (
    await r.caches.open("sitqvana-old")
  ).put(r.base + "data/puzzles/old.json", new Response("old puzzle"));
  await r.caches.open("other-app");
  await r.dispatch("install");
  await r.dispatch("activate");
  assert.ok(
    await (
      await r.caches.open("sitqvana-v1")
    ).match(r.base + "data/puzzles/old.json"),
  );
  assert.equal((await r.caches.keys()).includes("sitqvana-old"), false);
  assert.ok((await r.caches.keys()).includes("other-app"));
});
test("external and out-of-scope requests are not intercepted", async () => {
  const r = runtime();
  assert.equal(
    await r.dispatch("fetch", {
      request: new Request("https://external.example/font"),
    }),
    undefined,
  );
  assert.equal(
    await r.dispatch("fetch", {
      request: new Request("https://example.org/other/"),
    }),
    undefined,
  );
});
