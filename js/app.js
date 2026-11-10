import { loadCatalog, loadPuzzle } from "./puzzle-loader.js";
import { CrosswordEngine } from "./crossword-engine.js";
import { Storage } from "./storage.js";
import { ALPHABET, LATIN_MAP, parseInput } from "./keyboard.js";
import { gridHTML, paintGrid, cluesHTML } from "./crossword-renderer.js";
import { statistics, recordCompletion } from "./statistics.js";
import { ACHIEVEMENTS, unlockAchievements } from "./achievements.js";
import { dailyPuzzle } from "./daily-puzzle.js";
import {
  escapeHTML as esc,
  formatTime,
  dateKey,
  georgianDate,
  difficultyName,
} from "./utils.js";
import { currentRoute, navigate } from "./router.js";

const main = document.querySelector("#main"),
  dialog = document.querySelector("#dialog");
function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.querySelector("#notifications").append(el);
  setTimeout(() => el.remove(), 7000);
}
let backend;
try {
  backend = window.localStorage;
} catch {}
const store = new Storage(backend, (m) => setTimeout(() => toast(m), 100));
let catalog,
  engine = null,
  loadController = null,
  routeSerial = 0,
  paused = false,
  lastTick = performance.now(),
  timeRemainder = 0,
  lastActivity = Date.now(),
  completionRecorded = false,
  clueDirection = "across",
  audioContext;
let catalogFilter = "all",
  searchText = "",
  difficultyFilter = "all";
const settings = () => store.data.settings;
function applySettings() {
  document.documentElement.dataset.theme = settings().theme;
  document.documentElement.dataset.contrast = String(settings().contrast);
  document.body.classList.toggle("zen", settings().zen);
  document
    .querySelector("#theme-button")
    .setAttribute(
      "aria-label",
      settings().theme === "dark"
        ? "ნათელ თემაზე გადასვლა"
        : "მუქ თემაზე გადასვლა",
    );
}
function modal(content, actions = [{ label: "დახურვა" }]) {
  if (dialog.open) dialog.close();
  dialog.innerHTML = content;
  const row = document.createElement("div");
  row.className = "modal-actions";
  for (const a of actions) {
    const b = document.createElement("button");
    b.className = `button ${a.secondary ? "secondary" : ""}`;
    b.textContent = a.label;
    b.onclick = () => {
      dialog.close();
      a.action?.();
    };
    row.append(b);
  }
  dialog.append(row);
  dialog.showModal();
}
function confirmAction(title, description, action) {
  modal(`<h2>${esc(title)}</h2><p>${esc(description)}</p>`, [
    { label: "გაუქმება", secondary: true },
    { label: "დადასტურება", action },
  ]);
}
function sound() {
  if (!settings().sound) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator(),
      gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.frequency.setValueAtTime(660, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      990,
      audioContext.currentTime + 0.12,
    );
    gain.gain.setValueAtTime(0.035, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + 0.3,
    );
    osc.start();
    osc.stop(audioContext.currentTime + 0.3);
  } catch {}
}
function save() {
  store.save();
}
function updateTime() {
  const now = performance.now(),
    delta = (now - lastTick) / 1000;
  lastTick = now;
  if (
    !engine ||
    paused ||
    engine.state.completed ||
    document.hidden ||
    !document.hasFocus() ||
    dialog.open ||
    Date.now() - lastActivity > 300000
  )
    return;
  timeRemainder += Math.min(delta, 5);
  const whole = Math.floor(timeRemainder);
  if (whole) {
    engine.state.elapsedSeconds += whole;
    timeRemainder -= whole;
    const el = document.querySelector("#elapsed");
    if (el) el.textContent = formatTime(engine.state.elapsedSeconds);
  }
}
setInterval(() => {
  updateTime();
  if (
    engine &&
    !paused &&
    !engine.state.completed &&
    Math.floor(engine.state.elapsedSeconds) % 10 === 0
  )
    save();
}, 1000);
function markActivity() {
  lastActivity = Date.now();
  if (!engine) return;
  const today = dateKey();
  if (!store.data.activity.includes(today)) store.data.activity.push(today);
  const record = store.get(engine.puzzle.id);
  record.lastPlayed = new Date().toISOString();
  store.data.activePuzzleId = engine.puzzle.id;
}
function changed(meaningful = true) {
  if (meaningful) markActivity();
  if (engine.state.completed && !completionRecorded) {
    completionRecorded = true;
    recordCompletion(store.get(engine.puzzle.id), engine);
    sound();
    setTimeout(showCompletion, 200);
  }
  const newly = unlockAchievements(store.data);
  save();
  paintGame();
  for (const id of newly) {
    const a = ACHIEVEMENTS.find((a) => a.id === id);
    toast(`ახალი მიღწევა: ${a.title}`);
  }
}
function focusEntry() {
  const input = document.querySelector("#letter-input");
  if (!paused && !engine?.state.completed)
    input?.focus({ preventScroll: true });
}
function gameAction(action) {
  if (!engine || paused) return;
  updateTime();
  const before = JSON.stringify(engine.state);
  const wasComplete = engine.state.completed;
  const result = action();
  if (
    (result !== false && before !== JSON.stringify(engine.state)) ||
    (!wasComplete && engine.state.completed)
  )
    changed();
  else paintGame();
  focusEntry();
}

