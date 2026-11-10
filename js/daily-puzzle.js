import { dateKey, dayNumber } from "./utils.js";
export function dailyPuzzle(catalog, date = dateKey()) {
  const items = [...catalog.puzzles].sort((a, b) => a.id.localeCompare(b.id));
  return items[
    ((dayNumber(date) % items.length) + items.length) % items.length
  ];
}
