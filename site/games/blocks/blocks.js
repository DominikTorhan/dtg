(() => {
  const COLS = 10, ROWS = 20;
  const BEST_KEY = "dtg.blocks.best";
  const LINE_SCORE = [0, 100, 300, 500, 800];

  // Seven four-cell shapes, as offsets inside a 4x4 box.
  const SHAPES = [
    { color: "#4fb3bf", cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    { color: "#d9b44a", cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
    { color: "#9a6fd1", cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    { color: "#5ad17a", cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    { color: "#e5604f", cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    { color: "#5a84d1", cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    { color: "#e08a3c", cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  ];

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const nextCtx = document.getElementById("next").getContext("2d");
  const cell = canvas.width / COLS;
  const $ = (id) => document.getElementById(id);
  const scoreEl = $("score"), linesEl = $("lines"), levelEl = $("level"), bestEl = $("best");
  const startBtn = $("start");

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

  let grid, piece, next, bag, score, lines, level, running, paused, over, dropAcc, lastT;
  let best = Number(safeGet(BEST_KEY)) || 0;
  bestEl.textContent = best;

  function newBag() {
    const b = [0, 1, 2, 3, 4, 5, 6];
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }

  function take() {
    if (!bag.length) bag = newBag();
    const s = SHAPES[bag.pop()];
    const i = SHAPES.indexOf(s);
    return { color: s.color, cells: s.cells.map((c) => c.slice()), x: 3, y: -1, size: i === 0 ? 4 : 3, square: i === 1 };
  }

  function fits(cells, x, y) {
    return cells.every(([cx, cy]) => {
      const gx = x + cx, gy = y + cy;
      if (gx < 0 || gx >= COLS || gy >= ROWS) return false;
      return gy < 0 || !grid[gy][gx];
    });
  }

  function rotated(cells, dir, size) {
    // Rotate inside the piece's 3x3 (or 4x4) box so it stays roughly in place.
    return cells.map(([x, y]) => (dir > 0 ? [size - 1 - y, x] : [y, size - 1 - x]));
  }

  function rotate(dir) {
    if (piece.square) return;
    const r = rotated(piece.cells, dir, piece.size);
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]]) {
      if (fits(r, piece.x + dx, piece.y + dy)) {
        piece.cells = r;
        piece.x += dx;
        piece.y += dy;
        return;
      }
    }
  }

  function move(dx) {
    if (fits(piece.cells, piece.x + dx, piece.y)) piece.x += dx;
  }

  function softDrop() {
    if (fits(piece.cells, piece.x, piece.y + 1)) {
      piece.y++;
      score += 1;
    } else {
      lock();
    }
    dropAcc = 0;
  }

  function hardDrop() {
    while (fits(piece.cells, piece.x, piece.y + 1)) {
      piece.y++;
      score += 2;
    }
    lock();
  }

  function lock() {
    for (const [cx, cy] of piece.cells) {
      const gy = piece.y + cy;
      if (gy < 0) return gameOver();
      grid[gy][piece.x + cx] = piece.color;
    }
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (grid[y].every(Boolean)) {
        grid.splice(y, 1);
        grid.unshift(Array(COLS).fill(null));
        cleared++;
        y++;
      }
    }
    lines += cleared;
    score += LINE_SCORE[cleared] * level;
    level = 1 + Math.floor(lines / 10);
    piece = next;
    next = take();
    if (!fits(piece.cells, piece.x, piece.y)) gameOver();
    hud();
  }

  function hud() {
    scoreEl.textContent = score;
    linesEl.textContent = lines;
    levelEl.textContent = level;
  }

  function gravityMs() { return Math.max(80, 800 * Math.pow(0.85, level - 1)); }

  function block(c, x, y, color, alpha = 1) {
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
    c.globalAlpha = 1;
  }

  function draw(message) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (grid[y][x]) block(ctx, x, y, grid[y][x]);
    if (piece && !over) {
      let gy = piece.y;
      while (fits(piece.cells, piece.x, gy + 1)) gy++;
      for (const [cx, cy] of piece.cells) block(ctx, piece.x + cx, gy + cy, piece.color, 0.25);
      for (const [cx, cy] of piece.cells) if (piece.y + cy >= 0) block(ctx, piece.x + cx, piece.y + cy, piece.color);
    }
    nextCtx.clearRect(0, 0, 72, 72);
    if (next) {
      const s = 16;
      const xs = next.cells.map((c) => c[0]), ys = next.cells.map((c) => c[1]);
      const ox = (72 - (Math.max(...xs) - Math.min(...xs) + 1) * s) / 2 - Math.min(...xs) * s;
      const oy = (72 - (Math.max(...ys) - Math.min(...ys) + 1) * s) / 2 - Math.min(...ys) * s;
      nextCtx.fillStyle = next.color;
      for (const [cx, cy] of next.cells) nextCtx.fillRect(ox + cx * s + 1, oy + cy * s + 1, s - 2, s - 2);
    }
    if (message) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#e8e8ee";
      ctx.font = "bold 24px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(message, canvas.width / 2, canvas.height / 2);
    }
  }

  function loop(t) {
    if (!running) return;
    if (!paused) {
      dropAcc += t - lastT;
      if (dropAcc >= gravityMs()) {
        dropAcc = 0;
        if (fits(piece.cells, piece.x, piece.y + 1)) piece.y++;
        else lock();
      }
      if (running) draw();
    }
    lastT = t;
    requestAnimationFrame(loop);
  }

  function gameOver() {
    running = false;
    over = true;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      safeSet(BEST_KEY, best);
    }
    hud();
    draw("Game over");
    startBtn.textContent = "Play again";
  }

  function reset() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    bag = [];
    piece = null;
    next = null;
    score = 0;
    lines = 0;
    level = 1;
    over = false;
    hud();
  }

  function start() {
    reset();
    piece = take();
    next = take();
    paused = false;
    dropAcc = 0;
    startBtn.textContent = "Restart";
    startBtn.blur();
    if (!running) {
      running = true;
      lastT = performance.now();
      requestAnimationFrame(loop);
    }
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    draw(paused ? "Paused" : undefined);
  }

  function act(a) {
    if (!running || paused) return;
    if (a === "left") move(-1);
    else if (a === "right") move(1);
    else if (a === "rotate") rotate(1);
    else if (a === "rotateBack") rotate(-1);
    else if (a === "down") softDrop();
    else if (a === "drop") hardDrop();
    hud();
    if (running) draw();
  }

  const KEYS = {
    ArrowLeft: "left", a: "left", A: "left",
    ArrowRight: "right", d: "right", D: "right",
    ArrowUp: "rotate", x: "rotate", X: "rotate", w: "rotate", W: "rotate",
    z: "rotateBack", Z: "rotateBack",
    ArrowDown: "down", s: "down", S: "down",
    " ": "drop",
  };

  document.addEventListener("keydown", (e) => {
    if (e.key === "p" || e.key === "P" || e.key === "Escape") { togglePause(); return; }
    const a = KEYS[e.key];
    if (!a) return;
    e.preventDefault();
    if (!running && e.key === " ") { start(); return; }
    if (a === "drop" && e.repeat) return;
    act(a);
  });

  // Touch pad: hold left/right/down to repeat.
  document.querySelectorAll(".pad button").forEach((btn) => {
    let rep = null;
    const stop = () => { clearTimeout(rep); rep = null; };
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const a = btn.dataset.act;
      act(a);
      if (a === "left" || a === "right" || a === "down") {
        const again = (delay) => { rep = setTimeout(() => { act(a); again(60); }, delay); };
        again(200);
      }
    });
    btn.addEventListener("pointerup", stop);
    btn.addEventListener("pointerleave", stop);
    btn.addEventListener("pointercancel", stop);
  });

  startBtn.addEventListener("click", start);

  reset();
  draw("Press Start");
})();
