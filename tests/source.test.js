import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
test("all browser modules and service worker parse successfully", () => {
  for (const name of [
    ...fs.readdirSync(new URL("../js/", import.meta.url)).map((x) => "js/" + x),
    "service-worker.js",
    "tests/e2e.js",
  ]) {
    const r = spawnSync(process.execPath, ["--check", name], {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
  }
});
test("published runtime has no external service URLs or frameworks", () => {
  const root = new URL("../", import.meta.url);
  for (const dir of ["js", "css"])
    for (const file of fs.readdirSync(new URL(dir + "/", root))) {
      const s = fs.readFileSync(new URL(`${dir}/${file}`, root), "utf8");
      assert.doesNotMatch(s, /https?:\/\//, file);
      assert.doesNotMatch(s, /indexedDB|react-dom|tailwindcss/, file);
    }
});
