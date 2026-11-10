(() => {
  const GRID = 20;
  const TICK_MS = 110;
  const BEST_KEY = "dtg.snake.best";

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const cell = canvas.width / GRID;
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const startBtn = document.getElementById("start");

  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();

  let snake, dir, nextDir, food, score, timer, paused;
  let best = Number(safeGet(BEST_KEY)) || 0;
  bestEl.textContent = best;

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

  function reset() {
    snake = [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }];
    dir = { x: 1, y: 0 };
    nextDir = dir;
    score = 0;
    paused = false;
    scoreEl.textContent = score;
    placeFood();
  }

  function placeFood() {
    do {
      food = { x: rand(GRID), y: rand(GRID) };
    } while (snake.some((s) => s.x === food.x && s.y === food.y));
  }

  function rand(n) { return Math.floor(Math.random() * n); }

  function step() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
    const hitSelf = snake.some((s) => s.x === head.x && s.y === head.y);
    if (hitWall || hitSelf) return gameOver();

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score++;
      scoreEl.textContent = score;
      placeFood();
    } else {
      snake.pop();
    }
    draw();
  }

  function draw(message) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color("--danger");
    ctx.fillRect(food.x * cell + 3, food.y * cell + 3, cell - 6, cell - 6);
    snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? color("--accent-2") : color("--accent");
      ctx.fillRect(s.x * cell + 1, s.y * cell + 1, cell - 2, cell - 2);
    });
    if (message) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color("--fg");
      ctx.font = "bold 28px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(message, canvas.width / 2, canvas.height / 2);
    }
  }

  function gameOver() {
    clearInterval(timer);
    timer = null;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      safeSet(BEST_KEY, best);
    }
    draw("Game over");
    startBtn.textContent = "Play again";
  }

  function start() {
    clearInterval(timer);
    reset();
    draw();
    timer = setInterval(step, TICK_MS);
    startBtn.textContent = "Restart";
    startBtn.blur();
  }

  function togglePause() {
    if (!timer && !paused) return;
    paused = !paused;
    if (paused) {
      clearInterval(timer);
      timer = null;
      draw("Paused");
    } else {
      timer = setInterval(step, TICK_MS);
    }
  }

  function turn(x, y) {
    // Ignore reversing straight into yourself.
    if (x === -dir.x && y === -dir.y) return;
    nextDir = { x, y };
  }

  const KEYS = {
    ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
    ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
    ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
    ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
  };

  document.addEventListener("keydown", (e) => {
    if (e.key === " ") {
      e.preventDefault();
      if (!timer && !paused) start(); else togglePause();
      return;
    }
    const k = KEYS[e.key];
    if (k) {
      e.preventDefault();
      turn(k[0], k[1]);
    }
  });

  let touchStart = null;
  canvas.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  canvas.addEventListener("touchend", (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) turn(Math.sign(dx), 0);
    else turn(0, Math.sign(dy));
  });

  startBtn.addEventListener("click", start);

  reset();
  draw("Press Start");
})();
