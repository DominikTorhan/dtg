(() => {
  const { generate, solve, neighbors } = DistrictsGen;
  const PREFIX = "dtg.districts.";

  const $ = (id) => document.getElementById(id);
  const boardEl = $("board"), statusEl = $("status"), wonEl = $("won"), targetEl = $("target");
  const shareEl = $("share"), needEl = $("need"), newBtn = $("new");

  function load(k) { try { return JSON.parse(localStorage.getItem(PREFIX + k)); } catch { return null; } }
  function save(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch { /* ignore */ } }

  let prefs = load("prefs") || { mode: "daily", n: 5, randomSeeds: {} };
  let puzzle, seed, assign, cur, cellEls, best, dragging = false, solveId = 0;

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // ---------- best possible score (worker, with a same-thread fallback) ----------

  let worker = null;
  try {
    worker = new Worker("solver.js");
    worker.onmessage = (e) => { if (e.data.id === solveId) setBest(e.data.best); };
    worker.onerror = () => { worker = null; requestSolve(); };
  } catch { worker = null; }

  function requestSolve() {
    const cached = load("best/" + seed);
    if (typeof cached === "number") return setBest(cached);
    const id = ++solveId;
    if (worker) worker.postMessage({ id, votes: puzzle.votes, n: puzzle.n });
    else setTimeout(() => { if (id === solveId) setBest(solve(puzzle.votes, puzzle.n)); }, 30);
  }

  function setBest(b) {
    best = b;
    save("best/" + seed, b);
    render();
  }

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
    puzzle = generate(seed, n);
    const saved = load("board/" + seed);
    assign = Array.isArray(saved) && saved.length === n * n ? saved : new Array(n * n).fill(-1);
    cur = null;
    best = null;
    build();
    render();
    requestSolve();
    document.querySelectorAll("#mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === prefs.mode)));
    document.querySelectorAll("#size button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.n) === n)));
    newBtn.hidden = prefs.mode !== "random";
  }

  function build() {
    const { n, votes } = puzzle;
    boardEl.style.setProperty("--n", n);
    boardEl.innerHTML = "";
    cellEls = votes.map((v, i) => {
      const el = document.createElement("button");
      el.className = "cell" + (v ? " mine" : "");
      el.dataset.i = i;
      el.setAttribute("aria-label", v ? "green voter" : "orange voter");
      boardEl.appendChild(el);
      return el;
    });
    const mine = votes.reduce((a, b) => a + b, 0);
    shareEl.textContent = Math.round((mine / votes.length) * 100) + "%";
    needEl.textContent = puzzle.need;
  }

  // ---------- districts ----------

  function members(id) {
    const out = [];
    assign.forEach((d, i) => { if (d === id) out.push(i); });
    return out;
  }

  function result(id) {
    const cells = members(id);
    const mine = cells.reduce((a, c) => a + puzzle.votes[c], 0);
    if (cells.length < puzzle.n) return "open";
    if (mine >= puzzle.need) return "win";
    if (cells.length - mine >= puzzle.need) return "lose";
    return "tie";
  }

  function freeId() {
    const used = new Set(assign);
    let id = 0;
    while (used.has(id)) id++;
    return id;
  }

  function touches(i, id) { return neighbors(i, puzzle.n).some((nb) => assign[nb] === id); }

  function add(i) {
    if (assign[i] !== -1 || cur === null) return false;
    if (members(cur).length >= puzzle.n || !touches(i, cur)) return false;
    assign[i] = cur;
    if (members(cur).length === puzzle.n) cur = null;
    return true;
  }

  function erase(id) {
    assign = assign.map((d) => (d === id ? -1 : d));
    if (cur === id) cur = null;
  }

  // ---------- rendering ----------

  function render() {
    const { n } = puzzle;
    const ids = [...new Set(assign.filter((d) => d >= 0))];
    const res = Object.fromEntries(ids.map((id) => [id, result(id)]));
    cellEls.forEach((el, i) => {
      const d = assign[i];
      const x = i % n, y = (i / n) | 0;
      el.classList.toggle("d", d >= 0);
      el.classList.toggle("cur", d >= 0 && d === cur);
      el.classList.toggle("win", d >= 0 && res[d] === "win");
      el.classList.toggle("lose", d >= 0 && res[d] === "lose");
      const diff = (j) => d >= 0 && assign[j] !== d;
      el.classList.toggle("t", y > 0 && diff(i - n));
      el.classList.toggle("b", y < n - 1 && diff(i + n));
      el.classList.toggle("l", x > 0 && diff(i - 1));
      el.classList.toggle("r", x < n - 1 && diff(i + 1));
    });

    const done = ids.filter((id) => res[id] !== "open");
    const wins = done.filter((id) => res[id] === "win").length;
    wonEl.textContent = wins;
    targetEl.textContent = best === null ? "…" : best;

    if (done.length === n) {
      const ties = done.filter((id) => res[id] === "tie").length;
      const tieNote = ties ? ` (${ties} tied)` : "";
      if (best !== null && wins >= best) {
        statusEl.textContent = `Perfect map! Green wins ${wins} of ${n} districts${tieNote}.`;
        save("solved/" + seed, true);
      } else {
        statusEl.textContent = `Green wins ${wins} of ${n}${tieNote}.` + (best === null ? "" : ` The best map wins ${best}. Tap a district to redraw it.`);
      }
    } else {
      const placed = assign.filter((d) => d >= 0).length;
      statusEl.textContent = placed
        ? `${done.length} of ${n} districts drawn, ${wins} won so far.`
        : `Draw ${n} districts of ${n} cells each.`;
    }
    save("board/" + seed, assign);
  }

  // ---------- input ----------

  function cellAt(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el && el.closest(".cell");
    return cell && boardEl.contains(cell) ? Number(cell.dataset.i) : -1;
  }

  boardEl.addEventListener("pointerdown", (e) => {
    const i = cellAt(e);
    if (i < 0) return;
    e.preventDefault();
    if (assign[i] >= 0) {
      erase(assign[i]);
    } else if (!add(i)) {
      // Continue an unfinished neighbouring district, or start a new one.
      const open = neighbors(i, puzzle.n).map((nb) => assign[nb])
        .find((d) => d >= 0 && members(d).length < puzzle.n);
      if (open !== undefined) {
        cur = open;
        add(i);
      } else {
        cur = freeId();
        assign[i] = cur;
      }
    }
    dragging = cur !== null;
    render();
  });
  boardEl.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const i = cellAt(e);
    if (i >= 0 && add(i)) render();
  });
  const stop = () => { dragging = false; };
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);

  $("clear").addEventListener("click", () => { assign.fill(-1); cur = null; render(); });
  newBtn.addEventListener("click", () => start(true));
  $("mode").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.dataset.mode === prefs.mode) return;
    prefs.mode = b.dataset.mode;
    start();
  });
  $("size").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || Number(b.dataset.n) === prefs.n) return;
    prefs.n = Number(b.dataset.n);
    start();
  });

  start();
})();