function miniGrid(seed = 1) {
  return `<span class="mini-grid" aria-hidden="true">${Array.from({ length: 25 }, (_, i) => `<i class="${(i * 7 + seed) % 5 < 2 ? "filled" : ""}"></i>`).join("")}</span>`;
}
function decorativeGrid() {
  const rows = [
      "...####",
      "...#...",
      ".......",
      "#......",
      ".......",
      "...#...",
      "####...",
    ],
    word = "სიტყვა";
  return `<div class="decor-grid" aria-hidden="true">${rows.flatMap((row, r) => [...row].map((v, c) => `<span class="decor-cell ${v === "#" ? "block" : ""} ${r === 3 && v !== "#" ? "tint" : ""}">${r === 3 && c > 0 && c < 7 ? word[c - 1] : r === 2 && c === 3 ? "ი" : ""}</span>`)).join("")}</div>`;
}
function entryPercent(p) {
  const a = store.data.puzzles[p.id]?.attempt;
  return a ? Math.round((Object.keys(a.cells).length / p.cellCount) * 100) : 0;
}
function card(p, i) {
  const record = store.data.puzzles[p.id],
    complete = record?.completions > 0,
    percent = entryPercent(p),
    started = !!record;
  return `<article class="puzzle-card"><div class="card-top">${miniGrid(i)}<span class="difficulty ${p.difficulty}">${difficultyName(p.difficulty)}</span></div><h3><a href="#/puzzle/${p.id}" class="card-link">${esc(p.title)}</a></h3><button class="favorite" data-favorite="${p.id}" aria-label="რჩეულებში ${store.data.favorites.includes(p.id) ? "ამოშლა" : "დამატება"}: ${esc(p.title)}" aria-pressed="${store.data.favorites.includes(p.id)}">${store.data.favorites.includes(p.id) ? "★" : "☆"}</button><div class="card-meta">${p.rows} × ${p.cols} ბადე &nbsp; · &nbsp; ${p.clueCount} კითხვა</div><div class="card-bottom"><span class="card-status ${complete ? "done" : ""}">${complete ? "✓ ამოხსნილია" : started ? `შევსებულია ${Math.min(100, percent)}%` : `დაახლოებით ${p.estimatedMinutes} წუთი`}</span><span class="card-arrow">↗</span></div>${started && !complete ? `<div class="card-progress"><span style="width:${Math.min(100, percent)}%"></span></div>` : ""}</article>`;
}
function renderCards() {
  const items = catalog.puzzles.filter(
    (p) =>
      (!searchText || `${p.title} ${p.category}`.includes(searchText)) &&
      (difficultyFilter === "all" || p.difficulty === difficultyFilter) &&
      (catalogFilter === "all" ||
        (catalogFilter === "favorites" &&
          store.data.favorites.includes(p.id)) ||
        (catalogFilter === "progress" &&
          store.data.puzzles[p.id] &&
          !store.data.puzzles[p.id].attempt.completed) ||
        (catalogFilter === "completed" &&
          store.data.puzzles[p.id]?.completions > 0)),
  );
  document.querySelector("#catalog-cards").innerHTML = items.length
    ? items.map(card).join("")
    : '<div class="empty">კროსვორდი ვერ მოიძებნა. სცადეთ სხვა ფილტრი.</div>';
  document.querySelector("#catalog-count").textContent =
    `${items.length} კროსვორდი · აირჩიეთ თქვენი შემდეგი აღმოჩენა`;
}
function home() {
  const stats = statistics(store.data),
    daily = dailyPuzzle(catalog),
    unfinished = catalog.puzzles
      .filter(
        (p) =>
          store.data.puzzles[p.id] &&
          !store.data.puzzles[p.id].attempt.completed,
      )
      .sort((a, b) =>
        (store.data.puzzles[b.id].lastPlayed || "").localeCompare(
          store.data.puzzles[a.id].lastPlayed || "",
        ),
      ),
    resume = unfinished[0];
  main.innerHTML = `<div class="page-top"><div class="eyebrow">დრო საკუთარი თავისთვის</div><div class="date-label">${georgianDate()}</div></div><section class="hero"><div class="hero-copy"><span class="pill">✦ დღის კროსვორდი</span><h1>ერთი სიტყვით<br>ყველაფერი იწყება.</h1><p>შეისვენეთ ყოველდღიურობისგან. იპოვეთ ნაცნობი სიტყვები, აღმოაჩინეთ ახალი და შეავსეთ თქვენი დღე.</p><a class="button" href="#/puzzle/${daily.id}">დაიწყეთ თამაში <span>↗</span></a></div><div class="hero-art"><span class="hero-tag">ყოველი უჯრა — ახალი აღმოჩენა</span>${decorativeGrid()}<span class="art-note">✧ &nbsp; ${esc(daily.title)} · ${difficultyName(daily.difficulty)}</span></div></section><section class="stats-strip" aria-label="პირადი სტატისტიკა">${[
    ["◎", stats.completed, "ამოხსნილი"],
    ["✧", stats.totalScore.toLocaleString("ka-GE"), "სულ ქულა"],
    ["♧", stats.current, "დღე ზედიზედ"],
    ["↗", stats.level, "დონე"],
  ]
    .map(
      ([icon, n, label]) =>
        `<div class="strip-stat"><span class="stat-icon" aria-hidden="true">${icon}</span><div><strong>${n}</strong><span>${label}</span></div></div>`,
    )
    .join(
      "",
    )}</section>${resume ? `<section class="continue-panel"><div><p>გააგრძელეთ იქიდან, სადაც შეჩერდით</p><h3>${esc(resume.title)} · ${entryPercent(resume)}%</h3></div><a class="button small secondary" href="#/puzzle/${resume.id}">გაგრძელება →</a></section>` : ""}<section aria-labelledby="catalog-heading"><div class="section-heading"><div><h2 id="catalog-heading">იპოვეთ თქვენი კროსვორდი</h2><p id="catalog-count"></p></div><button class="text-button" id="random-puzzle">⇄ &nbsp; შემთხვევითი არჩევანი</button></div><div class="catalog-tools"><div class="search"><span aria-hidden="true">⌕</span><input id="search" type="search" aria-label="კროსვორდის ძებნა" placeholder="მოძებნეთ კროსვორდი…" value="${esc(searchText)}"></div><select id="difficulty" aria-label="სირთულე"><option value="all">ყველა სირთულე</option value="easy">მარტივი</option><option value="medium">საშუალო</option><option value="hard">რთული</option></select><div class="filter-tabs" aria-label="პროგრესის ფილტრი">${[
    ["all", "ყველა"],
    ["progress", "დაწყებული"],
    ["completed", "ამოხსნილი"],
    ["favorites", "რჩეულები"],
  ]
    .map(
      ([id, label]) =>
        `<button data-filter="${id}" aria-pressed="${catalogFilter === id}">${label}</button>`,
    )
    .join(
      "",
    )}</div></div><div class="puzzle-cards" id="catalog-cards"></div><p class="game-note">ორიგინალური ქართული კროსვორდების კოლექცია · პროგრესი ავტომატურად ინახება ამ ბრაუზერში.</p></section>`;
  document.querySelector("#difficulty").value = difficultyFilter;
  renderCards();
  document.querySelector("#search").oninput = (e) => {
    searchText = e.target.value;
    renderCards();
  };
  document.querySelector("#difficulty").onchange = (e) => {
    difficultyFilter = e.target.value;
    renderCards();
  };
  document.querySelector("#random-puzzle").onclick = () => {
    const pool = catalog.puzzles.filter(
      (p) => !store.data.puzzles[p.id]?.completions,
    );
    navigate(
      `puzzle/${(pool.length ? pool : catalog.puzzles)[Math.floor(Math.random() * (pool.length || catalog.puzzles.length))].id}`,
    );
  };
}

