import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CrosswordEngine } from "../js/crossword-engine.js";
import { validatePuzzle } from "../js/puzzle-loader.js";
import {
  ALPHABET,
  LATIN_MAP,
  normalizeLetter,
  parseInput,
} from "../js/keyboard.js";
const puzzle = JSON.parse(
  fs.readFileSync(
    new URL("../data/puzzles/ambebi-68.json", import.meta.url),
  ),
);
const make = () => new CrosswordEngine(structuredClone(puzzle));
test("every shipped puzzle reconstructs a valid connected grid", () => {
  for (const name of fs
    .readdirSync(new URL("../data/puzzles/", import.meta.url))
    .filter((x) => x.endsWith(".json") && x !== "index.json"))
    validatePuzzle(
      JSON.parse(
        fs.readFileSync(new URL(`../data/puzzles/${name}`, import.meta.url)),
      ),
    );
});
test("initialization selects a valid clue and cell", () => {
  const e = make();
  assert.equal(e.selected, e.path[0]);
  assert.equal(e.progress, 0);
  assert.equal(e.isSolved(), false);
});
test("intersection second click switches direction without changing cell", () => {
  const e = make(),
    k = Object.keys(e.members).find((k) => e.members[k].length === 2);
  e.select(k, false);
  const id = e.clueId;
  e.select(k);
  assert.notEqual(e.clueId, id);
  assert.equal(e.selected, k);
});
test("clue navigation wraps in both directions", () => {
  const e = make(),
    first = e.clueId;
  e.nextClue(-1);
  assert.equal(e.clueId, puzzle.clues.at(-1).id);
  e.nextClue();
  assert.equal(e.clueId, first);
});
test("arrow navigation never lands on blocked or out-of-bounds cells", () => {
  const e = make();
  for (const [r, c] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ])
    for (let i = 0; i < 80; i++) {
      e.move(r, c);
      assert.ok(e.solution[e.selected]);
    }
});
test("intersection values are shared and automatic advance preserves filled cells", () => {
  const e = make(),
    path = e.path;
  e.state.cells[path[1]] = e.solution[path[1]];
  e.enter(e.solution[path[0]]);
  assert.equal(e.state.cells[path[1]], e.solution[path[1]]);
  if (path.length > 2) assert.equal(e.selected, path[2]);
});
test("backspace removes current letter then moves backward from empty cell", () => {
  const e = make();
  const path = e.path;
  e.selected = path[1];
  e.state.cells[path[1]] = "ა";
  e.backspace();
  assert.equal(e.state.cells[path[1]], undefined);
  e.state.cells[path[0]] = "ბ";
  e.backspace();
  assert.equal(e.selected, path[0]);
  assert.equal(e.state.cells[path[0]], undefined);
});
test("filled but wrong puzzle is not complete", () => {
  const e = make();
  for (const k of Object.keys(e.solution)) e.state.cells[k] = "ჰ";
  assert.equal(e.finish(), false);
  assert.equal(e.state.completed, false);
});
test("only exact solution completes and final state is immutable by typing", () => {
  const e = make();
  e.state.cells = { ...e.solution };
  assert.equal(e.finish(), true);
  const snap = JSON.stringify(e.state.cells);
  e.enter("ა");
  e.backspace();
  assert.equal(JSON.stringify(e.state.cells), snap);
  assert.equal(e.finish(), false);
});
test("all 33 Georgian and Mtavruli letters normalize", () => {
  assert.equal(ALPHABET.length, 33);
  for (const c of ALPHABET) {
    assert.equal(normalizeLetter(c), c);
    assert.equal(normalizeLetter(c.toUpperCase()), c);
  }
});
test("complete distinct QWERTY mapping and explicit uppercase ambiguity", () => {
  assert.equal(new Set(Object.values(LATIN_MAP)).size, 33);
  assert.equal(normalizeLetter("t", true), "ტ");
  assert.equal(normalizeLetter("T", true), "თ");
  assert.equal(normalizeLetter("a", false), "");
  assert.equal(normalizeLetter("1", true), "");
});
test("paste filters invalid input and fills only selected word", () => {
  assert.deepEqual(parseInput("ა,ბ!1 გ"), ["ა", "ბ", "გ"]);
  const e = make();
  const length = e.path.length;
  e.paste([...(e.clue.answer + "ასოები")]);
  assert.equal(Object.keys(e.state.cells).length, length);
});
test("revealed cells cannot be cleared or overwritten", () => {
  const e = make(),
    k = e.selected;
  e.reveal();
  e.selected = k;
  e.enter(e.solution[k] === "ა" ? "ბ" : "ა");
  e.selected = k;
  e.backspace();
  e.clearWord();
  assert.equal(e.state.cells[k], e.solution[k]);
});
test("corrupt grid and conflicting answers are rejected", () => {
  const p = structuredClone(puzzle);
  p.grid.rows = 0;
  assert.throws(() => validatePuzzle(p));
  const q = structuredClone(puzzle);
  q.clues[0].answer = "";
  assert.throws(() => validatePuzzle(q));
});
