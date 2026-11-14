(() => {
  // Everything is drawn at 320x192 and scaled up by CSS without smoothing.
  const VW = 320, VH = 192, T = 16, ROWS = 12;
  const BEST_KEY = "dtg.portal.best";
  const GRAV = 0.32, JUMP_V = -6.1, RUN = 1.7, MAX_FALL = 6;
  const COYOTE = 6, BUFFER = 7;

  const canvas = document.getElementById("screen");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const $ = (id) => document.getElementById(id);
  const stageEl = $("stage"), bestEl = $("best");

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function offscreen(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    return [c, g];
  }

  function px(g, x, y, w, h, color) {
    g.fillStyle = color;
    g.fillRect(x | 0, y | 0, w | 0, h | 0);
  }

  // ---------- sprites (pixel maps) ----------

  // The hero: a small schoolboy with a big head and short legs, long hair
  // under a knitted cap (czapka), a dark zipped jacket and a school backpack.
  // 14x16, facing right; the backpack sits on his back.
  const PLAYER_TOP = [
    "......kwk.....",
    ".....kcck.....",
    "....kccccck...",
    "...kCCCCCCCk..",
    "...khhsssssk..",
    "..khhhsswkssk.",
    "..khhhssssssk.",
    "..khhhsrsssk..",
    "..khhhhkkkk...",
    ".kbkhhjjzjjk..",
    "kbbkhjjjzjjjk.",
    "kbbBjjjjzjjsk.",
    ".kkkjjjjzjjk..",
  ];
  const LEGS = {
    stand: ["...kppkppk....", "...kffkffk....", "...kkkkkkk...."],
    apart: ["..kppk.kppk...", "..kffk.kffk...", "..kkk...kkk..."],
    close: ["....kpppk.....", "....kfffk.....", "....kkkkk....."],
  };
  const PLAYER_PAL = {
    k: "#1a1420", w: "#ffffff", c: "#c8302a", C: "#8a1f1a", h: "#5a3a22", s: "#f2c79a", r: "#e89a8a",
    j: "#2a2e3a", z: "#8a90a0", b: "#e08a3c", B: "#a05a20", p: "#3a5a8a", f: "#f4f4f4",
  };

  function sprite(rows, pal, flip = false) {
    const w = rows[0].length;
    const [c, g] = offscreen(w, rows.length);
    rows.forEach((row, y) => {
      if (row.length !== w) console.warn("sprite row width mismatch", row);
      [...row].forEach((ch, x) => {
        if (ch === ".") return;
        px(g, flip ? w - 1 - x : x, y, 1, 1, pal[ch] || "#f0f");
      });
    });
    return c;
  }

  // Enemies are scaled up (walkers 1.5x, statics 1.5x wide / 3x tall) and get a
  // 1px halo so they stand out against busy backgrounds. The halo adds 1px on
  // every side.
  const ES = 1.5, STATIC_SY = 3;
  const HALO = [255, 255, 255, 190], RED_HALO = [255, 40, 30, 235];
  function bigSprite(rows, pal, flip = false, sx = ES, sy = ES, haloColor = HALO) {
    const src = sprite(rows, pal, flip);
    const W = Math.round(src.width * sx), H = Math.round(src.height * sy);
    const [c, g] = offscreen(W + 2, H + 2);
    g.drawImage(src, 1, 1, W, H);
    const img = g.getImageData(0, 0, W + 2, H + 2), d = img.data, cw = W + 2, ch = H + 2;
    const solid = (x, y) => x >= 0 && y >= 0 && x < cw && y < ch && d[(y * cw + x) * 4 + 3] > 200;
    const halo = [];
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++)
        if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) halo.push((y * cw + x) * 4);
    for (const i of halo) d.set(haloColor, i);
    g.putImageData(img, 0, 0);
    c.h = H; // visible height without the halo
    return c;
  }

  // Steady red glow drawn behind static enemies: a soft ellipse around a w x h sprite.
  const GLOW_PAD = 14;
  function redGlow(w, h) {
    const [c, g] = offscreen(w + GLOW_PAD * 2, h + GLOW_PAD * 2);
    const cx = c.width / 2, cy = c.height / 2, r = Math.max(cx, cy);
    g.translate(cx, cy);
    g.scale(cx / r, cy / r);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, "rgba(255,40,30,0.55)");
    grad.addColorStop(0.55, "rgba(255,40,30,0.3)");
    grad.addColorStop(1, "rgba(255,40,30,0)");
    g.fillStyle = grad;
    g.fillRect(-r, -r, r * 2, r * 2);
    return c;
  }
  const EW = 18, EH = 12; // walking enemy hitbox

  const playerSprites = {};
  for (const legs of Object.keys(LEGS)) {
    const rows = PLAYER_TOP.concat(LEGS[legs]);
    playerSprites[legs] = [sprite(rows, PLAYER_PAL), sprite(rows, PLAYER_PAL, true)];
  }

  // ---------- pixel font (3x5) ----------

  const FONT = {
    A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110",
    E: "111100110100111", F: "111100110100100", G: "011100101101011", H: "101101111101101",
    I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
    M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100",
    Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
    U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
    Y: "101101010010010", Z: "111001010100111", 0: "111101101101111", 1: "010110010010111",
    2: "110001010100111", 3: "110001010001110", 4: "101101111001001", 5: "111100110001110",
    6: "011100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001110",
    "-": "000000111000000", "!": "010010010000010", ":": "000010000010000", " ": "000000000000000",
  };

  function textWidth(s, scale) { return s.length * 4 * scale - scale; }

  function text(s, x, y, scale, color, shadow = "#000") {
    for (const [dx, dy, col] of [[scale, scale, shadow], [0, 0, color]]) {
      if (!col) continue;
      [...s.toUpperCase()].forEach((ch, i) => {
        const bits = FONT[ch] || FONT[" "];
        for (let b = 0; b < 15; b++) {
          if (bits[b] === "1") px(ctx, x + dx + i * 4 * scale + (b % 3) * scale, y + dy + ((b / 3) | 0) * scale, scale, scale, col);
        }
      });
    }
  }

  function centered(s, y, scale, color) { text(s, Math.round((VW - textWidth(s, scale)) / 2), y, scale, color); }

  // ---------- themes (see themes.js) ----------

  const { THEMES, LW: LAYER_W } = PortalArt;

  // Themes come in a shuffled deck per run: every theme once before any repeats.
  let themeOrder = [];
  function themeFor(stage) {
    const rand = mulberry32(runSeed * 7 + 3 + themeOrder.length);
    while (themeOrder.length < stage) {
      const deck = THEMES.map((_, i) => i);
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      if (deck[0] === themeOrder[themeOrder.length - 1]) deck.push(deck.shift());
      themeOrder.push(...deck);
    }
    return THEMES[themeOrder[stage - 1]];
  }

  // ---------- level generation ----------

  function makeLevel(stage, runSeed) {
    const rand = mulberry32(runSeed * 977 + stage * 131);
    const theme = themeFor(stage);
    const diff = Math.min(1, (stage - 1) / 9);
    const L = Math.min(150, 70 + stage * 6);
    const height = new Array(L).fill(0); // ground height per column in tiles, 0 = pit
    const plats = [], enemies = [], hazards = [], decos = [];
    // A static enemy sits on the ground at column col (needs room to jump it).
    const hazard = (col, hh) => hazards.push({ x: col * T + 2, y: (ROWS - hh) * T });
    const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
    const flat = (x, len, h) => { for (let i = x; i < Math.min(L, x + len); i++) height[i] = h; };

    let x = 0, h = 3;
    flat(0, 10, h);
    x = 10;
    while (x < L - 26) { // leaves at least 15 flat tiles for the portal
      const r = rand();
      if (r < 0.28 + diff * 0.12) {
        // jump a gap, maybe changing height
        const nh = Math.max(2, Math.min(6, h + ri(-1, 1)));
        let gap = 2 + (rand() < 0.25 + diff * 0.5 ? 1 : 0);
        if (nh > h) gap = 2;
        x += gap;
        h = nh;
        const len = ri(3, 6);
        flat(x, len, h);
        x += len;
      } else if (r < 0.45 + diff * 0.1) {
        // wide pit with a stepping stone
        const ph = Math.min(7, h + 1);
        plats.push({ x: x + 2, w: 2, h: ph });
        x += 6;
        const len = ri(3, 5);
        flat(x, len, h);
        x += len;
      } else if (r < 0.7) {
        // step up or down
        const nh = Math.max(2, Math.min(6, h + [-2, -1, 1, 2][ri(0, 3)]));
        h = nh;
        const len = ri(4, 7);
        flat(x, len, h);
        if (len >= 6 && rand() < 0.5) {
          const ph = Math.min(8, h + 3);
          plats.push({ x: x + 2, w: 3, h: ph });
        } else if (len >= 5 && rand() < 0.25 + diff * 0.35) {
          hazard(x + Math.floor(len / 2), h); // never under a low platform: no headroom to jump it
        }
        x += len;
      } else {
        // flat run, guarded by a walking enemy or a static one
        const len = ri(6, 10);
        flat(x, len, h);
        if (rand() < 0.5) {
          enemies.push({ x: (x + Math.floor(len / 2)) * T, y: (ROWS - h) * T - EH, minX: x * T, maxX: (x + len) * T - EW, dir: rand() < 0.5 ? -1 : 1, alive: true });
        } else if (rand() < 0.6 + diff * 0.4) {
          hazard(x + Math.floor(len / 2), h);
        }
        x += len;
      }
    }
    flat(x, L - x, h);

    const solid = Array.from({ length: ROWS }, () => new Uint8Array(L));
    height.forEach((hh, col) => { for (let r = ROWS - hh; r < ROWS; r++) solid[r][col] = 1; });
    for (const p of plats) for (let i = 0; i < p.w; i++) solid[ROWS - p.h][p.x + i] = 1;

    for (let col = 3; col < L - 6; col++) {
      if (hazards.some((hz) => Math.floor(hz.x / T) === col)) continue;
      if (height[col] && rand() < 0.12) decos.push({ x: col * T + ri(2, 11), y: (ROWS - height[col]) * T, kind: theme.deco[ri(0, theme.deco.length - 1)] });
    }

    const tiles = PortalArt.makeTiles(theme.tile[0], theme.tile[1], rand);
    const layers = theme.layers(PortalArt.toolkit(rand));
    const portal = { x: (L - 5) * T, y: (ROWS - h) * T - 32 };
    return { stage, theme, L, solid, enemies, hazards, decos, tiles, layers, portal, startY: (ROWS - 3) * T - 16 };
  }

  // ---------- state ----------

  let level, player, state, timer, frame, runSeed, paused, particles;
  let best = Number(safeGet(BEST_KEY)) || 0;
  bestEl.textContent = best || "–";
  const keys = { left: false, right: false, jump: false };
  let jumpPressed = 0;

  function isSolid(col, row) {
    if (col < 0 || col >= level.L) return true;
    if (row < 0 || row >= ROWS) return false;
    return level.solid[row][col] === 1;
  }

  function hits(x, y, w, h) {
    for (let r = Math.floor(y / T); r <= Math.floor((y + h - 1) / T); r++)
      for (let c = Math.floor(x / T); c <= Math.floor((x + w - 1) / T); c++)
        if (isSolid(c, r)) return true;
    return false;
  }

  function loadStage(n) {
    level = makeLevel(n, runSeed);
    player = { x: 2 * T, y: level.startY, vx: 0, vy: 0, w: 8, h: 15, face: 0, ground: false, coyote: 0, anim: 0 };
    level.portal.open = true;
    particles = [];
    initWeather(level.theme.weather);
    {
      const { kind, pal } = PortalArt.staticFor(level.theme);
      const def = PortalArt.STATICS[kind];
      let alt = def.rows;
      if (def.anim === "blink") alt = def.rows.map((r) => r.replace(/w/g, "c"));
      else if (def.anim.startsWith("swap:")) {
        const [a, b] = def.anim.slice(5);
        alt = def.rows.map((r) => [...r].map((ch) => (ch === a ? b : ch === b ? a : ch)).join(""));
      }
      const img = [bigSprite(def.rows, pal, false, ES, STATIC_SY, RED_HALO), bigSprite(alt, pal, false, ES, STATIC_SY, RED_HALO)];
      level.staticSprites = { anim: def.anim, h: img[0].h, img, glow: redGlow(img[0].width, img[0].height) };
      level.staticH = img[0].h;
    }
    stageEl.textContent = n;
    state = "title";
    timer = 100;
  }

  function newRun() {
    runSeed = Math.floor(Math.random() * 1e9);
    themeOrder = [];
    loadStage(1);
  }

  function die() {
    state = "dead";
    timer = 60;
    player.vy = -4.5;
  }

  function burst(x, y, color, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.5 + Math.random() * 1.5;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, t: 20 + Math.floor(Math.random() * 10), color });
    }
  }

  // ---------- update ----------

  function updatePlayer() {
    const p = player;
    const want = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const accel = p.ground ? 0.3 : 0.18;
    if (want) {
      p.vx += want * accel;
      p.vx = Math.max(-RUN, Math.min(RUN, p.vx));
      p.face = want < 0 ? 1 : 0;
    } else {
      p.vx *= p.ground ? 0.7 : 0.92;
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
    }

    p.coyote = p.ground ? COYOTE : Math.max(0, p.coyote - 1);
    if (jumpPressed > 0) jumpPressed--;
    if (jumpPressed && p.coyote) {
      p.vy = JUMP_V;
      p.coyote = 0;
      jumpPressed = 0;
    }
    if (!keys.jump && p.vy < -2.2) p.vy = -2.2; // short hop when released early
    p.vy = Math.min(MAX_FALL, p.vy + GRAV);

    // move and collide one axis at a time
    p.x += p.vx;
    if (hits(p.x, p.y, p.w, p.h)) {
      p.x = p.vx > 0 ? Math.floor((p.x + p.w) / T) * T - p.w : Math.floor(p.x / T + 1) * T;
      p.vx = 0;
    }
    p.y += p.vy;
    p.ground = false;
    if (hits(p.x, p.y, p.w, p.h)) {
      if (p.vy > 0) {
        p.y = Math.floor((p.y + p.h) / T) * T - p.h;
        p.ground = true;
      } else {
        p.y = Math.floor(p.y / T + 1) * T;
      }
      p.vy = 0;
    }
    p.anim = p.ground && Math.abs(p.vx) > 0.3 ? p.anim + Math.abs(p.vx) : 0;

    if (p.y > ROWS * T + 24) die();
  }

  function updateWorld() {
    const p = player;
    // Static enemies can't be stomped: any touch is fatal (slightly forgiving box).
    for (const hz of level.hazards) {
      if (p.x + p.w > hz.x && p.x < hz.x + 12 && p.y + p.h > hz.y - level.staticH + 5 && p.y < hz.y) return die();
    }
    for (const e of level.enemies) {
      if (!e.alive) continue;
      e.x += e.dir * (0.45 + Math.min(0.5, level.stage * 0.04));
      if (e.x < e.minX) { e.x = e.minX; e.dir = 1; }
      if (e.x > e.maxX) { e.x = e.maxX; e.dir = -1; }
      const overlap = p.x < e.x + EW - 1 && p.x + p.w > e.x + 1 && p.y < e.y + EH && p.y + p.h > e.y + 1;
      if (overlap) {
        if (p.vy > 0 && p.y + p.h - p.vy <= e.y + 4) {
          e.alive = false;
          p.vy = keys.jump ? JUMP_V * 0.9 : -3.8;
          burst(e.x + EW / 2, e.y + EH / 2, PortalArt.enemyFor(level.theme).pal.c, 10);
        } else {
          return die();
        }
      }
    }
    const po = level.portal;
    if (p.x + p.w > po.x + 4 && p.x < po.x + 12 && p.y + p.h > po.y && p.y < po.y + 32) {
      state = "warp";
      timer = 50;
      burst(po.x + 8, po.y + 16, level.theme.portal[0], 20);
    }
  }

  function updateParticles() {
    for (const q of particles) { q.x += q.vx; q.y += q.vy; q.vy += 0.1; q.t--; }
    particles = particles.filter((q) => q.t > 0);
  }

  function update() {
    frame++;
    if (paused) return;
    updateParticles();
    if (state === "title") {
      if (--timer <= 0 || (timer < 70 && jumpPressed)) { state = "play"; jumpPressed = 0; }
    } else if (state === "play") {
      updatePlayer();
      if (state === "play") updateWorld();
    } else if (state === "dead") {
      player.vy += GRAV;
      player.y += player.vy;
      if (--timer <= 0) loadStage(level.stage);
    } else if (state === "warp") {
      if (--timer <= 0) {
        const done = level.stage;
        if (done > best) { best = done; bestEl.textContent = best; safeSet(BEST_KEY, best); }
        loadStage(done + 1);
      }
    }
  }

  // ---------- weather (screen-space particles, nudged by camera movement) ----------

  const WEATHER = {
    rain: { n: 90, color: ["#9ab0d0"], alpha: 0.6 },
    storm: { n: 130, color: ["#9ab0d0"], alpha: 0.6 },
    snow: { n: 70, color: ["#ffffff", "#dde8f4"], alpha: 0.9 },
    embers: { n: 40, color: ["#ffb03a", "#f05a10", "#ffe08a"], alpha: 0.9 },
    bubbles: { n: 30, color: ["#a0d8f0"], alpha: 0.7 },
    leaves: { n: 25, color: ["#3a8a3a", "#6ab04a", "#c8a03a"], alpha: 1 },
    autumn: { n: 30, color: ["#e8782a", "#c8402a", "#f0b03a", "#a0502a"], alpha: 1 },
    petals: { n: 35, color: ["#f8c0d8", "#fde0ec", "#f0a0c0"], alpha: 1 },
    sprinkles: { n: 40, color: ["#e5604f", "#f2c23b", "#3a7fd5", "#5ad17a", "#ffffff"], alpha: 1 },
    confetti: { n: 40, color: ["#e5604f", "#f2c23b", "#3a7fd5", "#5ad17a", "#f070d0"], alpha: 1 },
    bits: { n: 50, color: ["#3af07a", "#3af0f0"], alpha: 0.8 },
    ash: { n: 55, color: ["#a8a8a8", "#7a7a7a"], alpha: 0.7 },
    fireflies: { n: 22, color: ["#e8f070"], alpha: 1 },
    spores: { n: 30, color: ["#f070d0", "#70f0f0"], alpha: 0.8 },
  };
  let weather = [], weatherKind = null, flash = 0, lastCam = null;

  function initWeather(kind) {
    weatherKind = WEATHER[kind] ? kind : null;
    flash = 0;
    lastCam = null;
    const w = WEATHER[weatherKind];
    weather = w ? Array.from({ length: w.n }, () => ({
      x: Math.random() * VW, y: Math.random() * VH, s: Math.random(), p: Math.random() * 7,
      c: w.color[Math.floor(Math.random() * w.color.length)],
    })) : [];
  }

  function drawWeather(camX) {
    if (!weatherKind) return;
    const shift = lastCam === null ? 0 : camX - lastCam;
    lastCam = camX;
    const k = weatherKind, w = WEATHER[k], t = frame / 30;
    ctx.globalAlpha = w.alpha;
    for (const d of weather) {
      if (!paused) {
        d.x -= shift * (0.6 + d.s * 0.6);
        if (k === "rain" || k === "storm") { d.x -= k === "storm" ? 1.6 : 0.6; d.y += 4 + d.s * 2; }
        else if (k === "snow") { d.x += Math.sin(t + d.p) * 0.3; d.y += 0.3 + d.s * 0.4; }
        else if (k === "embers" || k === "spores") { d.x += Math.sin(t + d.p) * 0.3; d.y -= 0.3 + d.s * 0.6; }
        else if (k === "bubbles") { d.x += Math.sin(t * 2 + d.p) * 0.3; d.y -= 0.4 + d.s * 0.5; }
        else if (k === "leaves" || k === "autumn" || k === "petals" || k === "sprinkles" || k === "confetti") { d.x += Math.sin(t + d.p) * 0.8 - 0.2; d.y += 0.4 + d.s * 0.4; }
        else if (k === "bits") d.y += 0.8 + d.s * 1.6;
        else if (k === "ash") { d.x -= 0.3; d.y += 0.3 + d.s * 0.4; }
        else if (k === "fireflies") { d.x += Math.sin(t * 0.7 + d.p) * 0.4; d.y += Math.cos(t * 0.9 + d.p) * 0.3; }
        d.x = ((d.x % VW) + VW) % VW;
        d.y = ((d.y % VH) + VH) % VH;
      }
      const x = Math.round(d.x), y = Math.round(d.y);
      if (k === "rain" || k === "storm") { px(ctx, x, y, 1, 3, d.c); px(ctx, x - 1, y + 3, 1, 1, d.c); }
      else if (k === "bubbles") { px(ctx, x, y, 2, 1, d.c); px(ctx, x - 1, y + 1, 1, 2, d.c); px(ctx, x + 2, y + 1, 1, 2, d.c); px(ctx, x, y + 3, 2, 1, d.c); }
      else if (k === "leaves" || k === "autumn" || k === "petals") px(ctx, x, y, 2, 1, d.c);
      else if (k === "sprinkles" || k === "confetti") px(ctx, x, y, (frame + d.p * 9) % 16 < 8 ? 2 : 1, (frame + d.p * 9) % 16 < 8 ? 1 : 2, d.c);
      else if (k === "bits") px(ctx, x, y, 1, 2, d.c);
      else if (k === "fireflies") { if (Math.sin(t * 3 + d.p * 3) > 0.2) px(ctx, x, y, 1, 1, d.c); }
      else if (k === "embers") { if ((frame + d.p * 10) % 20 < 15) px(ctx, x, y, 1, 1, d.c); }
      else px(ctx, x, y, 1, 1, d.c);
    }
    ctx.globalAlpha = 1;
    if (k === "storm" && !paused) {
      if (flash > 0) flash--;
      else if (Math.random() < 0.004) flash = 8;
      if (flash > 0) { ctx.globalAlpha = (flash / 8) * 0.5; px(ctx, 0, 0, VW, VH, "#e8ecff"); ctx.globalAlpha = 1; }
    }
  }

  // ---------- draw ----------

  function draw() {
    const p = player;
    const camX = Math.round(Math.max(0, Math.min(level.L * T - VW, p.x + 4 - VW * 0.42)));

    for (const [layer, f] of level.layers) {
      const off = -Math.round(camX * f) % LAYER_W;
      ctx.drawImage(layer, off, 0);
      ctx.drawImage(layer, off + LAYER_W, 0);
    }

    const c0 = Math.floor(camX / T), c1 = Math.min(level.L - 1, c0 + Math.ceil(VW / T) + 1);
    for (let r = 0; r < ROWS; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!level.solid[r][c]) continue;
        const img = r > 0 && level.solid[r - 1][c] ? level.tiles.fill : level.tiles.top;
        ctx.drawImage(img, c * T - camX, r * T);
      }
    }
    for (const d of level.decos) if (d.x - camX > -20 && d.x - camX < VW + 20) PortalArt.drawDeco(ctx, d.kind, d.x - camX, d.y, Math.floor(d.x / 7));

    // Static enemies: two idle frames (blink / colour swap) or a 1px pulse.
    const st = level.staticSprites;
    for (const hz of level.hazards) {
      const sx = hz.x - camX;
      if (sx < -30 - GLOW_PAD || sx > VW + 8 + GLOW_PAD) continue;
      const blinkOn = st.anim === "blink" ? (frame + hz.x) % 150 < 8 : Math.floor((frame + hz.x) / 14) % 2 === 1;
      const bob = st.anim === "pulse" && Math.floor((frame + hz.x) / 20) % 2 ? 1 : 0;
      // hz.x is 2px into its 16px column; the 18px sprite is centred on the column (+1px halo).
      ctx.drawImage(st.glow, Math.round(sx) - 4 - GLOW_PAD, hz.y - st.h - 1 - GLOW_PAD);
      ctx.drawImage(st.img[blinkOn && st.anim !== "pulse" ? 1 : 0], Math.round(sx) - 4, hz.y - st.h - 1 + bob);
    }

    drawPortal(level.portal.x - camX, level.portal.y);

    // Themed enemy: two walk frames, each also mirrored for the walking direction.
    if (!level.enemySprites) {
      const { kind, pal } = PortalArt.enemyFor(level.theme);
      const def = PortalArt.ENEMIES[kind];
      const frames = [def.rows, def.rows.slice(0, def.rows.length - def.b.length).concat(def.b)];
      const img = frames.map((f) => [bigSprite(f, pal), bigSprite(f, pal, true)]);
      level.enemySprites = { hover: !!def.hover, h: img[0][0].h, img };
    }
    const es = level.enemySprites;
    for (const e of level.enemies) {
      if (!e.alive) continue;
      const bob = es.hover ? Math.round(Math.sin(frame / 12 + e.minX) * 2) - 3 : 0;
      ctx.drawImage(es.img[Math.floor(frame / 10) % 2][e.dir > 0 ? 0 : 1], Math.round(e.x - camX) - 1, Math.round(e.y + EH - es.h - 1 + bob));
    }

    if (state !== "warp") {
      let legs = "stand";
      if (!p.ground) legs = "apart";
      else if (p.anim) legs = Math.floor(p.anim / 6) % 2 ? "apart" : "close";
      const img = playerSprites[legs][p.face];
      if (state !== "dead" || frame % 4 < 2) ctx.drawImage(img, Math.round(p.x - 3 - camX), Math.round(p.y - 1));
    }

    for (const q of particles) px(ctx, q.x - camX, q.y, 2, 2, q.color);
    drawWeather(camX);

    text(`STAGE ${level.stage}`, 4, 4, 1, "#ffffff");

    if (state === "title") {
      const a = Math.min(1, timer / 30);
      ctx.globalAlpha = a * 0.6;
      px(ctx, 0, 60, VW, 64, "#000");
      ctx.globalAlpha = a;
      centered(`STAGE ${level.stage}`, 72, 3, "#ffffff");
      centered(level.theme.name, 98, 2, level.theme.portal[0]);
      ctx.globalAlpha = 1;
    }
    if (state === "warp") {
      // pixel dissolve into the next stage
      const k = 1 - timer / 50;
      for (let y = 0; y < VH; y += 8)
        for (let x = 0; x < VW; x += 8)
          if (((x * 7 + y * 13) % 64) / 64 < k) px(ctx, x, y, 8, 8, "#000");
    }
    if (paused) {
      ctx.globalAlpha = 0.6;
      px(ctx, 0, 0, VW, VH, "#000");
      ctx.globalAlpha = 1;
      centered("PAUSED", 86, 3, "#ffffff");
    }
  }

  function drawPortal(x, y) {
    const [c1, c2] = level.theme.portal;
    const next = themeFor(level.stage + 1).portal[0];
    for (let r = 0; r < 6; r++) {
      const col = [c1, c2, next][(r + Math.floor(frame / 5)) % 3];
      const rx = 8 - r, ry = 16 - r * 2;
      for (let a = 0; a < 40; a++) {
        const t = (a / 40) * Math.PI * 2 + frame * 0.05 * (r % 2 ? 1 : -1);
        px(ctx, x + 8 + Math.cos(t) * rx, y + 16 + Math.sin(t) * ry, 1, 1, col);
      }
    }
  }

  // ---------- loop (fixed 60 Hz steps) ----------

  let last = 0, acc = 0;
  function loop(t) {
    acc += Math.min(100, t - (last || t));
    last = t;
    while (acc >= 1000 / 60) {
      update();
      acc -= 1000 / 60;
    }
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- input ----------

  const KEYMAP = {
    ArrowLeft: "left", a: "left", A: "left",
    ArrowRight: "right", d: "right", D: "right",
    " ": "jump", ArrowUp: "jump", w: "jump", W: "jump", z: "jump", Z: "jump", x: "jump", X: "jump",
  };
  function press(k, down) {
    if (k === "jump" && down && !keys.jump) jumpPressed = BUFFER;
    keys[k] = down;
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "p" || e.key === "P" || e.key === "Escape") { paused = !paused; return; }
    const k = KEYMAP[e.key];
    if (!k) return;
    e.preventDefault();
    if (!e.repeat) press(k, true);
  });
  document.addEventListener("keyup", (e) => {
    const k = KEYMAP[e.key];
    if (k) press(k, false);
  });
  document.querySelectorAll(".pad button").forEach((btn) => {
    const k = btn.dataset.k;
    btn.addEventListener("pointerdown", (e) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); press(k, true); });
    const up = () => press(k, false);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  });

  frame = 0;
  paused = false;
  newRun();
  requestAnimationFrame(loop);
})();
