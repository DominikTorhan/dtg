(() => {
  const { WATER, CLOVER, generate, region } = FenceGen;
  const PREFIX = "dtg.fence.";

  const $ = (id) => document.getElementById(id);
  const boardEl = $("board"), statusEl = $("status"), leftEl = $("left");
  const scoreEl = $("score"), bestEl = $("best"), newBtn = $("new");

  function load(k) { try { return JSON.parse(localStorage.getItem(PREFIX + k)); } catch { return null; } }
  function save(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch { /* ignore */ } }

  let prefs = load("prefs") || { mode: "daily", randomSeed: null };
  let puzzle, seed, fences, cellEls;

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function start(newRandom = false) {
    if (prefs.mode === "daily") {
      seed = `daily/${today()}`;
    } else {
      if (newRandom || !prefs.randomSeed) prefs.randomSeed = `random/${Date.now()}`;
      seed = prefs.randomSeed;
    }
    save("prefs", prefs);
    puzzle = generate(seed);
    const saved = load("board/" + seed);
    fences = new Set(Array.isArray(saved) ? saved.filter((i) => puzzle.tiles[i] !== WATER && i !== puzzle.sheep) : []);
    build();
    render();
    document.querySelectorAll("#mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === prefs.mode)));
    newBtn.hidden = prefs.mode !== "random";
  }

  function build() {
    const { n, tiles, sheep } = puzzle;
    boardEl.style.setProperty("--n", n);
    boardEl.innerHTML = "";
    cellEls = tiles.map((t, i) => {
      const el = document.createElement("button");
      el.className = "cell" + (t === WATER ? " water" : "");
      el.dataset.i = i;
      if (i === sheep) el.textContent = "🐑";
      else if (t === CLOVER) el.textContent = "🍀";
      if (t === WATER) { el.disabled = true; el.setAttribute("aria-label", "water"); }
      boardEl.appendChild(el);
      return el;
    });
  }

  function render() {
    const r = region(puzzle, fences);
    const path = new Set(r.escaped ? r.path : []);
    cellEls.forEach((el, i) => {
      el.classList.toggle("fence", fences.has(i));
      el.classList.toggle("inside", !r.escaped && r.cells.has(i));
      el.classList.toggle("path", path.has(i) && i !== puzzle.sheep);
    });
    boardEl.classList.toggle("won", !r.escaped);
    leftEl.textContent = puzzle.budget - fences.size;

    const best = load("best/" + seed);
    if (r.escaped) {
      scoreEl.textContent = "–";
      statusEl.textContent = fences.size ? "The sheep can still get out." : "Place fences so the sheep can't reach the edge.";
    } else {
      scoreEl.textContent = r.score;
      statusEl.textContent = `Enclosed! ${r.cells.size} tiles` +
        (r.score > r.cells.size ? ` + clover bonus = ${r.score} points.` : ` = ${r.score} points.`) +
        (best !== null && r.score < best ? ` Your best on this puzzle is ${best}.` : "");
      if (best === null || r.score > best) save("best/" + seed, r.score);
    }
    const b = load("best/" + seed);
    bestEl.textContent = b === null ? "–" : b;
    save("board/" + seed, [...fences]);
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".cell");
    if (!el || el.disabled) return;
    const i = Number(el.dataset.i);
    if (i === puzzle.sheep) return;
    if (fences.has(i)) fences.delete(i);
    else if (fences.size < puzzle.budget) fences.add(i);
    else { statusEl.textContent = "No fences left. Tap a fence to pick it up."; return; }
    render();
  });

  $("clear").addEventListener("click", () => { fences.clear(); render(); });
  newBtn.addEventListener("click", () => start(true));
  $("mode").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.dataset.mode === prefs.mode) return;
    prefs.mode = b.dataset.mode;
    start();
  });

  start();
})();
