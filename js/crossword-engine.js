import { validatePuzzle } from "./puzzle-loader.js";
import { normalizeLetter } from "./keyboard.js";
import { calculateScore, POINTS, speedBonus } from "./scoring.js";
export function newAttempt() {
  return {
    cells: {},
    elapsedSeconds: 0,
    revealed: {},
    awardedCells: {},
    awardedWords: {},
    mistakeChecks: {},
    hintsUsed: 0,
    hintCost: 0,
    completed: false,
    completedAt: null,
    speedBonus: 0,
  };
}
export class CrosswordEngine {
  constructor(puzzle, attempt = newAttempt()) {
    this.puzzle = puzzle;
    Object.assign(this, validatePuzzle(puzzle));
    this.state = attempt;
    for (const map of ["cells", "revealed", "awardedCells"])
      for (const k of Object.keys(attempt[map]))
        if (!this.solution[k]) delete attempt[map][k];
    for (const k of Object.keys(attempt.revealed)) {
      attempt.cells[k] = this.solution[k];
      delete attempt.awardedCells[k];
    }
    for (const id of Object.keys(attempt.awardedWords))
      if (
        !this.wordPaths[id] ||
        this.wordPaths[id].some((k) => attempt.revealed[k])
      )
        delete attempt.awardedWords[id];
    if (attempt.completed && !this.isSolved()) {
      attempt.completed = false;
      attempt.completedAt = null;
      attempt.speedBonus = 0;
    }
    this.clueId = puzzle.clues[0].id;
    this.selected = this.wordPaths[this.clueId][0];
    this.feedback = {};
  }
  get clue() {
    return this.puzzle.clues.find((c) => c.id === this.clueId);
  }
  get path() {
    return this.wordPaths[this.clueId];
  }
  get score() {
    return calculateScore(this.state);
  }
  get progress() {
    return Math.round(
      (Object.keys(this.solution).filter((k) => this.state.cells[k]).length /
        Object.keys(this.solution).length) *
        100,
    );
  }
  select(k, toggle = true) {
    if (!this.solution[k]) return;
    const candidates = this.members[k];
    if (k === this.selected && toggle && candidates.length > 1)
      this.clueId = candidates.find((id) => id !== this.clueId);
    else if (!candidates.includes(this.clueId))
      this.clueId =
        candidates.find(
          (id) =>
            this.puzzle.clues.find((c) => c.id === id).direction ===
            this.clue.direction,
        ) || candidates[0];
    this.selected = k;
  }
  selectClue(id) {
    if (!this.wordPaths[id]) return;
    this.clueId = id;
    this.selected = this.path.find((k) => !this.state.cells[k]) || this.path[0];
  }
  nextClue(delta = 1) {
    const i = this.puzzle.clues.findIndex((c) => c.id === this.clueId);
    this.selectClue(
      this.puzzle.clues[
        (i + delta + this.puzzle.clues.length) % this.puzzle.clues.length
      ].id,
    );
  }
  move(dr, dc) {
    const [r, c] = this.selected.split(",").map(Number);
    const desired = dr ? "down" : "across";
    const candidate = this.members[this.selected].find(
      (id) => this.puzzle.clues.find((x) => x.id === id).direction === desired,
    );
    if (candidate) this.clueId = candidate;
    let rr = r + dr,
      cc = c + dc;
    while (
      rr >= 0 &&
      cc >= 0 &&
      rr < this.puzzle.grid.rows &&
      cc < this.puzzle.grid.cols
    ) {
      const k = `${rr},${cc}`;
      if (this.solution[k]) {
        this.select(k, false);
        break;
      }
      rr += dr;
      cc += dc;
    }
  }
  enter(letter) {
    if (this.state.completed) return false;
    letter = normalizeLetter(letter);
    if (!letter) return false;
    const k = this.selected;
    if (this.state.revealed[k]) {
      this.advance();
      return false;
    }
    this.state.cells[k] = letter;
    delete this.feedback[k];
    this.advance();
    this.finish();
    return true;
  }
  advance() {
    const i = this.path.indexOf(this.selected);
    const next = this.path.slice(i + 1).find((k) => !this.state.cells[k]);
    if (next) this.selected = next;
    else if (i < this.path.length - 1) this.selected = this.path[i + 1];
  }
  paste(letters) {
    let count = 0;
    const start = this.path.indexOf(this.selected);
    for (const k of this.path.slice(start)) {
      if (count >= letters.length) break;
      if (this.state.revealed[k]) continue;
      this.state.cells[k] = letters[count++];
      delete this.feedback[k];
      this.selected = k;
    }
    this.finish();
    return count;
  }
  backspace() {
    if (this.state.completed) return false;
    if (!this.state.cells[this.selected]) {
      const i = this.path.indexOf(this.selected);
      if (i > 0) this.selected = this.path[i - 1];
    }
    if (this.state.revealed[this.selected]) return false;
    delete this.state.cells[this.selected];
    delete this.feedback[this.selected];
    return true;
  }
  clearWord() {
    if (this.state.completed) return;
    for (const k of this.path)
      if (!this.state.revealed[k]) {
        delete this.state.cells[k];
        delete this.feedback[k];
      }
  }
  isSolved() {
    return Object.entries(this.solution).every(
      ([k, v]) => this.state.cells[k] === v,
    );
  }
  award() {
    for (const [k, v] of Object.entries(this.solution))
      if (this.state.cells[k] === v && !this.state.revealed[k])
        this.state.awardedCells[k] = true;
    for (const [id, path] of Object.entries(this.wordPaths))
      if (
        path.every(
          (k) =>
            this.state.cells[k] === this.solution[k] && !this.state.revealed[k],
        )
      )
        this.state.awardedWords[id] = true;
  }
  check(scope = "word") {
    if (this.state.completed) return { wrong: 0, empty: 0 };
    const paths =
      scope === "all"
        ? Object.entries(this.wordPaths)
        : scope === "letter"
          ? [[`cell:${this.selected}`, [this.selected]]]
          : [[this.clueId, this.path]];
    let wrong = 0,
      empty = 0;
    const seen = new Set();
    for (const [id, path] of paths) {
      let bad = false;
      for (const k of path) {
        if (!this.state.cells[k]) {
          if (!seen.has(k)) empty++;
        } else {
          const correct = this.state.cells[k] === this.solution[k];
          this.feedback[k] = correct ? "correct" : "wrong";
          if (!correct) {
            if (!seen.has(k)) wrong++;
            bad = true;
          }
        }
        seen.add(k);
      }
      if (bad) {
        const signature = `${id}:${path.map((k) => this.state.cells[k] || "_").join("")}`;
        this.state.mistakeChecks[signature] = true;
      }
    }
    this.award();
    this.finish();
    return { wrong, empty };
  }
  reveal(scope = "letter") {
    if (this.state.completed) return false;
    const path = scope === "word" ? this.path : [this.selected],
      changed = path.filter((k) => this.state.cells[k] !== this.solution[k]);
    if (!changed.length) return false;
    for (const k of changed) {
      this.state.cells[k] = this.solution[k];
      this.state.revealed[k] = true;
      delete this.state.awardedCells[k];
      delete this.feedback[k];
      for (const id of this.members[k]) delete this.state.awardedWords[id];
    }
    this.state.hintsUsed++;
    this.state.hintCost +=
      scope === "word" ? POINTS.revealWord : POINTS.revealLetter;
    this.finish();
    return true;
  }
  finish() {
    if (this.state.completed || !this.isSolved()) return false;
    this.award();
    this.state.completed = true;
    this.state.completedAt = new Date().toISOString();
    this.state.speedBonus = speedBonus(
      this.puzzle.difficulty,
      this.state.elapsedSeconds,
    );
    return true;
  }
}
