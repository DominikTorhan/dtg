(() => {
  const W = 400, H = 640;
  const R = 8;              // ball radius
  const G = 0.22;           // gravity, px / frame^2
  const SUB = 10;           // physics substeps per frame
  const MAX_V = 22;
  const BEST_KEY = "dtg.pinball.best";

  const canvas = document.getElementById("table");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const scoreEl = $("score"), ballsEl = $("balls"), bestEl = $("best"), startBtn = $("start");

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

  // ---------- table ----------

  const LANE_X = 350; // launch lane is between LANE_X and the right wall
  const walls = [
    // outer box with cut top corners
    [20, 640, 20, 110], [20, 110, 110, 20], [110, 20, 290, 20], [290, 20, 380, 110], [380, 110, 380, 640],
    // launch lane divider and floor
    [LANE_X, 200, LANE_X, 640], [LANE_X, 624, 380, 624],
    // inlane slopes down to the flippers
    [20, 470, 112, 556], [LANE_X, 470, 258, 556],
    // small guides above the slopes
    [50, 300, 50, 400], [320, 300, 320, 400],
  ].map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2 }));

  // Slingshots: segments that kick the ball away and score.
  const slings = [
    { x1: 80, y1: 420, x2: 115, y2: 490, kick: 5, pts: 25 },
    { x1: 290, y1: 420, x2: 255, y2: 490, kick: 5, pts: 25 },
  ];

  const bumpers = [
    { x: 125, y: 180, r: 22, pts: 100 },
    { x: 245, y: 180, r: 22, pts: 100 },
    { x: 185, y: 260, r: 22, pts: 100 },
    { x: 185, y: 110, r: 14, pts: 250 },
  ];

  // Rollover targets: light all three for a bonus.
  const targets = [
    { x: 90, y: 330, lit: false },
    { x: 185, y: 360, lit: false },
    { x: 280, y: 330, lit: false },
  ];

  const FL = 62, FW = 7; // flipper length and half-thickness
  const flippers = [
    { px: 112, py: 556, rest: 0.5, up: -0.45, dir: 1 },
    { px: 258, py: 556, rest: Math.PI - 0.5, up: Math.PI + 0.45, dir: -1 },
  ].map((f) => ({ ...f, a: f.rest, w: 0, pressed: false }));

  // ---------- state ----------

  let ball, score, balls, running, best, flash = [];
  // The ball can fall back into the launch lane, so judge by position.
  const inLaneNow = () => ball && ball.x > LANE_X && ball.y > 540;
  best = Number(safeGet(BEST_KEY)) || 0;
  bestEl.textContent = best;

  function addScore(n) {
    score += n;
    scoreEl.textContent = score;
  }

  function newBall() {
    ball = { x: 365, y: 610, vx: 0, vy: 0 };
  }

  function launch() {
    if (!running) return start();
    if (!inLaneNow() || Math.abs(ball.vy) > 1) return;
    ball.vy = -(17.5 + Math.random() * 1.5);
  }

  // ---------- physics ----------

  function closest(px, py, s) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / (dx * dx + dy * dy)));
    return [s.x1 + t * dx, s.y1 + t * dy];
  }

  // Push the ball out of a surface and reflect it. (svx, svy) is the
  // surface's own velocity at the contact point (non-zero for flippers).
  function collide(cx, cy, minDist, e, svx = 0, svy = 0) {
    let nx = ball.x - cx, ny = ball.y - cy;
    const d = Math.hypot(nx, ny);
    if (d >= minDist || d === 0) return false;
    nx /= d; ny /= d;
    ball.x = cx + nx * minDist;
    ball.y = cy + ny * minDist;
    const vn = (ball.vx - svx) * nx + (ball.vy - svy) * ny;
    if (vn < 0) {
      ball.vx -= (1 + e) * vn * nx;
      ball.vy -= (1 + e) * vn * ny;
    }
    return true;
  }

  function stepFlipper(f, h) {
    const target = f.pressed ? f.up : f.rest;
    const speed = f.pressed ? 0.32 : 0.18; // rad / frame
    const diff = target - f.a;
    const stepA = Math.sign(diff) * Math.min(Math.abs(diff), speed * h);
    f.w = stepA / h;
    f.a += stepA;
  }

  function physics() {
    const h = 1 / SUB;
    for (let i = 0; i < SUB; i++) {
      flippers.forEach((f) => stepFlipper(f, h));
      ball.vy += G * h;
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > MAX_V) { ball.vx *= MAX_V / sp; ball.vy *= MAX_V / sp; }
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;

      for (const s of walls) {
        const [cx, cy] = closest(ball.x, ball.y, s);
        collide(cx, cy, R, 0.4);
      }
      for (const s of slings) {
        const [cx, cy] = closest(ball.x, ball.y, s);
        if (collide(cx, cy, R + 2, 0.5)) {
          const nx = ball.x - cx, ny = ball.y - cy, d = Math.hypot(nx, ny) || 1;
          ball.vx += (nx / d) * s.kick;
          ball.vy += (ny / d) * s.kick;
          addScore(s.pts);
          flash.push({ obj: s, t: 8 });
        }
      }
      for (const b of bumpers) {
        if (collide(b.x, b.y, b.r + R, 0.6)) {
          const nx = ball.x - b.x, ny = ball.y - b.y, d = Math.hypot(nx, ny) || 1;
          ball.vx += (nx / d) * 4;
          ball.vy += (ny / d) * 4;
          addScore(b.pts);
          flash.push({ obj: b, t: 8 });
        }
      }
      for (const f of flippers) {
        const tip = { x1: f.px, y1: f.py, x2: f.px + FL * Math.cos(f.a), y2: f.py + FL * Math.sin(f.a) };
        const [cx, cy] = closest(ball.x, ball.y, tip);
        // Surface velocity of a rotating segment: w x r.
        const svx = -f.w * (cy - f.py), svy = f.w * (cx - f.px);
        collide(cx, cy, R + FW, 0.3, svx, svy);
      }
    }

    for (const t of targets) {
      if (!t.lit && Math.hypot(ball.x - t.x, ball.y - t.y) < R + 8) {
        t.lit = true;
        addScore(50);
        if (targets.every((x) => x.lit)) {
          addScore(1000);
          targets.forEach((x) => { x.lit = false; });
          flash.push({ obj: "bonus", t: 40 });
        }
      }
    }

    if (ball.y > H + 20) drain();
  }

  function drain() {
    balls--;
    ballsEl.textContent = balls;
    if (balls <= 0) return gameOver();
    newBall();
  }

  // ---------- drawing ----------

  function line(s, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }

  function lit(obj) { return flash.some((f) => f.obj === obj); }

  function draw(message) {
    ctx.clearRect(0, 0, W, H);
    walls.forEach((s) => line(s, "#5a6070", 4));
    slings.forEach((s) => line(s, lit(s) ? "#fff" : "#f2b84b", 6));
    for (const b of bumpers) {
      ctx.fillStyle = lit(b) ? "#ffffff" : "#e5604f";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1c1f28";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const t of targets) {
      ctx.fillStyle = t.lit ? "#5ad17a" : "#2c3a30";
      ctx.beginPath();
      ctx.arc(t.x, t.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const f of flippers) {
      line({ x1: f.px, y1: f.py, x2: f.px + FL * Math.cos(f.a), y2: f.py + FL * Math.sin(f.a) }, "#5ad17a", FW * 2);
    }
    if (ball) {
      ctx.fillStyle = "#e8e8ee";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2);
      ctx.fill();
    }
    if (flash.some((f) => f.obj === "bonus")) {
      ctx.fillStyle = "#f2b84b";
      ctx.font = "bold 28px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("+1000", W / 2 - 15, 420);
    }
    if (running && inLaneNow()) {
      ctx.fillStyle = "#9a9cab";
      ctx.font = "14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Space / tap to launch", W / 2 - 15, 620);
    }
    if (message) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#e8e8ee";
      ctx.font = "bold 28px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(message, W / 2, H / 2);
    }
    flash = flash.filter((f) => --f.t > 0);
  }

  function loop() {
    if (!running) return;
    physics();
    if (running) draw();
    requestAnimationFrame(loop);
  }

  // ---------- game flow ----------

  function start() {
    score = 0;
    balls = 3;
    scoreEl.textContent = 0;
    ballsEl.textContent = balls;
    targets.forEach((t) => { t.lit = false; });
    newBall();
    startBtn.textContent = "Restart";
    startBtn.blur();
    if (!running) {
      running = true;
      requestAnimationFrame(loop);
    }
  }

  function gameOver() {
    running = false;
    ball = null;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      safeSet(BEST_KEY, best);
    }
    draw("Game over");
    startBtn.textContent = "Play again";
  }

  // ---------- input ----------

  const LEFT = ["ArrowLeft", "z", "Z", "a", "A", "Shift"];
  const RIGHT = ["ArrowRight", "m", "M", "l", "L", "/"];

  function key(e, down) {
    if (LEFT.includes(e.key)) { flippers[0].pressed = down; e.preventDefault(); }
    else if (RIGHT.includes(e.key)) { flippers[1].pressed = down; e.preventDefault(); }
    else if (e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      if (down && !e.repeat) launch();
    }
  }
  document.addEventListener("keydown", (e) => key(e, true));
  document.addEventListener("keyup", (e) => key(e, false));

  // Each touch holds the flipper on its side of the table.
  const touches = new Map();
  function sideOf(e) {
    const r = canvas.getBoundingClientRect();
    return e.clientX - r.left < r.width / 2 ? 0 : 1;
  }
  function syncTouches() {
    flippers[0].pressed = [...touches.values()].includes(0);
    flippers[1].pressed = [...touches.values()].includes(1);
  }
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!running || inLaneNow()) { launch(); return; }
    canvas.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, sideOf(e));
    syncTouches();
  });
  const release = (e) => { touches.delete(e.pointerId); syncTouches(); };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  startBtn.addEventListener("click", start);

  draw("Press Start");
})();
