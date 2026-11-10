import { newAttempt } from "./crossword-engine.js";
import { bounded } from "./utils.js";
export const STORAGE_KEY = "sitqvana.progress";
export const DEFAULT_SETTINGS = {
  theme: "light",
  transliteration: false,
  keyboard: false,
  autoCheck: false,
  zen: false,
  contrast: false,
  largeCells: false,
  sound: false,
};
export const freshStore = () => ({
  version: 2,
  puzzles: {},
  settings: { ...DEFAULT_SETTINGS },
  favorites: [],
  activity: [],
  achievements: [],
  activePuzzleId: null,
});
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const safeId = (id) => /^[a-z0-9][a-z0-9-]{0,79}$/.test(id);
const map = (value, kind = "bool") => {
  const out = {};
  if (!object(value)) return out;
  for (const [k, v] of Object.entries(value).slice(0, 5000)) {
    if (k.length > 300 || ["__proto__", "constructor", "prototype"].includes(k))
      continue;
    if (kind === "cell" && /^\d{1,2},\d{1,2}$/.test(k) && /^[ა-ჰ]$/u.test(v))
      out[k] = v;
    else if (kind === "bool" && v === true) out[k] = true;
  }
  return out;
};
export function cleanAttempt(raw = {}) {
  const a = newAttempt();
  if (!object(raw)) return a;
  for (const k of ["elapsedSeconds", "hintsUsed", "hintCost", "speedBonus"])
    a[k] = bounded(raw[k], k === "speedBonus" ? 100 : 1e7);
  a.cells = map(raw.cells, "cell");
  for (const k of ["revealed", "awardedCells", "awardedWords", "mistakeChecks"])
    a[k] = map(raw[k]);
  a.completed = raw.completed === true;
  a.completedAt =
    typeof raw.completedAt === "string" &&
    Number.isFinite(Date.parse(raw.completedAt))
      ? raw.completedAt
      : null;
  return a;
}
export function newRecord() {
  return {
    attempt: newAttempt(),
    bestScore: null,
    bestTime: null,
    completions: 0,
    noHints: false,
    flawless: false,
    fast: false,
    archivedHints: 0,
    archivedMistakes: 0,
    archivedCorrect: 0,
    archivedSeconds: 0,
    lastPlayed: null,
  };
}
export function validateSave(raw) {
  if (!object(raw) || ![1, 2].includes(raw.version) || !object(raw.puzzles))
    throw new Error("შენახული მონაცემების ფორმატი არასწორია.");
  const data = freshStore();
  for (const [id, r] of Object.entries(raw.puzzles).slice(0, 2000)) {
    if (!safeId(id) || !object(r)) continue;
    const record = newRecord();
    record.attempt = cleanAttempt(
      raw.version === 1 ? r.attempt || r : r.attempt,
    );
    for (const k of [
      "completions",
      "archivedHints",
      "archivedMistakes",
      "archivedCorrect",
      "archivedSeconds",
    ])
      record[k] = bounded(r[k]);
    for (const k of ["bestScore", "bestTime"])
      record[k] = Number.isFinite(r[k]) ? bounded(r[k], 1e7) : null;
    for (const k of ["noHints", "flawless", "fast"]) record[k] = r[k] === true;
    if (raw.version === 1 && record.attempt.completed && !record.completions) {
      record.completions = 1;
      record.bestScore = bounded(r.score, 1e7);
      record.bestTime = record.attempt.elapsedSeconds;
      record.noHints = record.attempt.hintsUsed === 0;
    }
    record.lastPlayed =
      typeof r.lastPlayed === "string" &&
      Number.isFinite(Date.parse(r.lastPlayed))
        ? r.lastPlayed
        : null;
    data.puzzles[id] = record;
  }
  if (object(raw.settings))
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      if (k === "theme") {
        if (["light", "dark"].includes(raw.settings.theme))
          data.settings.theme = raw.settings.theme;
      } else if (typeof raw.settings[k] === "boolean")
        data.settings[k] = raw.settings[k];
    }
  for (const k of ["favorites", "achievements"])
    data[k] = Array.isArray(raw[k])
      ? [
          ...new Set(raw[k].filter((x) => typeof x === "string" && safeId(x))),
        ].slice(0, 2000)
      : [];
  data.activity = Array.isArray(raw.activity)
    ? [
        ...new Set(
          raw.activity.filter(
            (x) =>
              typeof x === "string" &&
              /^\d{4}-\d{2}-\d{2}$/.test(x) &&
              Number.isFinite(Date.parse(x)),
          ),
        ),
      ]
        .sort()
        .slice(-20000)
    : [];
  data.activePuzzleId = safeId(raw.activePuzzleId || "")
    ? raw.activePuzzleId
    : null;
  return data;
}
export class Storage {
  constructor(backend, onError = () => {}) {
    this.onError = onError;
    this.backend = backend;
    this.data = freshStore();
    this.failed = false;
    this.blocked = false;
    try {
      const raw = backend?.getItem(STORAGE_KEY);
      if (raw) this.data = validateSave(JSON.parse(raw));
    } catch (e) {
      this.blocked = true;
      this.problem(
        "შენახული პროგრესი ვერ აღდგა. თავდაპირველი მონაცემები არ შეცვლილა. პარამეტრებიდან შემოიტანეთ სარეზერვო ასლი ან გაასუფთავეთ მონაცემები.",
      );
    }
  }
  problem(message) {
    if (!this.failed) this.onError(message);
    this.failed = true;
  }
  save() {
    if (this.blocked) return false;
    try {
      if (!this.backend) throw Error("unavailable");
      this.backend.setItem(STORAGE_KEY, JSON.stringify(this.data));
      this.failed = false;
      return true;
    } catch {
      this.problem(
        "პროგრესი ვერ შეინახა. ჩამოტვირთეთ სარეზერვო ასლი პარამეტრებიდან.",
      );
      return false;
    }
  }
  get(id) {
    if (!Object.hasOwn(this.data.puzzles, id))
      this.data.puzzles[id] = newRecord();
    return this.data.puzzles[id];
  }
  export() {
    return JSON.stringify(this.data, null, 2);
  }
  import(text) {
    if (text.length > 10e6) throw Error("ფაილი მეტისმეტად დიდია.");
    const next = validateSave(JSON.parse(text));
    this.data = next;
    this.blocked = false;
    return this.save();
  }
  resetPuzzle(id) {
    const r = this.get(id);
    r.archivedHints += r.attempt.hintsUsed;
    r.archivedMistakes += Object.keys(r.attempt.mistakeChecks).length;
    r.archivedCorrect += Object.keys(r.attempt.awardedCells).filter(
      (k) => !r.attempt.revealed[k],
    ).length;
    r.archivedSeconds += r.attempt.elapsedSeconds;
    r.attempt = newAttempt();
    this.save();
  }
  resetAll() {
    this.data = freshStore();
    this.blocked = false;
    return this.save();
  }
}