function keyboardHTML() {
  const rows = ["ქწერტყუიოპ", "ასდფგჰჯკლ", "ზხცვბნმ", "თჟღშჩძჭ"];
  return `<div class="keyboard" aria-label="ქართული კლავიატურა">${rows.map((row, i) => `<div class="keyboard-row">${[...row].map((letter) => `<button data-letter="${letter}" aria-label="ასო ${letter}">${letter}</button>`).join("")}${i === 3 ? '<button class="wide" data-action="backspace" aria-label="წაშლა">⌫</button><button class="wide" data-action="next" aria-label="შემდეგი სიტყვა">→</button>' : ""}</div>`).join("")}</div>`;
}
function gameHTML() {
  const p = engine.puzzle;
  main.innerHTML = `<a class="text-button" href="#/">← ყველა კროსვორდი</a><div class="game-heading"><div><div class="eyebrow">${difficultyName(p.difficulty)} · ${p.clues.length} კითხვა</div><h1>${esc(p.title)}</h1></div><div class="game-stats"><div><strong id="score">${engine.score}</strong><span>ქულა</span></div><div id="time-block"><strong id="elapsed">${formatTime(engine.state.elapsedSeconds)}</strong><span>დრო</span></div><button class="icon-button" data-action="pause" aria-label="პაუზა" title="პაუზა">Ⅱ</button></div></div><div id="completion-banner"></div><div class="game-layout"><section class="board-panel" aria-label="თამაში"><div class="board-wrapper"><div class="board-scroll">${gridHTML(engine)}</div><div class="board-foot"><span id="progress-label"></span><div class="progress-track"><span id="progress-bar"></span></div><span>${p.grid.rows} × ${p.grid.cols}</span></div><div id="pause-cover" class="pause-cover hidden"><h2>პატარა შესვენება</h2><p>დრო შეჩერებულია. დაბრუნდით, როცა მზად იქნებით.</p><button class="button" data-action="resume">თამაშის გაგრძელება →</button></div></div><div class="selected-clue"><button data-action="previous" aria-label="წინა კითხვა">‹</button><div class="current-text" id="current-clue" aria-live="polite"></div><button data-action="next" aria-label="შემდეგი კითხვა">›</button></div><div class="game-toolbar"><button class="tool accent" data-action="check">✓ შემოწმება</button><button class="tool accent" data-action="hint">✧ მინიშნება</button><button class="tool" data-action="clear">სიტყვის წაშლა</button><button class="tool" data-action="keyboard" aria-pressed="${settings().keyboard}">⌨ კლავიატურა</button><button class="tool" data-action="more" aria-label="თამაშის სხვა მოქმედებები">•••</button></div><div id="keyboard-holder">${settings().keyboard ? keyboardHTML() : ""}</div><p class="game-note">${settings().transliteration ? "ლათინური კლავიატურა ჩართულია." : "ქართული კლავიატურა."} პასუხები მოწმდება თქვენი მოთხოვნით.${settings().autoCheck ? " შეცდომების ავტომატური ჩვენება ჩართულია." : ""}</p><input class="key-input" id="letter-input" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="${settings().keyboard ? "none" : "text"}" aria-label="შეიყვანეთ ქართული ასო" aria-describedby="current-clue"></section><aside aria-label="კროსვორდის კითხვები"><div class="clue-tabs" role="tablist" aria-label="მიმართულება"><button role="tab" id="across-tab" data-direction="across" aria-controls="clue-list">ჰორიზონტალურად →</button><button role="tab" id="down-tab" data-direction="down" aria-controls="clue-list">ვერტიკალურად ↓</button></div><div class="clues" id="clue-list" role="tabpanel"></div><p class="clue-tip">გადაკვეთაზე ხელახლა დაჭერა ცვლის მიმართულებას. <kbd>Tab</kbd> — შემდეგი სიტყვა. <button class="text-button" data-action="help">ყველა მალსახმობი ↗</button></p></aside></div>`;
  const input = document.querySelector("#letter-input");
  let composing = false;
  const accept = () => {
    if (composing || paused || dialog.open) return;
    const raw = input.value;
    input.value = "";
    const letters = parseInput(raw, settings().transliteration);
    if (!letters.length) {
      if (raw.trim())
        toast("შეიყვანეთ ქართული ასო ან ჩართეთ ლათინური კლავიატურა.");
      return;
    }
    gameAction(() =>
      letters.length > 1 ? engine.paste(letters) : engine.enter(letters[0]),
    );
  };
  input.addEventListener("compositionstart", () => (composing = true));
  input.addEventListener("compositionend", () => {
    composing = false;
    accept();
  });
  input.addEventListener("input", accept);
  input.addEventListener("paste", (e) => {
    if (paused || dialog.open) return;
    e.preventDefault();
    const letters = parseInput(
      e.clipboardData.getData("text"),
      settings().transliteration,
    );
    if (letters.length) gameAction(() => engine.paste(letters));
    else toast("ჩასასმელი ტექსტი ქართულ ასოებს არ შეიცავს.");
  });
  paintGame();
  resizeGrid();
}
function resizeGrid() {
  const grid = document.querySelector(".crossword-grid"),
    scroll = document.querySelector(".board-scroll");
  if (!grid || !engine) return;
  const min = settings().largeCells ? 45 : window.innerWidth < 721 ? 32 : 29;
  const preferred = settings().largeCells ? 48 : 40;
  const size = Math.max(
    min,
    Math.min(
      preferred,
      Math.floor((scroll.clientWidth - 12) / engine.puzzle.grid.cols) - 1,
    ),
  );
  grid.style.setProperty("--cell-size", `${size}px`);
}
window.addEventListener("resize", resizeGrid);
function paintGame() {
  if (!engine || !document.querySelector(".crossword-grid")) return;
  paintGrid(engine, settings().autoCheck);
  const scoreElement = document.querySelector("#score");
  if (scoreElement.textContent !== String(engine.score)) {
    scoreElement.classList.remove("score-changing");
    void scoreElement.offsetWidth;
    scoreElement.classList.add("score-changing");
  }
  scoreElement.textContent = engine.score;
  document.querySelector("#progress-label").textContent =
    `${engine.progress}% შევსებულია`;
  document.querySelector("#progress-bar").style.width = `${engine.progress}%`;
  document.querySelector("#current-clue").innerHTML =
    `<div class="clue-direction">${engine.clue.number}. ${engine.clue.direction === "across" ? "ჰორიზონტალურად →" : "ვერტიკალურად ↓"}</div>${esc(engine.clue.clue)} <span class="clue-length">(${engine.path.length})</span>`;
  clueDirection = engine.clue.direction;
  document.querySelector("#clue-list").innerHTML = cluesHTML(
    engine,
    clueDirection,
  );
  document
    .querySelector("#clue-list")
    .setAttribute("aria-labelledby", `${clueDirection}-tab`);
  for (const tab of document.querySelectorAll("[data-direction]"))
    tab.setAttribute(
      "aria-selected",
      String(tab.dataset.direction === clueDirection),
    );
  document.querySelector("#pause-cover").classList.toggle("hidden", !paused);
  document.querySelector(".game-layout").classList.toggle("paused", paused);
  const complete = engine.state.completed;
  for (const b of document.querySelectorAll(
    '[data-action="hint"],[data-action="check"],[data-action="clear"],[data-action="pause"]',
  ))
    b.disabled = complete;
  document.querySelector("#completion-banner").innerHTML = complete
    ? '<div class="complete-banner"><div><h2>✦ კროსვორდი ამოხსნილია!</h2><p>ყველა სიტყვა თავის ადგილზეა.</p></div><button class="button small" data-action="results">შედეგები ↗</button></div>'
    : "";
  const cell = document.querySelector(`[data-cell="${engine.selected}"]`),
    scroll = document.querySelector(".board-scroll");
  if (cell && scroll) {
    const box = cell.getBoundingClientRect(),
      frame = scroll.getBoundingClientRect();
    if (box.right > frame.right)
      scroll.scrollLeft += box.right - frame.right + 5;
    if (box.left < frame.left) scroll.scrollLeft -= frame.left - box.left + 5;
    if (box.bottom > frame.bottom)
      scroll.scrollTop += box.bottom - frame.bottom + 5;
    if (box.top < frame.top) scroll.scrollTop -= frame.top - box.top + 5;
  }
}
function showCompletion() {
  if (!engine?.state.completed || currentRoute().page !== "puzzle") return;
  modal(
    `<div class="celebrate"><div class="badge-icon">✦</div><h2>მშვენივრად გამოგივიდათ!</h2><p>${esc(engine.puzzle.title)} — ყველა პასუხი სწორია.</p><div class="summary-numbers"><div><strong>${engine.score}</strong><span>ქულა</span></div><div><strong>${formatTime(engine.state.elapsedSeconds)}</strong><span>დრო</span></div><div><strong>${engine.state.hintsUsed}</strong><span>მინიშნება</span></div></div><p>საუკეთესო შედეგი: ${store.get(engine.puzzle.id).bestScore} ქულა</p></div>`,
    [
      { label: "შედეგის გაზიარება", secondary: true, action: shareResults },
      {
        label: "შემდეგი კროსვორდი",
        action: () => {
          const next = catalog.puzzles.find(
            (p) => !store.data.puzzles[p.id]?.completions,
          );
          navigate(next ? `puzzle/${next.id}` : "");
        },
      },
    ],
  );
}
function shareResults() {
  if (!engine?.state.completed) return;
  const text = `სიტყვანა ✦\n${engine.puzzle.title} · ${engine.puzzle.id.replace("original-", "№")}\n✓ ამოხსნილია · ${engine.score} ქულა\n◷ ${formatTime(engine.state.elapsedSeconds)} · ${engine.state.hintsUsed} მინიშნება\n${location.href}`;
  if (navigator.clipboard?.writeText)
    navigator.clipboard
      .writeText(text)
      .then(() => toast("შედეგი დაკოპირებულია."))
      .catch(() => showCopy(text));
  else showCopy(text);
}
function showCopy(text) {
  modal(
    `<h2>თქვენი შედეგი</h2><p style="white-space:pre-wrap;user-select:text">${esc(text)}</p>`,
  );
}
function help() {
  modal(
    `<h2>სიტყვებს შორის</h2><p>აირჩიეთ უჯრა ან კითხვა და შეიყვანეთ პასუხი. ნაცნობი ასოები გადაკვეთაზე ორივე სიტყვას ავსებს. შევსებული ბადე ამოხსნილად მხოლოდ მაშინ ითვლება, როცა ყველა ასო სწორია.</p><ul class="help-list"><li><kbd>↑ ↓ ← →</kbd> — უჯრებს შორის მოძრაობა.</li><li><kbd>Tab</kbd> / <kbd>Shift + Tab</kbd> — შემდეგი / წინა კითხვა (ბადეში).</li><li><kbd>Backspace</kbd> — ასოს წაშლა; ცარიელი უჯრიდან უკან გადასვლა.</li><li><kbd>Enter</kbd> ან გადაკვეთაზე მეორე დაჭერა — მიმართულების შეცვლა.</li><li><kbd>Esc</kbd> — პაუზა ან თამაშში დაბრუნება.</li><li>ტექსტის ჩასმა ავსებს მხოლოდ არჩეულ სიტყვას.</li></ul><p>ავტომატური გადასვლა ტოვებს უკვე შევსებულ გადაკვეთებს. ასოს შესაცვლელად მონიშნეთ მისი უჯრა. მინიშნებით გახსნილი ასო აღინიშნება პატარა ოქროსფერი წერტილით.</p><p>პროგრესი ინახება მხოლოდ ამ ბრაუზერში. სათადარიგო ასლისთვის გამოიყენეთ ექსპორტი პარამეტრებში.</p>`,
    [
      { label: "ქულების წესები", secondary: true, action: scoreHelp },
      { label: "გასაგებია" },
    ],
  );
}
function scoreHelp() {
  modal(
    `<h2>როგორ ითვლება ქულა</h2><table class="score-table">${[
      ["შემოწმებული სწორი ასო", "+10"],
      ["სწორი სიტყვა მინიშნების გარეშე", "+25"],
      ["კროსვორდის დასრულება", "+200"],
      ["დასრულება მინიშნების გარეშე", "+150"],
      ["სისწრაფის ბონუსი", "0–100"],
      ["არასწორი შემოწმება", "−5"],
      ["ასოს გახსნა", "−25"],
      ["სიტყვის გახსნა", "−100"],
    ]
      .map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`)
      .join(
        "",
      )}</table><p>ასოებისა და სიტყვების ქულები ირიცხება შემოწმებისას ან დასრულებისას. ერთი და იგივე ასო/სიტყვა ქულას მხოლოდ ერთხელ გაძლევთ. უცვლელი არასწორი პასუხის განმეორებით შემოწმება აღარ ჯარიმდება. სრული ბადის შემოწმებისას ჯარიმა ითვლება თითოეული არასწორი სიტყვისთვის.</p><p>გახსნილი ასოები ასოს ქულას არ იღებენ, ხოლო მათ შემცველი სიტყვები — სიტყვის ბონუსს. საბოლოო ქულა არასდროს არის უარყოფითი. სისწრაფის ბონუსი თანდათან მცირდება: მიზანია 6 / 12 / 20 წუთი მარტივ / საშუალო / რთულ კროსვორდებზე.</p><p>საერთო ქულა აჯამებს მხოლოდ თითოეული კროსვორდის საუკეთესო დასრულებულ შედეგს. ხელახალი თამაში ცალკე ქულებს არ ამატებს.</p>`,
  );
}

function renderStatistics() {
  const s = statistics(store.data);
  main.innerHTML = `<div class="eyebrow">თქვენი სიტყვიერი თავგადასავალი</div><h1 class="page-title">ყველა პატარა გამარჯვება</h1><p class="page-description">თქვენი პროგრესი, მიღწევები და ახალი მიზნები — ერთ ადგილას.</p><div class="stat-cards">${[
    [s.completed, "ამოხსნილი კროსვორდი"],
    [s.totalScore.toLocaleString("ka-GE"), "საუკეთესო ქულების ჯამი"],
    [s.current, "დღე ზედიზედ"],
    [`${s.percentage}%`, "დაწყებულიდან დასრულებული"],
  ]
    .map(
      ([n, label]) =>
        `<div class="stat-card"><strong>${n}</strong><span>${label}</span></div>`,
    )
    .join(
      "",
    )}</div><div class="stats-detail"><section class="detail-card"><h2>დონე ${s.level} · სიტყვების აღმომჩენი</h2><p class="fine-print">მომდევნო დონემდე დარჩენილია ${1500 - (s.totalScore % 1500)} ქულა.</p><div class="level-bar" role="progressbar" aria-label="დონის პროგრესი" aria-valuenow="${s.totalScore % 1500}" aria-valuemin="0" aria-valuemax="1500"><span style="width:${(s.totalScore % 1500) / 15}%"></span></div><p class="fine-print">${s.totalScore % 1500} / 1 500 ქულა</p>${[
    ["დაწყებული კროსვორდი", s.started],
    ["საუკეთესო სერია", `${s.longest} დღე`],
    ["მინიშნების გარეშე", s.noHints],
  ]
    .map(
      ([k, v]) =>
        `<div class="detail-row"><span>${k}</span><strong>${v}</strong></div>`,
    )
    .join("")}</section><section class="detail-card"><h2>თამაშის რიტმი</h2>${[
    ["საშუალო საუკეთესო დრო", s.completed ? formatTime(s.average) : "—"],
    ["უსწრაფესი ამოხსნა", s.completed ? formatTime(s.fastest) : "—"],
    ["გამოყენებული მინიშნებები", s.hints],
    ["შემოწმების სიზუსტე", s.accuracy === null ? "—" : `${s.accuracy}%`],
  ]
    .map(
      ([k, v]) =>
        `<div class="detail-row"><span>${k}</span><strong>${v}</strong></div>`,
    )
    .join(
      "",
    )}<p class="fine-print" style="margin-top:15px">სიზუსტე: ყველა ცდაში შემოწმებული სწორი ასოების წილი სწორ ასოებსა და ყველა არასწორ შემოწმებას შორის. დრო ითვლება მხოლოდ აქტიური თამაშისას.</p></section></div><div class="button-row"><a href="#/achievements" class="button secondary">ჩემი მიღწევები ↗</a><button class="text-button" data-action="scores">ქულების წესები</button></div>`;
}
function renderAchievements() {
  unlockAchievements(store.data);
  main.innerHTML = `<div class="eyebrow">ყოველი ნაბიჯი მნიშვნელოვანია</div><h1 class="page-title">თქვენი მიღწევები</h1><p class="page-description">გახსნილია ${store.data.achievements.length} მიღწევა ${ACHIEVEMENTS.length}-დან. ყველაფერი იწყება პირველი სიტყვით.</p><div class="badges">${ACHIEVEMENTS.map(
    (a) => {
      const earned = store.data.achievements.includes(a.id);
      return `<article class="badge ${earned ? "" : "locked"}"><div class="badge-icon" aria-hidden="true">${a.icon}</div><h2>${a.title}</h2><p>${a.description}</p><span class="pill">${earned ? "✓ მიღწეულია" : "ჯერ წინ არის"}</span></article>`;
    },
  ).join("")}</div>`;
}
const settingLabels = [
  [
    "transliteration",
    "ლათინური კლავიატურა",
    "ქართულ QWERTY განლაგებასთან თავსებადი გადაყვანა.",
  ],
  ["keyboard", "ეკრანული კლავიატურა", "33 ქართული ასო ეკრანზე."],
  [
    "autoCheck",
    "შეცდომების ავტომატური ჩვენება",
    "არასწორი ასო მაშინვე გამოჩნდება წითლად.",
  ],
  ["zen", "მშვიდი რეჟიმი", "თამაშისას დრო არ გამოჩნდება."],
  ["contrast", "მაღალი კონტრასტი", "უფრო გამოკვეთილი საზღვრები და ტექსტი."],
  ["largeCells", "დიდი უჯრები", "დიდ ბადეზე გამოიყენეთ გვერდითი გადაადგილება."],
  ["sound", "ხმოვანი ეფექტი", "მოკლე ხმა კროსვორდის დასრულებისას."],
];
function renderSettings() {
  main.innerHTML = `<div class="eyebrow">თქვენი თამაში, თქვენი რიტმი</div><h1 class="page-title">პარამეტრები</h1><section class="settings-section"><h2>თამაშის კომფორტი</h2>${settingLabels.map(([id, label, note]) => `<div class="setting-row"><label for="setting-${id}">${label}<small>${note}</small></label><input class="switch" id="setting-${id}" type="checkbox" data-setting="${id}" ${settings()[id] ? "checked" : ""}></div>`).join("")}</section><section class="settings-section"><h2>ლათინური კლავიატურის განლაგება</h2><p class="fine-print">ყველა ასოს შეესაბამება ერთი ღილაკი. დიდი და პატარა ლათინური ასოები განსხვავდება: <kbd>t</kbd> → ტ, <kbd>Shift + T</kbd> → თ. ორმაგი კომბინაციები არ გამოიყენება. ქართული ტექსტი პირდაპირ მიიღება.</p><div class="mapping">${Object.entries(
    LATIN_MAP,
  )
    .map(([l, g]) => `<span>${l}<b>${g}</b></span>`)
    .join(
      "",
    )}</div></section><section class="settings-section"><h2>პროგრესი და სარეზერვო ასლი</h2><p class="fine-print">შედეგები ინახება ამ ბრაუზერსა და მოწყობილობაზე. ბრაუზერის მონაცემების წაშლისას ისინი შეიძლება დაიკარგოს. ექსპორტირებული ფაილით პროგრესს სხვა მოწყობილობაზეც გადაიტანთ.</p><div class="button-row"><button class="button secondary" data-action="export">პროგრესის ექსპორტი ↓</button><button class="button secondary" data-action="import">ფაილიდან აღდგენა ↑</button></div><input type="file" id="import-file" accept="application/json,.json" hidden><div class="button-row"><button class="text-button" data-action="reset-all" style="color:var(--red)">მთელი პროგრესის წაშლა</button></div></section><section class="settings-section"><h2>ინტერნეტის გარეშეც</h2><p class="fine-print">ადრე გახსნილი კროსვორდები ხელმისაწვდომია ინტერნეტის გარეშეც, როდესაც ბრაუზერში ოფლაინ მხარდაჭერა ჩაირთვება. მთელი კოლექციის ჩამოტვირთვის შემდეგ ნებისმიერი კროსვორდის ამოხსნას შეძლებთ.</p><div class="button-row"><button class="button secondary" data-action="cache-all" id="cache-button">ყველა კროსვორდის ჩამოტვირთვა</button></div><p class="fine-print" id="offline-status">${"serviceWorker" in navigator ? "დღის კროსვორდი და სერია ეფუძნება თბილისის კალენდარს." : "ამ ბრაუზერში ოფლაინ მხარდაჭერა მიუწვდომელია."}</p></section><section class="settings-section"><h2>სიტყვანას შესახებ</h2><p class="fine-print">კოლექციაში წარმოდგენილია ამ პროექტისთვის შექმნილი ორიგინალური კროსვორდები. თამაში არ აგზავნის თქვენს პროგრესს სერვერზე და არ იყენებს ანგარიშებსა თუ რეკლამას.</p><button class="text-button" data-action="scores">ქულების წესები →</button></section>`;
  document.querySelector("#import-file").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 10e6) {
      toast("ფაილი მეტისმეტად დიდია.");
      return;
    }
    try {
      const text = await f.text();
      JSON.parse(text);
      confirmAction(
        "აღვადგინოთ პროგრესი?",
        "იმპორტი ამ ბრაუზერში არსებულ პროგრესს ჩაანაცვლებს.",
        () => {
          try {
            const saved = store.import(text);
            unlockAchievements(store.data);
            applySettings();
            renderSettings();
            toast(
              saved
                ? "პროგრესი აღდგენილია."
                : "პროგრესი ჩატვირთულია, თუმცა ბრაუზერში ვერ შეინახა.",
            );
          } catch {
            toast("ფაილი ვერ ჩაიტვირთა. შეამოწმეთ სარეზერვო ასლი.");
          }
        },
      );
    } catch {
      toast("ფაილი არ შეიცავს სწორ JSON მონაცემებს.");
    }
    e.target.value = "";
  };
}

async function cacheAll() {
  const b = document.querySelector("#cache-button"),
    status = document.querySelector("#offline-status");
  if (!navigator.serviceWorker?.controller) {
    toast(
      "ოფლაინ მხარდაჭერა ჯერ მზად არ არის. განაახლეთ გვერდი და სცადეთ ხელახლა.",
    );
    return;
  }
  b.disabled = true;
  try {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => {
      if (e.data.progress)
        status.textContent = `ინახება ${e.data.progress} / ${catalog.puzzles.length}`;
      if (e.data.done || e.data.error) {
        b.disabled = false;
        status.textContent = e.data.error
          ? "ზოგი კროსვორდი ვერ შეინახა. შეამოწმეთ კავშირი და სცადეთ ხელახლა."
          : "ყველა კროსვორდი მზადაა ინტერნეტის გარეშე სათამაშოდ.";
        channel.port1.close();
      }
    };
    navigator.serviceWorker.controller.postMessage({ type: "CACHE_ALL" }, [
      channel.port2,
    ]);
  } catch {
    b.disabled = false;
    toast("კროსვორდები ვერ შეინახა.");
  }
}
function exportProgress() {
  updateTime();
  save();
  const blob = new Blob([store.export()], { type: "application/json" }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `sitqvana-progress-${dateKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const actions = {
  help,
  scores: scoreHelp,
  export: exportProgress,
  import: () => document.querySelector("#import-file").click(),
  "cache-all": cacheAll,
  "reset-all": () =>
    confirmAction(
      "წავშალოთ მთელი პროგრესი?",
      "წაიშლება ყველა შედეგი, მიღწევა და პარამეტრი. ეს მოქმედება შეუქცევადია. ჯერ შეგიძლიათ სარეზერვო ასლის ჩამოტვირთვა.",
      () => {
        const ok = store.resetAll();
        applySettings();
        renderSettings();
        toast(
          ok ? "პროგრესი წაიშალა." : "პროგრესის წაშლა ბრაუზერში ვერ შეინახა.",
        );
      },
    ),
  pause: () => {
    updateTime();
    paused = true;
    save();
    paintGame();
    document.querySelector('[data-action="resume"]')?.focus();
  },
  resume: () => {
    paused = false;
    lastTick = performance.now();
    lastActivity = Date.now();
    paintGame();
    focusEntry();
  },
  next: () => {
    if (!engine || paused) return;
    engine.nextClue();
    paintGame();
    focusEntry();
  },
  previous: () => {
    if (!engine || paused) return;
    engine.nextClue(-1);
    paintGame();
    focusEntry();
  },
  backspace: () => gameAction(() => engine.backspace()),
  clear: () => {
    if (engine && !paused && !engine.state.completed)
      confirmAction(
        "წავშალოთ არჩეული სიტყვა?",
        "წაიშლება ამ სიტყვის ასოები, მათ შორის გადაკვეთებიც. მინიშნებით გახსნილი ასოები დარჩება.",
        () => gameAction(() => engine.clearWord()),
      );
  },
  keyboard: () => {
    settings().keyboard = !settings().keyboard;
    save();
    gameHTML();
  },
  check: () => {
    if (!engine || paused || engine.state.completed) return;
    modal(
      "<h2>პასუხების შემოწმება</h2><p>არასწორი ასოები გამოიკვეთება. სწორი პასუხი არ გამოჩნდება. ცარიელი უჯრები შეცდომად არ ითვლება.</p>",
      [
        { label: "ასო", action: () => doCheck("letter") },
        { label: "სიტყვა", action: () => doCheck("word") },
        { label: "მთელი ბადე", action: () => doCheck("all") },
      ],
    );
  },
  hint: () => {
    if (!engine || paused || engine.state.completed) return;
    modal(
      "<h2>პატარა დახმარება</h2><p>გახსნილი ასო დარჩება ბადეში. ქულა მცირდება მხოლოდ ახალი დახმარების გამოყენებისას.</p>",
      [
        { label: "გაუქმება", secondary: true },
        {
          label: "ასო · −25",
          action: () => gameAction(() => engine.reveal("letter")),
        },
        {
          label: "სიტყვა · −100",
          action: () => gameAction(() => engine.reveal("word")),
        },
      ],
    );
  },
  more: () =>
    modal("<h2>თამაშის პარამეტრები</h2>", [
      {
        label: "პარამეტრები",
        secondary: true,
        action: () => navigate("settings"),
      },
      { label: "ქულების წესები", secondary: true, action: scoreHelp },
      {
        label: "თავიდან დაწყება",
        action: () =>
          confirmAction(
            "დავიწყოთ თავიდან?",
            "ამ ცდის ასოები და დრო განულდება. საუკეთესო შედეგი, დასრულების ისტორია და მიღწევები შენარჩუნდება.",
            () => {
              store.resetPuzzle(engine.puzzle.id);
              engine = new CrosswordEngine(
                engine.puzzle,
                store.get(engine.puzzle.id).attempt,
              );
              completionRecorded = false;
              paused = false;
              timeRemainder = 0;
              gameHTML();
            },
          ),
      },
    ]),
  results: showCompletion,
};
function doCheck(scope) {
  gameAction(() => {
    const result = engine.check(scope);
    toast(
      result.wrong
        ? `არასწორი ასოები: ${result.wrong}.`
        : result.empty
          ? "შევსებული ასოები სწორია. დარჩენილია ცარიელი უჯრები."
          : "შემოწმებული ასოები სწორია!",
    );
  });
}
document.addEventListener("click", (e) => {
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (action) {
    actions[action]?.();
    return;
  }
  const filter = e.target.closest("[data-filter]");
  if (filter) {
    catalogFilter = filter.dataset.filter;
    for (const b of document.querySelectorAll("[data-filter]"))
      b.setAttribute("aria-pressed", String(b === filter));
    renderCards();
    return;
  }
  const fav = e.target.closest("[data-favorite]");
  if (fav) {
    const id = fav.dataset.favorite;
    store.data.favorites = store.data.favorites.includes(id)
      ? store.data.favorites.filter((x) => x !== id)
      : [...store.data.favorites, id];
    save();
    renderCards();
    return;
  }
  const cell = e.target.closest("[data-cell]");
  if (cell && engine && !paused) {
    engine.select(cell.dataset.cell);
    paintGame();
    focusEntry();
    return;
  }
  const clue = e.target.closest("[data-clue]");
  if (clue && engine && !paused) {
    engine.selectClue(clue.dataset.clue);
    paintGame();
    focusEntry();
    return;
  }
  const direction = e.target.closest("[data-direction]");
  if (direction && engine && !paused) {
    const cl =
      engine.puzzle.clues.find(
        (c) =>
          c.direction === direction.dataset.direction &&
          engine.wordPaths[c.id].includes(engine.selected),
      ) ||
      engine.puzzle.clues.find(
        (c) => c.direction === direction.dataset.direction,
      );
    if (cl) engine.selectClue(cl.id);
    paintGame();
    return;
  }
  const letter = e.target.closest("[data-letter]");
  if (letter) gameAction(() => engine.enter(letter.dataset.letter));
});
document.addEventListener("change", (e) => {
  const id = e.target.dataset.setting;
  if (id) {
    settings()[id] = e.target.checked;
    applySettings();
    save();
  }
});
document.addEventListener("keydown", (e) => {
  if (
    !engine ||
    dialog.open ||
    e.isComposing ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey
  )
    return;
  if (e.key === "Escape") {
    e.preventDefault();
    if (engine.state.completed) return;
    actions[paused ? "resume" : "pause"]();
    return;
  }
  if (paused) return;
  const onGrid =
    e.target.id === "letter-input" || e.target.closest?.("[data-cell]");
  if (!onGrid) return;
  if (
    [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Tab",
      "Backspace",
      "Delete",
      "Enter",
    ].includes(e.key)
  ) {
    e.preventDefault();
    lastActivity = Date.now();
    if (e.key === "Tab") engine.nextClue(e.shiftKey ? -1 : 1);
    else if (e.key === "Enter") engine.select(engine.selected, true);
    else if (e.key === "Backspace" || e.key === "Delete") {
      gameAction(() => engine.backspace());
      return;
    } else {
      const [dr, dc] = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      }[e.key];
      engine.move(dr, dc);
    }
    paintGame();
    focusEntry();
    return;
  }
  if (e.target.id !== "letter-input" && e.key.length === 1) {
    const letters = parseInput(e.key, settings().transliteration);
    if (letters.length) {
      e.preventDefault();
      gameAction(() => engine.enter(letters[0]));
    }
  }
});
document.querySelector(".skip-link").onclick = (e) => {
  e.preventDefault();
  main.focus();
};
document.querySelector("#help-button").onclick = help;
document.querySelector("#theme-button").onclick = () => {
  settings().theme = settings().theme === "light" ? "dark" : "light";
  applySettings();
  save();
};
document.addEventListener("visibilitychange", () => {
  updateTime();
  if (document.hidden && engine) {
    paused = !engine.state.completed;
    save();
    paintGame();
  }
  lastTick = performance.now();
});
window.addEventListener("pagehide", () => {
  updateTime();
  save();
});
window.addEventListener("storage", (e) => {
  if (e.key === "sitqvana.progress" && e.newValue) {
    engine = null;
    const fresh = new Storage(backend, toast);
    store.data = fresh.data;
    applySettings();
    toast("პროგრესი სხვა ჩანართში განახლდა.");
    route();
  }
});

