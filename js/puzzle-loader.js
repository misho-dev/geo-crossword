import { key } from "./utils.js";
import { ALPHABET } from "./keyboard.js";
export function validatePuzzle(p) {
  const fail = (message) => {
    throw new Error(`კროსვორდის მონაცემები დაზიანებულია: ${message}`);
  };
  if (
    !p ||
    p.schemaVersion !== 1 ||
    !/^[a-z0-9][a-z0-9-]{0,79}$/.test(p.id || "")
  )
    fail("იდენტიფიკატორი");
  if (
    typeof p.title !== "string" ||
    !p.title.trim() ||
    !["easy", "medium", "hard"].includes(p.difficulty)
  )
    fail("აღწერა");
  const { rows, cols, blocked } = p.grid || {};
  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(cols) ||
    rows < 2 ||
    cols < 2 ||
    rows > 60 ||
    cols > 60 ||
    !Array.isArray(blocked)
  )
    fail("ზომა");
  const blocks = new Set();
  for (const pair of blocked) {
    if (!Array.isArray(pair) || pair.length !== 2) fail("შავი უჯრა");
    const [r, c] = pair;
    if (
      !Number.isInteger(r) ||
      !Number.isInteger(c) ||
      r < 0 ||
      c < 0 ||
      r >= rows ||
      c >= cols ||
      blocks.has(key(r, c))
    )
      fail("შავი უჯრა");
    blocks.add(key(r, c));
  }
  if (!Array.isArray(p.clues) || !p.clues.length || p.clues.length > 500)
    fail("კითხვები");
  const solution = {},
    members = {},
    ids = new Set(),
    starts = new Map(),
    wordPaths = {};
  for (const clue of p.clues) {
    const { id, number, direction, row, col, answer } = clue;
    if (
      typeof id !== "string" ||
      ids.has(id) ||
      !Number.isInteger(number) ||
      number < 1 ||
      !["across", "down"].includes(direction) ||
      !Number.isInteger(row) ||
      !Number.isInteger(col) ||
      typeof clue.clue !== "string" ||
      !clue.clue.trim()
    )
      fail("კითხვა");
    ids.add(id);
    if (
      typeof answer !== "string" ||
      answer !== answer.normalize("NFC") ||
      [...answer].length < 2 ||
      [...answer].some((x) => !ALPHABET.includes(x)) ||
      (clue.length !== undefined && clue.length !== [...answer].length)
    )
      fail("პასუხი");
    const path = [];
    [...answer].forEach((letter, i) => {
      const r = row + (direction === "down" ? i : 0),
        c = col + (direction === "across" ? i : 0),
        k = key(r, c);
      if (
        r < 0 ||
        c < 0 ||
        r >= rows ||
        c >= cols ||
        blocks.has(k) ||
        (solution[k] && solution[k] !== letter)
      )
        fail("გადაკვეთა");
      if (
        (members[k] || []).some(
          (x) => p.clues.find((y) => y.id === x).direction === direction,
        )
      )
        fail("დუბლირებული სიტყვა");
      solution[k] = letter;
      (members[k] ??= []).push(id);
      path.push(k);
    });
    wordPaths[id] = path;
    const start = key(row, col);
    if (starts.has(start) && starts.get(start) !== number) fail("ნუმერაცია");
    starts.set(start, number);
  }
  if (Object.keys(solution).length + blocks.size !== rows * cols)
    fail("ცარიელი უჯრა");
  const sorted = [...starts].sort((a, b) => {
    const [r, c] = a[0].split(",").map(Number),
      [rr, cc] = b[0].split(",").map(Number);
    return r - rr || c - cc;
  });
  if (sorted.some(([, n], i) => n !== i + 1)) fail("ნუმერაცია");
  // Every contiguous run of two or more open cells must have exactly one clue.
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      for (const direction of ["across", "down"]) {
        const k = key(r, c);
        if (!solution[k]) continue;
        const dr = direction === "down" ? 1 : 0,
          dc = direction === "across" ? 1 : 0;
        if (solution[key(r - dr, c - dc)]) continue;
        const run = [];
        let rr = r,
          cc = c;
        while (solution[key(rr, cc)]) {
          run.push(key(rr, cc));
          rr += dr;
          cc += dc;
        }
        if (
          run.length > 1 &&
          !p.clues.some(
            (cl) =>
              cl.direction === direction &&
              wordPaths[cl.id].join("|") === run.join("|"),
          )
        )
          fail("დაკარგული კითხვა");
      }
  const visited = new Set(),
    queue = [Object.keys(solution)[0]];
  while (queue.length) {
    const k = queue.pop();
    if (visited.has(k)) continue;
    visited.add(k);
    const [r, c] = k.split(",").map(Number);
    for (const n of [
      key(r - 1, c),
      key(r + 1, c),
      key(r, c - 1),
      key(r, c + 1),
    ])
      if (solution[n] && !visited.has(n)) queue.push(n);
  }
  if (visited.size !== Object.keys(solution).length)
    fail("დაუკავშირებელი ბადე");
  return { solution, members, wordPaths, blocks, starts };
}
export async function loadCatalog(signal) {
  const response = await fetch("./data/puzzles/index.json", {
    signal,
    cache: "no-cache",
  });
  if (!response.ok)
    throw new Error("კროსვორდების სია ვერ ჩაიტვირთა. შეამოწმეთ კავშირი.");
  const data = await response.json();
  if (
    data.schemaVersion !== 1 ||
    !Array.isArray(data.puzzles) ||
    !data.puzzles.length
  )
    throw new Error("კროსვორდების სია დაზიანებულია.");
  const ids = new Set();
  for (const p of data.puzzles) {
    if (
      !/^[a-z0-9][a-z0-9-]{0,79}$/.test(p.id) ||
      ids.has(p.id) ||
      typeof p.title !== "string"
    )
      throw new Error("კროსვორდების სია დაზიანებულია.");
    ids.add(p.id);
  }
  return data;
}
export async function loadPuzzle(id, signal) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id))
    throw new Error("კროსვორდი ვერ მოიძებნა.");
  const response = await fetch(`./data/puzzles/${id}.json`, { signal });
  if (!response.ok)
    throw new Error(
      "კროსვორდი ვერ ჩაიტვირთა. ინტერნეტის გარეშე გახსენით ადრე ნათამაშები კროსვორდი.",
    );
  const p = await response.json();
  if (p.id !== id) throw new Error("კროსვორდის ნომერი არ ემთხვევა.");
  validatePuzzle(p);
  return p;
}
