import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CrosswordEngine } from "../js/crossword-engine.js";
import { calculateScore, speedBonus } from "../js/scoring.js";
import { newRecord } from "../js/storage.js";
import { recordCompletion, statistics } from "../js/statistics.js";
const puzzle = JSON.parse(
  fs.readFileSync(
    new URL("../data/puzzles/ambebi-68.json", import.meta.url),
  ),
);
const make = () => new CrosswordEngine(structuredClone(puzzle));
test("typing does not leak correctness through score", () => {
  const e = make();
  e.enter(e.solution[e.selected]);
  assert.equal(e.score, 0);
});
test("correct word credits unique letters and word once", () => {
  const e = make();
  e.paste([...e.clue.answer]);
  e.check();
  const score = e.score;
  assert.equal(score, e.path.length * 10 + 25);
  e.check();
  assert.equal(e.score, score);
});
test("deleting and retyping cannot farm points", () => {
  const e = make();
  e.paste([...e.clue.answer]);
  e.check();
  const score = e.score;
  e.clearWord();
  e.selectClue(e.clueId);
  e.paste([...e.clue.answer]);
  e.check();
  assert.equal(e.score, score);
});
test("rechecking unchanged incorrect word adds only one penalty", () => {
  const e = make();
  e.state.cells[e.selected] = "ჰ";
  e.check();
  e.check();
  assert.equal(Object.keys(e.state.mistakeChecks).length, 1);
  assert.equal(e.score, 0);
});
test("blank checks do not add penalties", () => {
  const e = make();
  e.check("all");
  assert.equal(Object.keys(e.state.mistakeChecks).length, 0);
});
test("reveal charges only for assistance and excludes letter/word accuracy rewards", () => {
  const e = make();
  e.reveal("word");
  const hints = e.state.hintsUsed;
  e.reveal("word");
  assert.equal(e.state.hintsUsed, hints);
  assert.equal(e.state.hintCost, 100);
  e.check();
  assert.equal(Object.keys(e.state.awardedCells).length, 0);
  assert.equal(Object.keys(e.state.awardedWords).length, 0);
});
test("intersection cells are not double-counted in completion score", () => {
  const e = make();
  e.state.cells = { ...e.solution };
  e.finish();
  const expected =
    Object.keys(e.solution).length * 10 +
    puzzle.clues.length * 25 +
    200 +
    150 +
    100;
  assert.equal(e.score, expected);
});
test("hint bonus removed and hint cost retained at completion", () => {
  const e = make();
  const k = e.selected;
  e.reveal();
  e.state.cells = { ...e.solution };
  e.finish();
  assert.equal(e.state.awardedCells[k], undefined);
  assert.equal(e.score, calculateScore(e.state));
  assert.equal(e.state.hintsUsed, 1);
});
test("score reproduces exactly after JSON restore", () => {
  const e = make();
  e.reveal();
  e.paste([...e.clue.answer]);
  e.check();
  const restored = new CrosswordEngine(
    puzzle,
    JSON.parse(JSON.stringify(e.state)),
  );
  assert.equal(restored.score, e.score);
});
test("repeated completions count one unique puzzle in score and stats", () => {
  const e = make();
  e.state.cells = { ...e.solution };
  e.finish();
  const record = newRecord();
  record.attempt = e.state;
  recordCompletion(record, e);
  recordCompletion(record, e);
  const s = statistics({ puzzles: { [puzzle.id]: record }, activity: [] });
  assert.equal(s.completed, 1);
  assert.equal(s.totalScore, e.score);
});
test("speed bonus clamped and difficulty adjusted", () => {
  assert.equal(speedBonus("easy", 360), 0);
  assert.equal(speedBonus("hard", 360), 70);
  assert.equal(speedBonus("easy", 10000), 0);
});
