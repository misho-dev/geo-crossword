import test from "node:test";
import assert from "node:assert/strict";
import {
  Storage,
  STORAGE_KEY,
  validateSave,
  freshStore,
} from "../js/storage.js";
import { statistics } from "../js/statistics.js";
import { unlockAchievements } from "../js/achievements.js";
import { dailyPuzzle } from "../js/daily-puzzle.js";
const backend = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) || null, setItem: (k, v) => m.set(k, v) };
};
test("multiple puzzles save and reload independently", () => {
  const b = backend(),
    s = new Storage(b);
  s.get("one").attempt.cells["0,0"] = "ა";
  s.get("two").attempt.cells["1,1"] = "ბ";
  s.save();
  const restored = new Storage(b);
  assert.equal(restored.get("one").attempt.cells["0,0"], "ა");
  assert.equal(restored.get("two").attempt.cells["1,1"], "ბ");
});
test("export/import roundtrip preserves settings and progress", () => {
  const s = new Storage(backend());
  s.get("one").attempt.hintsUsed = 2;
  s.data.settings.theme = "dark";
  const other = new Storage(backend());
  other.import(s.export());
  assert.equal(other.get("one").attempt.hintsUsed, 2);
  assert.equal(other.data.settings.theme, "dark");
});
test("reset retains historical best and archives attempt counters", () => {
  const s = new Storage(backend()),
    r = s.get("one");
  r.bestScore = 250;
  r.bestTime = 44;
  r.completions = 1;
  r.attempt.hintsUsed = 3;
  r.attempt.cells["0,0"] = "ა";
  s.resetPuzzle("one");
  assert.equal(r.bestScore, 250);
  assert.equal(r.completions, 1);
  assert.equal(r.archivedHints, 3);
  assert.deepEqual(r.attempt.cells, {});
});
test("version one migrates without losing valid letters", () => {
  const s = validateSave({
    version: 1,
    puzzles: { one: { cells: { "0,0": "ა" }, elapsedSeconds: 22 } },
    settings: { theme: "dark" },
  });
  assert.equal(s.version, 2);
  assert.equal(s.puzzles.one.attempt.cells["0,0"], "ა");
  assert.equal(s.puzzles.one.attempt.elapsedSeconds, 22);
});
test("invalid and future saves rejected; import leaves existing state intact", () => {
  const s = new Storage(backend());
  s.get("one");
  assert.throws(() => s.import('{"version":99,"puzzles":{}}'));
  assert.ok(s.data.puzzles.one);
  assert.throws(() => s.import("not json"));
});
test("corrupt stored data is not silently overwritten", () => {
  const b = backend();
  b.setItem(STORAGE_KEY, "broken");
  const s = new Storage(b);
  assert.equal(s.blocked, true);
  s.get("one");
  assert.equal(s.save(), false);
  assert.equal(b.getItem(STORAGE_KEY), "broken");
});
test("storage quota and unavailable storage retain in-memory progress and report failure", () => {
  let messages = 0;
  const s = new Storage(
    {
      getItem: () => null,
      setItem: () => {
        throw Error("quota");
      },
    },
    () => messages++,
  );
  s.get("one").attempt.cells["0,0"] = "ა";
  assert.equal(s.save(), false);
  assert.equal(s.get("one").attempt.cells["0,0"], "ა");
  s.save();
  assert.equal(messages, 1);
  assert.equal(new Storage(undefined).save(), false);
});
test("untrusted saved values are bounded and invalid characters removed", () => {
  const s = validateSave({
    version: 2,
    puzzles: {
      one: {
        attempt: {
          elapsedSeconds: -5,
          cells: { "0,0": "a", "0,1": "ა", oops: "ბ" },
          hintsUsed: Infinity,
        },
      },
    },
    settings: { zen: "yes" },
  });
  assert.equal(s.puzzles.one.attempt.elapsedSeconds, 0);
  assert.deepEqual(s.puzzles.one.attempt.cells, { "0,1": "ა" });
  assert.equal(s.settings.zen, false);
});
test("reset all removes history and preferences", () => {
  const s = new Storage(backend());
  s.get("one");
  s.data.settings.zen = true;
  s.resetAll();
  assert.deepEqual(s.data, freshStore());
});
test("streak allows yesterday but ends after a missed day", () => {
  const d = freshStore();
  d.activity = ["2026-11-01", "2026-11-02", "2026-11-03"];
  assert.equal(statistics(d, "2026-11-04").current, 3);
  assert.equal(statistics(d, "2026-11-05").current, 0);
  assert.equal(statistics(d, "2026-11-05").longest, 3);
});
test("achievements cannot be fabricated by importing badge IDs alone", () => {
  const d = freshStore();
  d.achievements = ["first"];
  unlockAchievements(d);
  assert.deepEqual(d.achievements, []);
});
test("daily choice is deterministic and independent of index ordering", () => {
  const c = { puzzles: [{ id: "b" }, { id: "a" }, { id: "c" }] };
  assert.equal(
    dailyPuzzle(c, "2026-11-10").id,
    dailyPuzzle({ puzzles: c.puzzles.reverse() }, "2026-11-10").id,
  );
});
