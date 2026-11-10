(() => {
  const EMPTY = 0, DOT = 1, STAR = 2;
  const SIZES = [5, 6, 8, 10];
  // Ten clearly different hues, ordered so consecutive regions (which are
  // often neighbours) don't get similar colours.
  const COLORS = [
    "#b85450", "#3f9a96", "#c9a53e", "#6a5fb8", "#5a9e48",
    "#b85a92", "#cc7d3c", "#4a7fbf", "#9bb043", "#9257b0",
  ];
  const PREFIX = "dtg.starbattle.";

  const $ = (id) => document.getElementById(id);
  const boardEl = $("board"), statusEl = $("status"), timeEl = $("time"), bestEl = $("best");
  const autoBox = $("autodots"), newBtn = $("new");

  let prefs = load("prefs") || { mode: "daily", n: 8, autodots: false, randomSeeds: {} };
  let puzzle, seed, cells, history, elapsed, solved, timer;

  function load(k) { try { return JSON.parse(localStorage.getItem(PREFIX + k)); } catch { return null; } }
  function save(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch { /* ignore */ } }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function fmt(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

  // ---------- puzzle lifecycle ----------

  function start(newRandom = false) {
    const n = prefs.n;
    if (prefs.mode === "daily") {
      seed = `daily/${today()}/${n}`;
    } else {
      if (newRandom || !prefs.randomSeeds[n]) prefs.randomSeeds[n] = `random/${Date.now()}/${n}`;
      seed = prefs.randomSeeds[n];
    }
    save("prefs", prefs);

    puzzle = StarBattleGen.generate(n, seed);
    const saved = load("game." + seed);
    cells = saved ? saved.cells : new Array(n * n).fill(EMPTY);
    elapsed = saved ? saved.elapsed : 0;
    solved = saved ? saved.solved : false;
    history = [];

    buildBoard();
    syncControls();
    render();
    runTimer();
  }

  function persist() { save("game." + seed, { cells, elapsed, solved }); }

  function runTimer() {
    clearInterval(timer);
    timeEl.textContent = fmt(elapsed);
    if (solved) return;
    timer = setInterval(() => {
      if (document.hidden) return;
      elapsed++;
      timeEl.textContent = fmt(elapsed);
      if (elapsed % 5 === 0) persist();
    }, 1000);
  }

  // ---------- rendering ----------

  function buildBoard() {
    const { n, region } = puzzle;
    boardEl.style.setProperty("--n", n);
    boardEl.replaceChildren();
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n, g = region[i];
      const btn = document.createElement("button");
      btn.className = "cell";
      btn.dataset.i = i;
      btn.style.background = COLORS[g % COLORS.length];
      if (r > 0 && region[i - n] !== g) btn.classList.add("t");
      if (c < n - 1 && region[i + 1] !== g) btn.classList.add("r");
      if (r < n - 1 && region[i + n] !== g) btn.classList.add("b");
      if (c > 0 && region[i - 1] !== g) btn.classList.add("l");
      boardEl.append(btn);
    }
  }

  // Which stars break a rule, and which empty cells can't hold a star.
  function analyse() {
    const { n, region } = puzzle;
    const stars = [];
    cells.forEach((v, i) => { if (v === STAR) stars.push(i); });
    const rowC = new Array(n).fill(0), colC = new Array(n).fill(0), regC = new Array(n).fill(0);
    for (const i of stars) { rowC[Math.floor(i / n)]++; colC[i % n]++; regC[region[i]]++; }

    const isStar = (r, c) => r >= 0 && c >= 0 && r < n && c < n && cells[r * n + c] === STAR;
    const touchesStar = (i) => {
      const r = Math.floor(i / n), c = i % n;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if ((dr || dc) && isStar(r + dr, c + dc)) return true;
      return false;
    };

    const errors = new Set();
    for (const i of stars) {
      if (rowC[Math.floor(i / n)] > 1 || colC[i % n] > 1 || regC[region[i]] > 1 || touchesStar(i)) errors.add(i);
    }
    const blocked = new Set();
    for (let i = 0; i < n * n; i++) {
      if (cells[i] !== EMPTY) continue;
      if (rowC[Math.floor(i / n)] || colC[i % n] || regC[region[i]] || touchesStar(i)) blocked.add(i);
    }
    return { stars, errors, blocked };
  }

  function render() {
    const { stars, errors, blocked } = analyse();
    const n = puzzle.n;
    [...boardEl.children].forEach((el, i) => {
      const v = cells[i];
      el.classList.toggle("star", v === STAR);
      el.classList.toggle("dot", v === DOT);
      el.classList.toggle("err", errors.has(i));
      el.classList.toggle("auto", prefs.autodots && v === EMPTY && blocked.has(i));
      const r = Math.floor(i / n) + 1, c = (i % n) + 1;
      el.setAttribute("aria-label", `Row ${r} column ${c}: ${["empty", "dot", "star"][v]}`);
    });

    const nowSolved = stars.length === n && errors.size === 0;
    if (nowSolved && !solved) win();
    boardEl.classList.toggle("solved", solved);

    if (solved) statusEl.textContent = `Solved in ${fmt(elapsed)}!`;
    else if (errors.size) statusEl.textContent = "Some stars break the rules.";
    else statusEl.textContent = `${stars.length} / ${n} stars`;

    const best = load("best." + n);
    bestEl.textContent = best ? fmt(best) : "–";
  }

  function win() {
    solved = true;
    clearInterval(timer);
    const best = load("best." + puzzle.n);
    if (!best || elapsed < best) save("best." + puzzle.n, elapsed);
    persist();
  }

  function syncControls() {
    for (const b of $("mode").children) b.setAttribute("aria-pressed", b.dataset.mode === prefs.mode);
    for (const b of $("size").children) b.setAttribute("aria-pressed", Number(b.dataset.n) === prefs.n);
    newBtn.hidden = prefs.mode !== "random";
    autoBox.checked = prefs.autodots;
  }

  // ---------- input ----------

  function snapshot() {
    history.push(cells.slice());
    if (history.length > 200) history.shift();
  }

  function commit() { persist(); render(); }

  // Drag painting: after a gesture starts by setting a dot (or clearing one),
  // moving over more cells applies the same change to them.
  let drag = null;

  function cellAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.parentElement === boardEl ? Number(el.dataset.i) : null;
  }

  boardEl.addEventListener("pointerdown", (e) => {
    if (solved) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null) return;
    e.preventDefault();
    snapshot();
    const v = cells[i];
    const next = e.button === 2 ? (v === DOT ? EMPTY : DOT) : (v + 1) % 3;
    cells[i] = next;
    drag = next === STAR ? null : { from: v, to: next, last: i };
    commit();
  });

  boardEl.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null || i === drag.last) return;
    drag.last = i;
    if (cells[i] === drag.from) { cells[i] = drag.to; render(); }
  });

  const endDrag = () => { if (drag) { drag = null; persist(); } };
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  boardEl.addEventListener("contextmenu", (e) => e.preventDefault());

  // Keyboard: Enter/Space on a focused cell (click with detail 0).
  boardEl.addEventListener("click", (e) => {
    if (e.detail !== 0 || solved || !e.target.dataset.i) return;
    const i = Number(e.target.dataset.i);
    snapshot();
    cells[i] = (cells[i] + 1) % 3;
    commit();
  });

  $("undo").addEventListener("click", () => {
    if (solved || !history.length) return;
    cells = history.pop();
    commit();
  });

  $("clear").addEventListener("click", () => {
    if (solved || cells.every((v) => v === EMPTY)) return;
    snapshot();
    cells.fill(EMPTY);
    commit();
  });

  newBtn.addEventListener("click", () => start(true));

  autoBox.addEventListener("change", () => {
    prefs.autodots = autoBox.checked;
    save("prefs", prefs);
    render();
  });

  $("mode").addEventListener("click", (e) => {
    const m = e.target.dataset.mode;
    if (!m || m === prefs.mode) return;
    persist();
    prefs.mode = m;
    start();
  });

  $("size").addEventListener("click", (e) => {
    const n = Number(e.target.dataset.n);
    if (!n || n === prefs.n) return;
    persist();
    prefs.n = n;
    start();
  });

  window.addEventListener("pagehide", () => persist());

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); $("undo").click(); }
  });

  if (!SIZES.includes(prefs.n)) prefs.n = 8;
  prefs.randomSeeds ||= {};
  start();
})();
