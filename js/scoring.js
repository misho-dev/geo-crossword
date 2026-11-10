export const POINTS = Object.freeze({
  letter: 10,
  word: 25,
  completion: 200,
  unassisted: 150,
  mistake: 5,
  revealLetter: 25,
  revealWord: 100,
});
export const SPEED_TARGET = Object.freeze({
  easy: 360,
  medium: 720,
  hard: 1200,
});
export function calculateScore(a) {
  const letters = Object.keys(a.awardedCells).filter(
    (k) => !a.revealed[k],
  ).length;
  const base =
    letters * POINTS.letter + Object.keys(a.awardedWords).length * POINTS.word;
  const bonus = a.completed
    ? POINTS.completion +
      (a.hintsUsed === 0 ? POINTS.unassisted : 0) +
      (a.speedBonus || 0)
    : 0;
  return Math.max(
    0,
    Math.min(
      10000000,
      base +
        bonus -
        a.hintCost -
        Object.keys(a.mistakeChecks).length * POINTS.mistake,
    ),
  );
}
export function speedBonus(difficulty, seconds) {
  return Math.max(
    0,
    Math.round(100 * (1 - seconds / SPEED_TARGET[difficulty])),
  );
}
