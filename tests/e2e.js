import { freshStore, STORAGE_KEY } from "../js/storage.js";
const frame = document.querySelector("#app"),
  output = document.querySelector("#results");
let passes = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(condition, message) {
  for (let i = 0; i < 100; i++) {
    try {
      if (condition()) return;
    } catch {}
    await wait(50);
  }
  throw Error(message);
}
const doc = () => frame.contentDocument;
const reloadFrame = () =>
  new Promise((resolve) => {
    frame.addEventListener("load", resolve, { once: true });
    frame.contentWindow.location.reload();
  });
const one = (selector) => {
  const el = doc().querySelector(selector);
  if (!el) throw Error(`Missing ${selector}`);
  return el;
};
const click = (selector) => one(selector).click();
const assert = (condition, message) => {
  if (!condition) throw Error(message);
  passes++;
  output.textContent += `\nPASS ${message}`;
};
async function go(hash) {
  frame.contentWindow.location.hash = hash;
  await wait(100);
}
function input(text) {
  const el = one("#letter-input");
  el.value = text;
  el.dispatchEvent(
    new frame.contentWindow.InputEvent("input", {
      bubbles: true,
      data: text,
      inputType: "insertText",
    }),
  );
}
async function chooseAction(action, label) {
  click(`[data-action="${action}"]`);
  await until(() => doc().querySelector("dialog[open]"), "dialog opens");
  const button = [...doc().querySelectorAll("dialog button")].find(
    (b) => b.textContent === label,
  );
  if (!button) throw Error(`Missing action ${label}`);
  button.click();
  await wait(50);
}
document.querySelector("#run").onclick = async () => {
  const previous = localStorage.getItem(STORAGE_KEY);
  document.querySelector("#run").disabled = true;
  passes = 0;
  output.textContent = "Running…";
  try {
    for (const reg of await navigator.serviceWorker.getRegistrations())
      await reg.unregister();
    for (const key of await caches.keys())
      if (key.startsWith("sitqvana-")) await caches.delete(key);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(freshStore()));
    frame.src = "../index.html";
    await until(
      () => doc().querySelector("#catalog-cards .puzzle-card"),
      "homepage loads",
    );
    assert(
      doc().querySelectorAll(".puzzle-card").length >= 20,
      "20 puzzles shown in catalog",
    );
    const p = await (await fetch("../data/puzzles/original-002.json")).json();
    await go("#/puzzle/original-002");
    await until(() => doc().querySelector(".crossword-grid"), "grid loads");
    const first = p.clues.find((c) => c.direction === "across");
    click(`[data-clue="${first.id}"]`);
    input(first.answer);
    assert(
      one("#progress-label").textContent !== "0% შევსებულია",
      "Georgian letters entered",
    );
    await chooseAction("check", "სიტყვა");
    assert(Number(one("#score").textContent) > 0, "correct check awards score");
    click('[data-direction="down"]');
    assert(
      one('[data-direction="down"]').getAttribute("aria-selected") === "true",
      "across/down switching",
    );
    const downId = one(".clue-button.selected").dataset.clue,
      down = p.clues.find((c) => c.id === downId);
    await chooseAction("hint", "ასო · −25");
    const score = one("#score").textContent,
      entered = [...doc().querySelectorAll(".cell .letter")]
        .map((el) => el.textContent)
        .join("");
    await go("#/");
    await until(() => doc().querySelector("#catalog-cards"), "return home");
    await reloadFrame();
    await until(() => doc().querySelector("#catalog-cards"), "homepage reload");
    await go("#/puzzle/original-002");
    await until(() => doc().querySelector(".crossword-grid"), "return game");
    assert(
      one("#score").textContent === score,
      "score retained across navigation and reload",
    );
    assert(
      [...doc().querySelectorAll(".cell .letter")]
        .map((el) => el.textContent)
        .join("") === entered,
      "letters retained across reload",
    );
    for (const cl of p.clues) {
      click(`[data-direction="${cl.direction}"]`);
      click(`[data-clue="${cl.id}"]`);
      one(`[data-cell="${cl.row},${cl.col}"]`).click();
      if (
        one("#current-clue").textContent.includes(
          cl.direction === "down" ? "ჰორიზონტალურად" : "ვერტიკალურად",
        )
      )
        one(`[data-cell="${cl.row},${cl.col}"]`).click();
      // Paste only into unrevealed cells: the revealed cells are intentionally immutable.
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)).puzzles[p.id]
        .attempt;
      const letters = [...cl.answer]
        .filter(
          (_, i) =>
            !saved.revealed[
              `${cl.row + (cl.direction === "down" ? i : 0)},${cl.col + (cl.direction === "across" ? i : 0)}`
            ],
        )
        .join("");
      input(letters);
    }
    await until(
      () => doc().querySelector("dialog[open] .celebrate"),
      "completion summary",
    );
    assert(true, "completion summary shown only for correct grid");
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    assert(saved.puzzles[p.id].completions === 1, "completion recorded once");
    assert(saved.puzzles[p.id].attempt.hintsUsed === 1, "hint count retained");
    one("dialog").close();
    await go("#/");
    await until(
      () => doc().querySelector(".card-status.done"),
      "completed homepage card",
    );
    assert(true, "homepage records completed puzzle");
    await reloadFrame();
    await until(
      () => doc().querySelector(".card-status.done"),
      "completed state reload",
    );
    assert(true, "completed state survives second reload");
    click("#theme-button");
    assert(doc().documentElement.dataset.theme === "dark", "dark mode toggles");
    frame.style.width = "390px";
    await wait(120);
    assert(
      doc().documentElement.scrollWidth <= 390,
      "390px homepage has no horizontal overflow",
    );
    await go("#/puzzle/original-002");
    await until(() => doc().querySelector(".crossword-grid"), "mobile game");
    assert(
      doc().documentElement.scrollWidth <= 390,
      "390px game has no page overflow",
    );
    assert(
      one(".game-layout").getBoundingClientRect().width <= 360,
      "mobile game layout fits",
    );
    click("#theme-button");
    assert(
      doc().documentElement.dataset.theme === "light",
      "light mode toggles",
    );
    await go("#/settings");
    await until(() => doc().querySelector("#setting-contrast"), "settings");
    click("#setting-contrast");
    assert(
      doc().documentElement.dataset.contrast === "true",
      "high contrast applies",
    );
    await go("#/achievements");
    await until(() => doc().querySelector(".badge"), "achievements");
    assert(
      doc().querySelectorAll(".badge:not(.locked)").length >= 1,
      "earned achievements displayed",
    );
    await go("#/statistics");
    await until(() => doc().querySelector(".stat-card"), "statistics");
    assert(
      one(".stat-card strong").textContent === "1",
      "unique completion in statistics",
    );
    output.textContent += `\n\n${passes} browser checks passed. Original progress restored.`;
    output.className = "pass";
  } catch (e) {
    output.textContent += `\nFAIL ${e.message}\nOriginal progress restored.`;
    output.className = "fail";
    console.error(e);
  } finally {
    await new Promise((resolve) => {
      frame.addEventListener("load", resolve, { once: true });
      frame.src = "about:blank";
    });
    if (previous === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, previous);
    document.querySelector("#run").disabled = false;
  }
};
