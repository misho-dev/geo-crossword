import { escapeHTML as esc, key } from "./utils.js";
export function gridHTML(engine) {
  const p = engine.puzzle;
  let html = "";
  for (let r = 0; r < p.grid.rows; r++) {
    html += '<div class="grid-row" role="row">';
    for (let c = 0; c < p.grid.cols; c++) {
      const k = key(r, c);
      if (engine.blocks.has(k)) {
        html += '<div class="cell block" role="presentation"></div>';
        continue;
      }
      const num = engine.starts.get(k);
      html += `<button class="cell" data-cell="${k}" role="gridcell" aria-rowindex="${r + 1}" aria-colindex="${c + 1}" tabindex="-1" aria-label="რიგი ${r + 1}, სვეტი ${c + 1}">${num ? `<span class="number">${num}</span>` : ""}<span class="letter"></span></button>`;
    }
    html += "</div>";
  }
  return `<div class="crossword-grid" role="grid" aria-rowcount="${p.grid.rows}" aria-colcount="${p.grid.cols}" aria-label="კროსვორდის ბადე" style="--cols:${p.grid.cols}">${html}</div>`;
}
export function paintGrid(engine, autoCheck = false) {
  const path = new Set(engine.path);
  for (const el of document.querySelectorAll("[data-cell]")) {
    const k = el.dataset.cell,
      value = engine.state.cells[k] || "";
    el.querySelector(".letter").textContent = value;
    el.classList.toggle("word", path.has(k));
    el.classList.toggle("active", k === engine.selected);
    el.classList.toggle("revealed", !!engine.state.revealed[k]);
    el.classList.toggle(
      "wrong",
      !!value &&
        (autoCheck
          ? value !== engine.solution[k]
          : engine.feedback[k] === "wrong"),
    );
    el.classList.toggle("correct", engine.feedback[k] === "correct");
    el.setAttribute("aria-selected", String(k === engine.selected));
    const [r, c] = k.split(",").map(Number);
    el.setAttribute(
      "aria-label",
      `რიგი ${r + 1}, სვეტი ${c + 1}, ${value || "ცარიელი"}${engine.starts.get(k) ? `, ნომერი ${engine.starts.get(k)}` : ""}`,
    );
    el.tabIndex = k === engine.selected ? 0 : -1;
  }
}
export function cluesHTML(engine, direction) {
  return engine.puzzle.clues
    .filter((cl) => cl.direction === direction)
    .map(
      (cl) =>
        `<button class="clue-button ${cl.id === engine.clueId ? "selected" : ""}" data-clue="${esc(cl.id)}" aria-pressed="${cl.id === engine.clueId}"><span class="clue-number">${cl.number}</span><span>${esc(cl.clue)} <span class="clue-length">(${[...cl.answer].length})</span></span></button>`,
    )
    .join("");
}