async function route() {
  updateTime();
  if (engine) save();
  engine = null;
  paused = false;
  timeRemainder = 0;
  loadController?.abort();
  loadController = new AbortController();
  const serial = ++routeSerial;
  if (dialog.open) dialog.close();
  main.innerHTML =
    '<div class="loading" role="status"><span></span>იტვირთება…</div>';
  window.scrollTo(0, 0);
  try {
    const route = currentRoute();
    if (!catalog) catalog = await loadCatalog(loadController.signal);
    if (serial !== routeSerial) return;
    for (const nav of document.querySelectorAll("[data-nav]")) {
      const selected =
        nav.dataset.nav === (route.page === "puzzle" ? "home" : route.page);
      if (selected) nav.setAttribute("aria-current", "page");
      else nav.removeAttribute("aria-current");
    }
    if (route.page === "puzzle") {
      if (!catalog.puzzles.some((p) => p.id === route.id))
        throw Error("ასეთი კროსვორდი ვერ მოიძებნა.");
      const puzzle = await loadPuzzle(route.id, loadController.signal);
      if (serial !== routeSerial) return;
      engine = new CrosswordEngine(puzzle, store.get(puzzle.id).attempt);
      completionRecorded = engine.state.completed;
      lastTick = performance.now();
      lastActivity = Date.now();
      store.data.activePuzzleId = puzzle.id;
      save();
      gameHTML();
      document.title = `${puzzle.title} — სიტყვანა`;
    } else {
      document.title = "სიტყვანა — ქართული კროსვორდები";
      if (route.page === "home") home();
      else if (route.page === "statistics") renderStatistics();
      else if (route.page === "achievements") renderAchievements();
      else if (route.page === "settings") renderSettings();
      else throw Error("გვერდი ვერ მოიძებნა.");
    }
  } catch (error) {
    if (error.name === "AbortError" || serial !== routeSerial) return;
    const message = /[ა-ჰ]/u.test(error.message || "")
      ? error.message
      : "მონაცემები ვერ ჩაიტვირთა. შეამოწმეთ კავშირი ან სცადეთ ხელახლა.";
    main.innerHTML = `<div class="error-panel"><h1>ვერ ჩაიტვირთა</h1><p>${esc(message)}</p><div class="button-row" style="justify-content:center"><button id="retry" class="button">ხელახლა ცდა</button><a href="#/" class="button secondary">მთავარი გვერდი</a></div></div>`;
    document.querySelector("#retry").onclick = () => route();
  }
}
applySettings();
window.addEventListener("hashchange", route);
route();
if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" ||
    (["localhost", "127.0.0.1"].includes(location.hostname) &&
      new URLSearchParams(location.search).has("offline")))
) {
  navigator.serviceWorker
    .register("./service-worker.js")
    .then((reg) => {
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          )
            toast(
              "ახალი ვერსია მზადაა. დახურეთ თამაშის ყველა ჩანართი და გახსენით ხელახლა; პროგრესი შენარჩუნდება.",
            );
        });
      });
    })
    .catch(() =>
      toast("ოფლაინ მხარდაჭერა ვერ ჩაირთო. ონლაინ თამაში ხელმისაწვდომია."),
    );
}
