(() => {
  const W = 640, H = 400, WATER = 378;
  const R = 8;                 // unit radius
  const G = 0.2;               // gravity, px / frame^2
  const MAX_V = 12;            // projectile speed at full power
  const WIND_K = 0.03;         // wind acceleration per unit of wind
  const BLAST = 28, DMG_R = 42, DMG = 50;
  const WALK = 70;             // walking budget per turn, px
  const BEST_KEY = "dtg.artillery.best";
  const TEAM = [
    { name: "You", color: "#5ad17a" },
    { name: "CPU", color: "#e08a3c" },
  ];

  const canvas = document.getElementById("field");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const levelEl = $("level"), windEl = $("wind"), bestEl = $("best"), statusEl = $("status"), startBtn = $("start");

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

  let levelTimer = null;
  let ground, units, turnTeam, turnIdx, active, wind, phase, shot, blasts, level, walked, power, charging, wait, msg;
  let best = Number(safeGet(BEST_KEY)) || 0;
  bestEl.textContent = best || "–";
  const input = { left: false, right: false, up: false, down: false };

  // ---------- world ----------

  function makeGround() {
    ground = new Float32Array(W);
    const waves = [0, 1, 2, 3].map((i) => ({
      a: 60 / (i + 1), f: (0.004 + Math.random() * 0.006) * (i + 1), p: Math.random() * 7,
    }));
    for (let x = 0; x < W; x++) {
      let y = 260;
      for (const w of waves) y += w.a * Math.sin(x * w.f + w.p);
      ground[x] = Math.max(110, Math.min(WATER + 20, y));
    }
  }

  const gy = (x) => ground[Math.max(0, Math.min(W - 1, Math.round(x)))];

  function placeUnits(perTeam) {
    units = [];
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < perTeam; i++) {
        let x, tries = 0;
        do {
          x = (t === 0 ? 30 : W / 2 + 30) + Math.random() * (W / 2 - 60);
          tries++;
        } while ((gy(x) > WATER - 6 || units.some((u) => Math.abs(u.x - x) < 40)) && tries < 200);
        units.push({ team: t, x, y: gy(x) - R, vy: 0, hp: 100, alive: true, facing: t === 0 ? 1 : -1, aim: 45 });
      }
    }
  }

  function carve(cx, cy, r) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) {
      const dy = Math.sqrt(Math.max(0, r * r - (x - cx) * (x - cx)));
      ground[x] = Math.max(ground[x], cy + dy);
    }
  }

  // ---------- projectile (shared by the real shot and the CPU's planning) ----------

  function launchVec(u, aimDeg, pow) {
    const a = (aimDeg * Math.PI) / 180;
    return {
      x: u.x + u.facing * Math.cos(a) * (R + 4),
      y: u.y - Math.sin(a) * (R + 4),
      vx: u.facing * Math.cos(a) * MAX_V * pow,
      vy: -Math.sin(a) * MAX_V * pow,
    };
  }

  // Advance one frame. Returns null while flying, or where/how it ended.
  function stepShot(p, shooter, age) {
    const n = 4; // substeps so fast shots don't skip thin ground
    for (let i = 0; i < n; i++) {
      p.vx += (wind * WIND_K) / n;
      p.vy += G / n;
      p.x += p.vx / n;
      p.y += p.vy / n;
      if (p.x < -60 || p.x > W + 60 || p.y > H + 20) return { kind: "lost", x: p.x, y: p.y };
      if (p.x >= 0 && p.x < W && p.y >= gy(p.x)) return { kind: "hit", x: p.x, y: p.y };
      for (const u of units) {
        if (!u.alive || (u === shooter && age < 12)) continue;
        if (Math.hypot(u.x - p.x, u.y - p.y) < R + 2) return { kind: "hit", x: p.x, y: p.y };
      }
    }
    return null;
  }

  function explode(x, y) {
    carve(x, y, BLAST);
    blasts.push({ x, y, t: 20 });
    for (const u of units) {
      if (!u.alive) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < DMG_R) {
        u.hp -= Math.round(DMG * (1 - d / DMG_R)) + 5;
        u.vy = -2.5; // small hop
        if (u.hp <= 0) { u.hp = 0; u.alive = false; blasts.push({ x: u.x, y: u.y, t: 14 }); }
      }
    }
  }

  // ---------- turns ----------

  function team(t) { return units.filter((u) => u.team === t && u.alive); }

  function nextTurn() {
    if (!team(0).length) return endGame();
    if (!team(1).length) return levelWon();
    turnTeam = 1 - turnTeam;
    const list = team(turnTeam);
    turnIdx[turnTeam] = (turnIdx[turnTeam] + 1) % list.length;
    active = list[turnIdx[turnTeam]];
    wind = Math.round((Math.random() * 2 - 1) * Math.min(1, 0.4 + level * 0.15) * 10) / 10;
    windEl.textContent = (wind > 0 ? "→ " : wind < 0 ? "← " : "") + Math.abs(wind * 10).toFixed(0);
    walked = 0;
    power = 0;
    charging = false;
    phase = "aim";
    if (turnTeam === 1) {
      statusEl.textContent = "CPU is aiming…";
      planCpu();
    } else {
      statusEl.textContent = "Your turn.";
    }
  }

  function fire() {
    if (phase !== "aim") return;
    const p = launchVec(active, active.aim, Math.max(0.15, power));
    shot = { ...p, age: 0 };
    phase = "flight";
    charging = false;
  }

  function planCpu() {
    const me = active;
    const foes = team(0);
    const target = foes.reduce((a, b) => (Math.abs(a.x - me.x) < Math.abs(b.x - me.x) ? a : b));
    let bestPlan = null;
    for (const facing of [-1, 1]) {
      me.facing = facing;
      for (let aim = -10; aim <= 85; aim += 5) {
        for (let pow = 0.3; pow <= 1.001; pow += 0.05) {
          const p = launchVec(me, aim, pow);
          let end = null;
          for (let age = 0; age < 400 && !end; age++) end = stepShot(p, me, age);
          if (!end || end.kind === "lost") continue;
          let cost = Math.hypot(end.x - target.x, end.y - target.y);
          if (Math.hypot(end.x - me.x, end.y - me.y) < DMG_R) cost += 200; // don't hit yourself
          if (!bestPlan || cost < bestPlan.cost) bestPlan = { cost, facing, aim, pow };
        }
      }
    }
    if (!bestPlan) bestPlan = { facing: Math.sign(target.x - me.x) || 1, aim: 45, pow: 0.7 };
    // The CPU gets more accurate each level.
    const err = Math.max(0.15, 1.2 - level * 0.2);
    me.facing = bestPlan.facing;
    me.aim = Math.max(-20, Math.min(89, bestPlan.aim + (Math.random() * 2 - 1) * 6 * err));
    const targetPow = Math.max(0.2, Math.min(1, bestPlan.pow + (Math.random() * 2 - 1) * 0.06 * err));
    wait = { frames: 50, then: () => { charging = true; wait = { untilPower: targetPow }; } };
  }

  function levelWon() {
    phase = "between";
    msg = `Level ${level} cleared!`;
    statusEl.textContent = "Next level in a moment…";
    level++;
    if (level - 1 > best) { best = level - 1; bestEl.textContent = best; safeSet(BEST_KEY, best); }
    levelTimer = setTimeout(newLevel, 1800);
  }

  function endGame() {
    phase = "over";
    msg = "Your team is gone";
    statusEl.textContent = `You cleared ${level - 1} level${level === 2 ? "" : "s"}. Press New game.`;
  }

  function newLevel() {
    clearTimeout(levelTimer);
    msg = null;
    levelEl.textContent = level;
    makeGround();
    placeUnits(2);
    blasts = [];
    shot = null;
    wait = null;
    turnIdx = [-1, -1];
    turnTeam = 1; // nextTurn flips to the player
    nextTurn();
  }

  function newGame() {
    level = 1;
    startBtn.blur();
    newLevel();
  }

  // ---------- update ----------

  function settleUnits() {
    let moving = false;
    for (const u of units) {
      if (!u.alive) continue;
      const floor = gy(u.x) - R;
      if (u.y < floor || u.vy < 0) {
        u.vy += G;
        u.y += u.vy;
        moving = true;
        if (u.y >= floor) { u.y = floor; u.vy = 0; }
      } else {
        u.y = floor;
      }
      if (u.y > WATER) { u.alive = false; u.hp = 0; blasts.push({ x: u.x, y: WATER, t: 14 }); }
    }
    return moving;
  }

  function walk(dir) {
    if (walked >= WALK) return;
    active.facing = dir;
    const nx = active.x + dir;
    if (nx < R || nx > W - R) return;
    if (gy(nx) - R < active.y - 5) return; // too steep to climb
    active.x = nx;
    walked++;
  }

  function update() {
    const moving = settleUnits();
    if (phase === "aim") {
      if (active && !active.alive) { phase = "settle"; wait = { frames: 30 }; }
      else if (turnTeam === 0) {
        if (input.left) walk(-1);
        if (input.right) walk(1);
        if (input.up) active.aim = Math.min(89, active.aim + 1);
        if (input.down) active.aim = Math.max(-20, active.aim - 1);
      }
      if (charging) {
        power = Math.min(1, power + 0.013);
        if (power >= 1 && turnTeam === 0) fire();
      }
      if (wait) {
        if (wait.frames !== undefined && --wait.frames <= 0) { const t = wait.then; wait = null; if (t) t(); }
        else if (wait.untilPower !== undefined && power >= wait.untilPower) { wait = null; fire(); }
      }
    } else if (phase === "flight") {
      const end = stepShot(shot, active, shot.age++);
      if (end) {
        if (end.kind === "hit") explode(end.x, end.y);
        shot = null;
        phase = "settle";
        wait = { frames: 40 };
      }
    } else if (phase === "settle") {
      if (!moving && --wait.frames <= 0) { wait = null; nextTurn(); }
    }
    blasts.forEach((b) => b.t--);
    blasts = blasts.filter((b) => b.t > 0);
  }

  // ---------- drawing ----------

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#4a6b3a";
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x < W; x++) ctx.lineTo(x, ground[x]);
    ctx.lineTo(W, H);
    ctx.fill();
    ctx.strokeStyle = "#7fae5c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x < W; x++) ctx.lineTo(x, ground[x]);
    ctx.stroke();
    ctx.fillStyle = "rgba(60, 120, 200, 0.75)";
    ctx.fillRect(0, WATER, W, H - WATER);

    for (const u of units) {
      if (!u.alive) continue;
      ctx.fillStyle = TEAM[u.team].color;
      ctx.beginPath();
      ctx.arc(u.x, u.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(u.x + u.facing * 2 - 1, u.y - 4, 3, 3);
      ctx.fillRect(u.x + u.facing * 5 - 1, u.y - 4, 3, 3);
      ctx.fillStyle = "#e8e8ee";
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(u.hp, u.x, u.y - 13);
    }

    if (phase === "aim" && active) {
      // marker above the active unit
      ctx.fillStyle = "#e8e8ee";
      ctx.beginPath();
      ctx.moveTo(active.x - 5, active.y - 30);
      ctx.lineTo(active.x + 5, active.y - 30);
      ctx.lineTo(active.x, active.y - 24);
      ctx.fill();
      // aim line and power bar
      const a = (active.aim * Math.PI) / 180;
      const len = 22 + power * 30;
      ctx.strokeStyle = TEAM[active.team].color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(active.x, active.y);
      ctx.lineTo(active.x + active.facing * Math.cos(a) * len, active.y - Math.sin(a) * len);
      ctx.stroke();
      ctx.setLineDash([]);
      if (turnTeam === 0) {
        ctx.fillStyle = "#2c303c";
        ctx.fillRect(12, 12, 120, 8);
        ctx.fillStyle = "#f2b84b";
        ctx.fillRect(12, 12, 120 * power, 8);
        ctx.fillStyle = "#2c303c";
        ctx.fillRect(12, 24, 120, 4);
        ctx.fillStyle = "#9a9cab";
        ctx.fillRect(12, 24, 120 * (1 - walked / WALK), 4);
      }
    }

    if (shot) {
      ctx.fillStyle = "#e8e8ee";
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of blasts) {
      ctx.fillStyle = `rgba(242, 184, 75, ${b.t / 20})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BLAST * (1.3 - b.t / 40), 0, Math.PI * 2);
      ctx.fill();
    }
    // wind arrow
    ctx.strokeStyle = "#9a9cab";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, 18);
    ctx.lineTo(W / 2 + wind * 40, 18);
    ctx.stroke();

    if (msg) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#e8e8ee";
      ctx.font = "bold 26px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(msg, W / 2, H / 2);
    }
  }

  function loop() {
    if (phase !== "over" && phase !== "between") update();
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- input ----------

  function canAct() { return phase === "aim" && turnTeam === 0; }
  function startCharge() { if (canAct() && !charging) { charging = true; power = 0; } }
  function releaseCharge() { if (canAct() && charging) fire(); }

  const KEYMAP = {
    ArrowLeft: "left", a: "left", A: "left",
    ArrowRight: "right", d: "right", D: "right",
    ArrowUp: "up", w: "up", W: "up",
    ArrowDown: "down", s: "down", S: "down",
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!e.repeat) startCharge();
      return;
    }
    const k = KEYMAP[e.key];
    if (k) { e.preventDefault(); input[k] = true; }
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); releaseCharge(); return; }
    const k = KEYMAP[e.key];
    if (k) input[k] = false;
  });

  document.querySelectorAll(".pad button").forEach((btn) => {
    const a = btn.dataset.act;
    const down = (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      if (a === "fire") startCharge(); else input[a] = true;
    };
    const up = () => { if (a === "fire") releaseCharge(); else input[a] = false; };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
  });

  startBtn.addEventListener("click", newGame);

  newGame();
  requestAnimationFrame(loop);
})();
