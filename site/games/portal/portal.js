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
  const stageEl = $("stage"), coinsEl = $("coins"), bestEl = $("best");

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

  const PLAYER_TOP = [
    "...kkkkk....",
    "..khhhhhk...",
    ".khhhhhhhk..",
    ".kkkkkkkkkkk",
    "..kssssksk..",
    "..ksssssssk.",
    "..kssssskk..",
    "...kkkkkk...",
    "..kbbbbbbk..",
    ".kbbbbbbbbk.",
    ".ksbbbbbbsk.",
    "..kbbbbbbk..",
  ];
  const LEGS = {
    stand: ["..kppppppk..", "..kppkkppk..", "..kffk.kffk.", "...kk...kk.."],
    apart: ["..kppppppk..", ".kppk..kppk.", ".kffk...kffk", "..kk.....kk."],
    close: ["..kppppppk..", "...kppppk...", "...kffffk...", "....kkkk...."],
  };
  const PLAYER_PAL = { k: "#1a1420", h: "#d8402f", s: "#f2c79a", b: "#3a7fd5", p: "#2d3047", f: "#7a4a26" };

  const CRAWLER = [
    "....kkkk....",
    "..kkccccckk.",
    ".kccccccccck",
    ".kcwwccwwcck",
    ".kcwkccwkcck",
    "kcccccccccck",
    "kcddddddddck",
    ".kkkkkkkkkk.",
  ];
  const CRAWLER_FEET = ["..kk.kk.kk..", "...kk.kk.kk."];

  const COIN = [
    ["..kk..", ".kyyk.", "kyywyk", "kyyyyk", ".kyyk.", "..kk.."],
    ["..kk..", ".kyyk.", ".kywk.", ".kyyk.", ".kyyk.", "..kk.."],
    ["..k...", "..ky..", "..ky..", "..ky..", "..ky..", "..k..."],
  ];

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

  const playerSprites = {};
  for (const legs of Object.keys(LEGS)) {
    const rows = PLAYER_TOP.concat(LEGS[legs]);
    playerSprites[legs] = [sprite(rows, PLAYER_PAL), sprite(rows, PLAYER_PAL, true)];
  }
  const coinSprites = COIN.map((f) => sprite(f, { k: "#7a4a10", y: "#f2c23b", w: "#fff6c0" }));

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

  // ---------- themes: parallax backgrounds and tiles ----------

  // Sky in flat bands with a checkerboard dither between them (retro look).
  function sky(g, w, colors) {
    const band = VH / colors.length;
    for (let y = 0; y < VH; y++) {
      const i = Math.min(colors.length - 1, Math.floor(y / band));
      const inBand = y - i * band;
      const next = colors[i + 1];
      if (next && inBand >= band - 3) {
        for (let x = 0; x < w; x++) px(g, x, y, 1, 1, (x + y) % 2 ? next : colors[i]);
      } else {
        px(g, 0, y, w, 1, colors[i]);
      }
    }
  }

  // A horizon line that wraps seamlessly across the layer width.
  function ridge(w, base, amps, rand) {
    const waves = amps.map((a, i) => ({ a, f: (i + 1) * (1 + Math.floor(rand() * 2)), p: rand() * 7 }));
    return Array.from({ length: w }, (_, x) =>
      Math.round(base + waves.reduce((s, v) => s + v.a * Math.sin((x / w) * Math.PI * 2 * v.f + v.p), 0)));
  }

  function fillBelow(g, line, color) { line.forEach((y, x) => px(g, x, y, 1, VH - y, color)); }

  function pine(g, x, baseY, h, color, trunk) {
    px(g, x - 1, baseY - 3, 2, 3, trunk);
    for (let r = 0; r < h; r++) {
      const half = Math.floor(((r % 5) + r * 0.6) / 2) + 1;
      px(g, x - half, baseY - h - 3 + r, half * 2, 1, color);
    }
  }

  const LAYER_W = 480;

  const THEMES = [
    {
      name: "Forest",
      layers(rand) {
        const [far, gf] = offscreen(LAYER_W, VH);
        sky(gf, LAYER_W, ["#7ec4e8", "#9fd4ee", "#bfe3f2", "#dff1f6"]);
        px(gf, 380, 30, 14, 14, "#fff6d0"); px(gf, 378, 32, 18, 10, "#fff6d0"); px(gf, 382, 28, 10, 18, "#fff6d0");
        const m = ridge(LAYER_W, 104, [16, 8, 4], rand);
        fillBelow(gf, m, "#7a9cb8");
        m.forEach((y, x) => { if (y < 96) px(gf, x, y, 1, 2, "#e8f0f4"); });
        const [mid, gm] = offscreen(LAYER_W, VH);
        const h1 = ridge(LAYER_W, 130, [6, 3], rand);
        fillBelow(gm, h1, "#3f7a4f");
        for (let x = 4; x < LAYER_W; x += 7 + Math.floor(rand() * 6)) pine(gm, x, h1[x] + 2, 14 + Math.floor(rand() * 10), "#2f6a40", "#2a3a2a");
        const [near, gn] = offscreen(LAYER_W, VH);
        const h2 = ridge(LAYER_W, 156, [5, 3], rand);
        fillBelow(gn, h2, "#24543a");
        for (let x = 10; x < LAYER_W; x += 18 + Math.floor(rand() * 20)) pine(gn, x, h2[x] + 2, 26 + Math.floor(rand() * 16), "#1d4a30", "#3a2a1e");
        return [[far, 0.1], [mid, 0.3], [near, 0.55]];
      },
      tiles: { grass: "#5cae48", grassHi: "#8ad05a", dirt: "#7a4f2e", dirtDk: "#5e3a20", dirtLt: "#94653c" },
      crawler: { k: "#1a1420", c: "#9a5fd1", d: "#6a3f9a", w: "#ffffff" },
      deco: "flower",
      portal: ["#7ef0c0", "#2fb08a"],
    },
    {
      name: "City",
      layers(rand) {
        const [far, gf] = offscreen(LAYER_W, VH);
        sky(gf, LAYER_W, ["#1a1438", "#2a1d4f", "#43286a", "#6a3a7a"]);
        for (let i = 0; i < 70; i++) px(gf, Math.floor(rand() * LAYER_W), Math.floor(rand() * 90), 1, 1, rand() < 0.3 ? "#ffffff" : "#b0a8d8");
        px(gf, 70, 24, 12, 12, "#f4eecf"); px(gf, 68, 26, 16, 8, "#f4eecf"); px(gf, 74, 24, 8, 8, "#2a1d4f");
        const [mid, gm] = offscreen(LAYER_W, VH);
        const [near, gn] = offscreen(LAYER_W, VH);
        const block = (g, y0, hMin, hMax, wMin, wMax, body, lit, unlit, p) => {
          for (let x = 0; x < LAYER_W;) {
            const w = wMin + Math.floor(rand() * (wMax - wMin));
            const h = hMin + Math.floor(rand() * (hMax - hMin));
            const bw = Math.min(w, LAYER_W - x);
            px(g, x, y0 - h, bw, VH, body);
            if (rand() < 0.3) px(g, x + Math.floor(bw / 2), y0 - h - 6, 1, 6, body); // antenna
            for (let wy = y0 - h + 4; wy < VH - 6; wy += p)
              for (let wx = x + 3; wx < x + bw - 3; wx += p) px(g, wx, wy, 2, 2, rand() < 0.3 ? lit : unlit);
            x += w + Math.floor(rand() * 4);
          }
        };
        block(gm, 150, 40, 110, 18, 40, "#2e2a4a", "#e8c46a", "#3a3658", 5);
        block(gn, 176, 30, 80, 24, 50, "#1c1a2e", "#f2d27a", "#25233a", 6);
        return [[far, 0.05], [mid, 0.25], [near, 0.5]];
      },
      tiles: { grass: "#8a8d96", grassHi: "#b8bbc4", dirt: "#8a4a3a", dirtDk: "#5a2e24", dirtLt: "#c9b8a8" },
      crawler: { k: "#1a1420", c: "#a8b0c0", d: "#6a7080", w: "#ff5a4a" },
      deco: "lamp",
      portal: ["#f2b84b", "#e5604f"],
    },
    {
      name: "Desert",
      layers(rand) {
        const [far, gf] = offscreen(LAYER_W, VH);
        sky(gf, LAYER_W, ["#f2a65a", "#f6be72", "#f8d490", "#fbe6b4"]);
        for (let r = 22; r > 0; r--) {
          const w = Math.round(Math.sqrt(22 * 22 - r * r));
          px(gf, 240 - w, 70 - r, w * 2, 1, "#fff0b0");
          px(gf, 240 - w, 70 + r, w * 2, 1, "#fff0b0");
        }
        px(gf, 218, 70, 44, 1, "#fff0b0");
        // flat-topped mesas
        for (let x = 0; x < LAYER_W;) {
          const w = 30 + Math.floor(rand() * 50), h = 20 + Math.floor(rand() * 30);
          px(gf, x + 4, 120 - h, w - 8, h + 80, "#c97a4a");
          px(gf, x, 120 - h + 6, w, h + 80, "#c97a4a");
          px(gf, x, 120 - h + 6, w, 2, "#a85e38");
          x += w + 30 + Math.floor(rand() * 60);
        }
        const [mid, gm] = offscreen(LAYER_W, VH);
        const d1 = ridge(LAYER_W, 140, [8, 4], rand);
        fillBelow(gm, d1, "#e0b070");
        d1.forEach((y, x) => px(gm, x, y, 1, 1, "#f0c888"));
        const [near, gn] = offscreen(LAYER_W, VH);
        const d2 = ridge(LAYER_W, 162, [6, 3], rand);
        fillBelow(gn, d2, "#d09a58");
        for (let x = 20; x < LAYER_W - 10; x += 40 + Math.floor(rand() * 60)) {
          const y = d2[x], h = 14 + Math.floor(rand() * 10), c = "#4f7a3a";
          px(gn, x, y - h, 4, h, c);
          px(gn, x - 4, y - h + 6, 4, 2, c); px(gn, x - 4, y - h + 2, 2, 6, c);
          px(gn, x + 4, y - h + 9, 4, 2, c); px(gn, x + 6, y - h + 4, 2, 7, c);
        }
        return [[far, 0.1], [mid, 0.3], [near, 0.5]];
      },
      tiles: { grass: "#e8c47a", grassHi: "#f6dc9c", dirt: "#c08a50", dirtDk: "#9a6a3a", dirtLt: "#d8a868" },
      crawler: { k: "#1a1420", c: "#3a8a7a", d: "#26605a", w: "#f2e84b" },
      deco: "cactus",
      portal: ["#b07ef0", "#6a3fd1"],
    },
  ];

  // Ground tiles: a "top" tile with a surface and a "fill" tile beneath it.
  function makeTiles(theme, rand) {
    const c = theme.tiles;
    const [top, gt] = offscreen(T, T);
    const [fill, gf] = offscreen(T, T);
    const dirt = (g, y0) => {
      px(g, 0, y0, T, T - y0, c.dirt);
      for (let i = 0; i < 10; i++) px(g, Math.floor(rand() * T), y0 + Math.floor(rand() * (T - y0)), 2, 1, rand() < 0.5 ? c.dirtDk : c.dirtLt);
    };
    if (theme.name === "City") {
      // bricks under a concrete slab
      const bricks = (g, y0) => {
        px(g, 0, y0, T, T - y0, c.dirt);
        for (let y = y0; y < T; y += 4) {
          px(g, 0, y, T, 1, c.dirtLt);
          for (let x = ((y / 4) % 2) * 4; x < T; x += 8) px(g, x, y, 1, 4, c.dirtLt);
        }
        for (let i = 0; i < 4; i++) px(g, Math.floor(rand() * T), y0 + 1 + Math.floor(rand() * (T - y0 - 1)), 2, 1, c.dirtDk);
      };
      bricks(gf, 0);
      bricks(gt, 5);
      px(gt, 0, 0, T, 5, c.grass);
      px(gt, 0, 0, T, 1, c.grassHi);
      px(gt, 0, 4, T, 1, "#55585f");
      px(gt, 7, 1, 1, 3, "#6a6d74");
    } else {
      dirt(gf, 0);
      dirt(gt, 4);
      px(gt, 0, 0, T, 4, c.grass);
      px(gt, 0, 0, T, 1, c.grassHi);
      for (let x = 0; x < T; x += 2) if (rand() < 0.6) px(gt, x, 4, 1, 1 + Math.floor(rand() * 2), c.grass);
      if (theme.name === "Desert") for (let y = 6; y < T; y += 5) px(gt, 0, y, T, 1, c.dirtLt);
    }
    return { top, fill };
  }

  function drawDeco(kind, x, y, t) {
    if (kind === "flower") {
      px(ctx, x + 1, y - 4, 1, 4, "#2f6a40");
      px(ctx, x, y - 6, 3, 2, t % 2 ? "#f2d24b" : "#e5604f");
    } else if (kind === "lamp") {
      px(ctx, x + 1, y - 20, 1, 20, "#3a3d48");
      px(ctx, x - 1, y - 22, 5, 2, "#3a3d48");
      px(ctx, x - 1, y - 20, 5, 1, "#ffe08a");
      // dithered light cone, widening toward the ground
      for (let i = 0; i < 19; i++) {
        const half = 2 + Math.floor(i / 3);
        for (let dx = -half; dx <= half; dx++) if ((dx + i) % 2 === 0) px(ctx, x + 1 + dx, y - 19 + i, 1, 1, "#ffe08a");
      }
    } else if (kind === "cactus") {
      px(ctx, x + 1, y - 9, 2, 9, "#4f7a3a");
      px(ctx, x - 1, y - 6, 2, 1, "#4f7a3a"); px(ctx, x - 1, y - 8, 1, 2, "#4f7a3a");
      px(ctx, x + 3, y - 4, 2, 1, "#4f7a3a"); px(ctx, x + 4, y - 7, 1, 3, "#4f7a3a");
    }
  }

  // ---------- level generation ----------

  function makeLevel(stage, runSeed) {
    const rand = mulberry32(runSeed * 977 + stage * 131);
    const theme = THEMES[(stage - 1) % THEMES.length];
    const diff = Math.min(1, (stage - 1) / 9);
    const L = Math.min(150, 70 + stage * 6);
    const height = new Array(L).fill(0); // ground height per column in tiles, 0 = pit
    const plats = [], coins = [], enemies = [], decos = [];
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
        for (let i = 0; i < gap; i++) coins.push({ x: (x + i) * T + 5, y: (ROWS - Math.max(h, nh) - 3) * T + 5 });
        x += gap;
        h = nh;
        const len = ri(3, 6);
        flat(x, len, h);
        x += len;
      } else if (r < 0.45 + diff * 0.1) {
        // wide pit with a stepping stone
        const ph = Math.min(7, h + 1);
        plats.push({ x: x + 2, w: 2, h: ph });
        coins.push({ x: (x + 2) * T + 5, y: (ROWS - ph - 1) * T + 5 }, { x: (x + 3) * T + 5, y: (ROWS - ph - 1) * T + 5 });
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
          for (let i = 0; i < 3; i++) coins.push({ x: (x + 2 + i) * T + 5, y: (ROWS - ph - 1) * T + 5 });
        }
        x += len;
      } else {
        // flat run, often guarded by a crawler
        const len = ri(6, 10);
        flat(x, len, h);
        if (rand() < 0.45 + diff * 0.45) {
          enemies.push({ x: (x + Math.floor(len / 2)) * T, y: (ROWS - h) * T - 8, minX: x * T, maxX: (x + len) * T - 12, dir: rand() < 0.5 ? -1 : 1, alive: true });
        } else {
          for (let i = 1; i < len - 1; i += 2) coins.push({ x: (x + i) * T + 5, y: (ROWS - h - 1) * T + 5 });
        }
        x += len;
      }
    }
    flat(x, L - x, h);

    const solid = Array.from({ length: ROWS }, () => new Uint8Array(L));
    height.forEach((hh, col) => { for (let r = ROWS - hh; r < ROWS; r++) solid[r][col] = 1; });
    for (const p of plats) for (let i = 0; i < p.w; i++) solid[ROWS - p.h][p.x + i] = 1;

    for (let col = 3; col < L - 6; col++) {
      if (height[col] && rand() < 0.12) decos.push({ x: col * T + ri(2, 11), y: (ROWS - height[col]) * T });
    }

    const tiles = makeTiles(theme, rand);
    const layers = theme.layers(rand);
    const portal = { x: (L - 5) * T, y: (ROWS - h) * T - 32 };
    return { stage, theme, L, solid, coins, enemies, decos, tiles, layers, portal, startY: (ROWS - 3) * T - 16 };
  }

  // ---------- state ----------

  let level, player, state, timer, frame, runSeed, coins, stageCoins, paused, particles;
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
    stageCoins = 0;
    particles = [];
    stageEl.textContent = n;
    coinsEl.textContent = coins;
    state = "title";
    timer = 100;
  }

  function newRun() {
    runSeed = Math.floor(Math.random() * 1e9);
    coins = 0;
    loadStage(1);
  }

  function die() {
    state = "dead";
    timer = 60;
    player.vy = -4.5;
    coins -= stageCoins;
    coinsEl.textContent = coins;
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
    for (const c of level.coins) {
      if (!c.taken && Math.abs(p.x + 4 - (c.x + 3)) < 8 && Math.abs(p.y + 8 - (c.y + 3)) < 10) {
        c.taken = true;
        coins++;
        stageCoins++;
        coinsEl.textContent = coins;
        burst(c.x + 3, c.y + 3, "#f2c23b", 5);
      }
    }
    for (const e of level.enemies) {
      if (!e.alive) continue;
      e.x += e.dir * (0.45 + Math.min(0.5, level.stage * 0.04));
      if (e.x < e.minX) { e.x = e.minX; e.dir = 1; }
      if (e.x > e.maxX) { e.x = e.maxX; e.dir = -1; }
      const overlap = p.x < e.x + 11 && p.x + p.w > e.x + 1 && p.y < e.y + 8 && p.y + p.h > e.y + 1;
      if (overlap) {
        if (p.vy > 0 && p.y + p.h - p.vy <= e.y + 4) {
          e.alive = false;
          p.vy = keys.jump ? JUMP_V * 0.9 : -3.8;
          burst(e.x + 6, e.y + 4, level.theme.crawler.c, 10);
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
    for (const d of level.decos) if (d.x - camX > -20 && d.x - camX < VW + 20) drawDeco(level.theme.deco, d.x - camX, d.y, Math.floor(d.x / 7));

    const cf = Math.floor(frame / 8) % 4;
    for (const c of level.coins) {
      if (c.taken) continue;
      ctx.drawImage(coinSprites[[0, 1, 2, 1][cf]], c.x - camX, c.y + (Math.floor(frame / 12 + c.x) % 2));
    }

    drawPortal(level.portal.x - camX, level.portal.y);

    const crawler = level.crawlerSprites || (level.crawlerSprites = CRAWLER_FEET.map((f) => sprite(CRAWLER.concat([f]), level.theme.crawler)));
    for (const e of level.enemies) if (e.alive) ctx.drawImage(crawler[Math.floor(frame / 10) % 2], Math.round(e.x - camX), Math.round(e.y - 1));

    if (state !== "warp") {
      let legs = "stand";
      if (!p.ground) legs = "apart";
      else if (p.anim) legs = Math.floor(p.anim / 6) % 2 ? "apart" : "close";
      const img = playerSprites[legs][p.face];
      if (state !== "dead" || frame % 4 < 2) ctx.drawImage(img, Math.round(p.x - 2 - camX), Math.round(p.y - 1));
    }

    for (const q of particles) px(ctx, q.x - camX, q.y, 2, 2, q.color);

    text(`STAGE ${level.stage}`, 4, 4, 1, "#ffffff");
    text(`COINS ${coins}`, VW - textWidth(`COINS ${coins}`, 1) - 4, 4, 1, "#f2c23b");

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
    const next = THEMES[level.stage % THEMES.length].portal[0];
    for (let r = 0; r < 6; r++) {
      const col = [c1, c2, next][(r + Math.floor(frame / 5)) % 3];
      const rx = 8 - r, ry = 16 - r * 2;
      for (let a = 0; a < 40; a++) {
        const t = (a / 40) * Math.PI * 2 + frame * 0.05 * (r % 2 ? 1 : -1);
        px(ctx, x + 8 + Math.cos(t) * rx, y + 16 + Math.sin(t) * ry, 1, 1, col);
      }
    }
    if (frame % 3 === 0) particles.push({ x: x + 8 + (Math.random() - 0.5) * 14, y: y + 30, vx: 0, vy: -0.6 - Math.random(), t: 25, color: c1 });
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
