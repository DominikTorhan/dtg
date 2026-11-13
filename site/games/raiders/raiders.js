(() => {
  const W = 480, H = 560;
  const COLS = 9, ROWS = 5;
  const SHIP_Y = 520, SHIP_W = 34, SHIP_SPEED = 4.5;
  const BEST_KEY = "dtg.raiders.best";
  const ROW_STYLE = [ // top to bottom: shape, colour, points
    { shape: "diamond", color: "#e5604f", pts: 40 },
    { shape: "diamond", color: "#e5604f", pts: 40 },
    { shape: "ring", color: "#f2b84b", pts: 20 },
    { shape: "tri", color: "#9a6fd1", pts: 10 },
    { shape: "tri", color: "#9a6fd1", pts: 10 },
  ];

  const canvas = document.getElementById("field");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const scoreEl = $("score"), livesEl = $("lives"), waveEl = $("wave"), bestEl = $("best"), startBtn = $("start");

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

  let ship, shots, bombs, foes, shields, fx, score, lives, wave, running, paused;
  let foeDir, foeTimer, frame, respawn, fireCooldown;
  let best = Number(safeGet(BEST_KEY)) || 0;
  bestEl.textContent = best;
  const input = { left: false, right: false, fire: false, pointerX: null };

  function hud() {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    waveEl.textContent = wave;
  }

  function buildWave() {
    foes = [];
    const top = 60 + Math.min(wave - 1, 5) * 16;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        foes.push({ x: 60 + c * 40, y: top + r * 34, ...ROW_STYLE[r], alive: true });
    foeDir = 1;
    foeTimer = 0;
    shots = [];
    bombs = [];
  }

  function buildShields() {
    shields = [];
    const B = 6; // block size
    for (let s = 0; s < 4; s++) {
      const ox = 50 + s * 110;
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 10; x++) {
          if (y >= 3 && x >= 3 && x <= 6) continue; // arch
          if (y === 0 && (x === 0 || x === 9)) continue; // rounded top
          shields.push({ x: ox + x * B, y: 440 + y * B, s: B, hp: 2 });
        }
    }
  }

  function start() {
    score = 0;
    lives = 3;
    wave = 1;
    ship = { x: W / 2 };
    fx = [];
    frame = 0;
    respawn = 0;
    fireCooldown = 0;
    paused = false;
    buildWave();
    buildShields();
    hud();
    startBtn.textContent = "Restart";
    startBtn.blur();
    if (!running) {
      running = true;
      requestAnimationFrame(loop);
    }
  }

  function alive() { return foes.filter((f) => f.alive); }

  function hit(a, b) { return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2; }

  function boom(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2.5;
      fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 24, color });
    }
  }

  function shieldHit(p) {
    for (const b of shields) {
      if (b.hp > 0 && p.x >= b.x - 1 && p.x <= b.x + b.s + 1 && p.y >= b.y && p.y <= b.y + b.s) {
        b.hp--;
        return true;
      }
    }
    return false;
  }

  function update() {
    frame++;
    const living = alive();

    // ship
    if (respawn > 0) {
      respawn--;
    } else {
      if (input.pointerX !== null) {
        const d = input.pointerX - ship.x;
        ship.x += Math.sign(d) * Math.min(Math.abs(d), SHIP_SPEED * 1.5);
      }
      if (input.left) ship.x -= SHIP_SPEED;
      if (input.right) ship.x += SHIP_SPEED;
      ship.x = Math.max(SHIP_W / 2 + 4, Math.min(W - SHIP_W / 2 - 4, ship.x));
      if (fireCooldown > 0) fireCooldown--;
      if (input.fire && fireCooldown === 0 && shots.length < 2) {
        shots.push({ x: ship.x, y: SHIP_Y - 14 });
        fireCooldown = 18;
      }
    }

    // player shots
    for (const s of shots) {
      s.y -= 9;
      if (shieldHit(s)) { s.dead = true; continue; }
      for (const f of living) {
        if (f.alive && hit({ x: s.x, y: s.y, w: 3, h: 12 }, { x: f.x, y: f.y, w: 28, h: 22 })) {
          f.alive = false;
          s.dead = true;
          score += f.pts;
          boom(f.x, f.y, f.color);
          hud();
          break;
        }
      }
      if (s.y < 0) s.dead = true;
    }
    shots = shots.filter((s) => !s.dead);

    // formation: moves in steps, faster as fewer remain
    const left = alive();
    if (!left.length) {
      wave++;
      hud();
      buildWave();
      return;
    }
    const interval = Math.max(2, Math.round(4 + left.length * 0.75 - wave));
    if (++foeTimer >= interval) {
      foeTimer = 0;
      const minX = Math.min(...left.map((f) => f.x)), maxX = Math.max(...left.map((f) => f.x));
      if ((foeDir > 0 && maxX + 8 > W - 20) || (foeDir < 0 && minX - 8 < 20)) {
        foeDir = -foeDir;
        left.forEach((f) => { f.y += 14; });
      } else {
        left.forEach((f) => { f.x += 6 * foeDir; });
      }
    }
    // foes eat shields they touch; reaching the ship's row ends the game
    for (const f of left) {
      for (const b of shields) if (b.hp > 0 && Math.abs(b.x - f.x) < 16 && Math.abs(b.y - f.y) < 12) b.hp = 0;
      if (f.y + 11 >= SHIP_Y - 10) return gameOver();
    }

    // bombs from the lowest foe in a random column
    if (Math.random() < 0.012 + wave * 0.004 && bombs.length < 3 + wave) {
      const cols = {};
      for (const f of left) if (!cols[f.x] || cols[f.x].y < f.y) cols[f.x] = f;
      const shooters = Object.values(cols);
      const f = shooters[Math.floor(Math.random() * shooters.length)];
      bombs.push({ x: f.x, y: f.y + 12, v: 3 + Math.min(wave, 6) * 0.3 });
    }
    for (const b of bombs) {
      b.y += b.v;
      if (shieldHit(b)) b.dead = true;
      else if (respawn === 0 && hit({ x: b.x, y: b.y, w: 4, h: 10 }, { x: ship.x, y: SHIP_Y, w: SHIP_W, h: 16 })) {
        b.dead = true;
        boom(ship.x, SHIP_Y, "#5ad17a");
        lives--;
        hud();
        if (lives <= 0) return gameOver();
        respawn = 90;
        bombs = [];
        return;
      }
      if (b.y > H) b.dead = true;
    }
    bombs = bombs.filter((b) => !b.dead);

    for (const p of fx) { p.x += p.vx; p.y += p.vy; p.t--; }
    fx = fx.filter((p) => p.t > 0);
  }

  function drawFoe(f) {
    const wobble = Math.floor(frame / 20) % 2 ? 2 : -2;
    ctx.fillStyle = f.color;
    ctx.strokeStyle = f.color;
    ctx.beginPath();
    if (f.shape === "diamond") {
      ctx.moveTo(f.x, f.y - 11); ctx.lineTo(f.x + 13, f.y); ctx.lineTo(f.x, f.y + 11); ctx.lineTo(f.x - 13, f.y);
      ctx.fill();
    } else if (f.shape === "ring") {
      ctx.lineWidth = 5;
      ctx.arc(f.x, f.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.moveTo(f.x - 13, f.y - 9); ctx.lineTo(f.x + 13, f.y - 9); ctx.lineTo(f.x, f.y + 11);
      ctx.fill();
    }
    // little legs that alternate as the formation marches
    ctx.fillRect(f.x - 10 + wobble, f.y + 9, 3, 4);
    ctx.fillRect(f.x + 7 - wobble, f.y + 9, 3, 4);
    ctx.fillStyle = "#0b0d12";
    ctx.fillRect(f.x - 5, f.y - 3, 3, 3);
    ctx.fillRect(f.x + 2, f.y - 3, 3, 3);
  }

  function draw(message) {
    ctx.clearRect(0, 0, W, H);
    for (const b of shields) {
      if (b.hp <= 0) continue;
      ctx.fillStyle = b.hp === 2 ? "#3f9a5a" : "#2a5a3a";
      ctx.fillRect(b.x, b.y, b.s, b.s);
    }
    if (foes) alive().forEach(drawFoe);
    if (ship && (respawn === 0 || Math.floor(respawn / 6) % 2)) {
      ctx.fillStyle = "#5ad17a";
      ctx.beginPath();
      ctx.moveTo(ship.x, SHIP_Y - 14);
      ctx.lineTo(ship.x + SHIP_W / 2, SHIP_Y + 8);
      ctx.lineTo(ship.x - SHIP_W / 2, SHIP_Y + 8);
      ctx.fill();
    }
    ctx.fillStyle = "#e8e8ee";
    for (const s of shots || []) ctx.fillRect(s.x - 1.5, s.y - 6, 3, 12);
    ctx.fillStyle = "#f2b84b";
    for (const b of bombs || []) {
      ctx.fillRect(b.x - 2 + (Math.floor(b.y / 6) % 2 ? 1 : -1), b.y - 5, 4, 10);
    }
    for (const p of fx || []) {
      ctx.globalAlpha = p.t / 24;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#2c303c";
    ctx.fillRect(0, H - 14, W, 2);
    if (message) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#e8e8ee";
      ctx.font = "bold 28px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(message, W / 2, H / 2);
    }
  }

  function loop() {
    if (!running) return;
    if (!paused) {
      update();
      if (running) draw();
    }
    requestAnimationFrame(loop);
  }

  function gameOver() {
    running = false;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      safeSet(BEST_KEY, best);
    }
    draw("Game over");
    startBtn.textContent = "Play again";
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    draw(paused ? "Paused" : undefined);
  }

  function key(e, down) {
    switch (e.key) {
      case "ArrowLeft": case "a": case "A": input.left = down; break;
      case "ArrowRight": case "d": case "D": input.right = down; break;
      case " ": case "ArrowUp": case "w": case "W":
        if (down && !running) { start(); break; }
        input.fire = down; break;
      case "p": case "P": case "Escape": if (down) togglePause(); break;
      default: return;
    }
    e.preventDefault();
  }
  document.addEventListener("keydown", (e) => key(e, true));
  document.addEventListener("keyup", (e) => key(e, false));

  function pointerX(e) {
    const r = canvas.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * W;
  }
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!running) { start(); return; }
    canvas.setPointerCapture(e.pointerId);
    input.pointerX = pointerX(e);
    input.fire = true;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (input.pointerX !== null) input.pointerX = pointerX(e);
  });
  const up = () => { input.pointerX = null; input.fire = false; };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);

  startBtn.addEventListener("click", start);

  buildShields();
  draw("Press Start");
})();
