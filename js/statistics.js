import { dateKey, dayNumber } from "./utils.js";
export function statistics(data, today = dateKey()) {
  const records = Object.values(data.puzzles),
    done = records.filter((r) => r.completions > 0 && r.bestTime !== null);
  const times = done.map((r) => r.bestTime),
    totalScore = done.reduce((s, r) => s + (r.bestScore || 0), 0);
  let longest = 0,
    run = 0,
    previous = -Infinity;
  const days = data.activity
    .map(dayNumber)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  for (const day of days) {
    run = day === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  let current = 0;
  const todayN = dayNumber(today);
  let n = days.includes(todayN) ? todayN : todayN - 1;
  const daySet = new Set(days);
  while (daySet.has(n--)) current++;
  const hints = records.reduce(
      (s, r) => s + r.archivedHints + r.attempt.hintsUsed,
      0,
    ),
    mistakes = records.reduce(
      (s, r) =>
        s + r.archivedMistakes + Object.keys(r.attempt.mistakeChecks).length,
      0,
    ),
    correct = records.reduce(
      (s, r) =>
        s +
        (r.archivedCorrect || 0) +
        Object.keys(r.attempt.awardedCells).filter(
          (k) => !r.attempt.revealed[k],
        ).length,
      0,
    );
  return {
    started: records.length,
    completed: done.length,
    percentage: records.length
      ? Math.round((done.length / records.length) * 100)
      : 0,
    totalScore,
    level: 1 + Math.floor(totalScore / 1500),
    average: times.length
      ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      : 0,
    fastest: times.length ? Math.min(...times) : 0,
    hints,
    accuracy:
      correct + mistakes
        ? Math.round((correct / (correct + mistakes)) * 100)
        : null,
    current,
    longest,
    noHints: done.filter((r) => r.noHints).length,
  };
}
export function recordCompletion(record, engine) {
  const a = engine.state;
  record.completions++;
  record.bestScore = Math.max(record.bestScore ?? 0, engine.score);
  record.bestTime =
    record.bestTime === null
      ? a.elapsedSeconds
      : Math.min(record.bestTime, a.elapsedSeconds);
  record.noHints ||= a.hintsUsed === 0;
  record.flawless ||= Object.keys(a.mistakeChecks).length === 0;
  record.fast ||= a.speedBonus > 0;
}
