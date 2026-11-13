// Portal Run themes: a small pixel-art toolkit and the theme list.
// Everything is drawn procedurally into offscreen canvases; no image files.
// Usable in the browser as the global PortalArt (portal.js reads it).
var PortalArt = (() => {
  const VH = 192, LW = 480, T = 16;

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
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  // ---------- drawing toolkit (bound to a seeded random source) ----------

  function toolkit(rand) {
    const R = (a, b) => a + rand() * (b - a);
    const RI = (a, b) => Math.floor(a + rand() * (b - a + 1));
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const k = { rand, R, RI, pick, LW, VH, px };

    k.layer = (fn) => { const [c, g] = offscreen(LW, VH); fn(g); return c; };
    k.cut = (g, x, y, w, h) => g.clearRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));

    // Flat colour bands with a checkerboard dither between them.
    k.sky = (g, colors, top = 0, bottom = VH) => {
      const band = (bottom - top) / colors.length;
      for (let y = top; y < bottom; y++) {
        const i = Math.min(colors.length - 1, Math.floor((y - top) / band));
        const next = colors[i + 1];
        if (next && y - top - i * band >= band - 3) {
          for (let x = 0; x < LW; x++) px(g, x, y, 1, 1, (x + y) % 2 ? next : colors[i]);
        } else px(g, 0, y, LW, 1, colors[i]);
      }
    };
    k.disc = (g, cx, cy, r, c) => {
      for (let dy = -r; dy <= r; dy++) {
        const w = Math.round(Math.sqrt(r * r - dy * dy));
        px(g, cx - w, cy + dy, w * 2 + 1, 1, c);
      }
    };
    k.ellipse = (g, cx, cy, rx, ry, c) => {
      for (let dy = -ry; dy <= ry; dy++) {
        const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
        px(g, cx - w, cy + dy, w * 2 + 1, 1, c);
      }
    };
    k.line = (g, x0, y0, x1, y1, c, w = 1) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
      for (let i = 0; i <= n; i++) px(g, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, w, w, c);
    };
    // Triangle with its apex up (h > 0) or down (h < 0), base centred on cx at baseY.
    k.tri = (g, cx, baseY, halfW, h, c) => {
      const n = Math.abs(h);
      for (let i = 0; i < n; i++) {
        const w = Math.round((halfW * (i + 1)) / n);
        px(g, cx - w, h > 0 ? baseY - n + i : baseY + n - 1 - i, w * 2 + 1, 1, c);
      }
    };
    k.dither = (g, x, y, w, h, c, phase = 0) => {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if ((Math.round(x) + i + Math.round(y) + j + phase) % 2 === 0) px(g, x + i, y + j, 1, 1, c);
    };
    k.stars = (g, n, maxY, cols = ["#ffffff", "#b0a8d8"]) => {
      for (let i = 0; i < n; i++) px(g, RI(0, LW - 1), RI(0, maxY), 1, 1, pick(cols));
    };
    k.clouds = (g, y0, y1, c, n = 6, s = 1) => {
      for (let i = 0; i < n; i++) {
        const w = RI(18, 36) * s, x = RI(4, LW - w - 4), y = RI(y0, y1);
        k.ellipse(g, x + w / 2, y, w / 2, 3 * s, c);
        k.ellipse(g, x + w * 0.35, y - 3 * s, w / 4, 3 * s, c);
        k.ellipse(g, x + w * 0.65, y - 2 * s, w / 5, 3 * s, c);
      }
    };

    // Horizon lines that wrap seamlessly across the layer width.
    k.ridge = (base, amps) => {
      const waves = amps.map((a, i) => ({ a, f: (i + 1) * RI(1, 2), p: R(0, 7) }));
      return Array.from({ length: LW }, (_, x) =>
        Math.round(base + waves.reduce((s, v) => s + v.a * Math.sin((x / LW) * Math.PI * 2 * v.f + v.p), 0)));
    };
    k.peaks = (base, height, count) => {
      // Sharp mountain range: max of triangles.
      const line = new Array(LW).fill(base);
      for (let i = 0; i < count; i++) {
        const cx = RI(0, LW), h = RI(height * 0.5, height), w = h * R(1.1, 1.8);
        for (let x = 0; x < LW; x++) {
          const d = Math.min(Math.abs(x - cx), LW - Math.abs(x - cx));
          line[x] = Math.min(line[x], Math.round(base - h + (d / w) * h + (rand() < 0.3 ? 1 : 0)));
        }
      }
      return line;
    };
    k.flat = (y) => new Array(LW).fill(y);
    k.fill = (g, line, c) => line.forEach((y, x) => px(g, x, y, 1, VH - y, c));
    k.edge = (g, line, c, t = 1) => line.forEach((y, x) => px(g, x, y, 1, t, c));
    k.caps = (g, line, below, c) => line.forEach((y, x) => { if (y < below) px(g, x, y, 1, Math.min(5, below - y), c); });
    k.along = (line, gap, fn, margin = 6) => {
      for (let x = margin + RI(0, gap[0]); x < LW - margin; x += RI(gap[0], gap[1])) fn(x, line[x]);
    };

    // ----- plants -----
    k.tree = (g, kind, x, base, h, c, trunk, c2) => {
      if (kind === "pine") {
        px(g, x - 1, base - 3, 2, 3, trunk);
        for (let r = 0; r < h; r++) {
          const half = Math.floor(((r % 5) + r * 0.6) / 2) + 1;
          px(g, x - half, base - h - 3 + r, half * 2, 1, c);
        }
      } else if (kind === "round") {
        px(g, x - 1, base - h * 0.45, 3, h * 0.45, trunk);
        k.disc(g, x, base - h * 0.62, Math.round(h * 0.36), c);
        if (c2) k.disc(g, x - Math.round(h * 0.1), base - h * 0.7, Math.round(h * 0.18), c2);
      } else if (kind === "cypress") {
        px(g, x, base - 3, 2, 3, trunk);
        k.ellipse(g, x + 1, base - h / 2 - 2, Math.max(2, Math.round(h / 7)), Math.round(h / 2), c);
      } else if (kind === "palm") {
        let tx = x, ty = base;
        for (let i = 0; i < h; i++) { px(g, tx, ty - i, 2, 1, trunk); if (i % 4 === 3) tx += 1; }
        const top = base - h;
        for (const [dx, dy] of [[-9, 3], [-6, 6], [9, 3], [6, 6], [0, -2], [-8, -1], [8, -1]]) k.line(g, tx, top, tx + dx, top + dy, c);
      } else if (kind === "acacia") {
        k.line(g, x, base, x + 2, base - h * 0.7, trunk);
        k.line(g, x + 2, base - h * 0.7, x - 5, base - h * 0.85, trunk);
        k.ellipse(g, x, base - h, Math.round(h * 0.7), Math.max(2, Math.round(h * 0.14)), c);
      } else if (kind === "dead") {
        px(g, x, base - h, 2, h, trunk);
        k.line(g, x, base - h * 0.6, x - h * 0.3, base - h * 0.85, trunk);
        k.line(g, x + 1, base - h * 0.75, x + h * 0.3, base - h, trunk);
        k.line(g, x, base - h * 0.4, x + h * 0.25, base - h * 0.55, trunk);
      } else if (kind === "bamboo") {
        for (let i = 0; i < h; i++) px(g, x, base - i, 2, 1, i % 6 === 0 ? trunk : c);
        k.line(g, x + 1, base - h + 2, x + 6, base - h + 5, c);
        k.line(g, x, base - h + 6, x - 5, base - h + 9, c);
      } else if (kind === "jungle") {
        px(g, x - 1, base - h * 0.5, 3, h * 0.5, trunk);
        k.disc(g, x, base - h * 0.7, Math.round(h * 0.3), c);
        k.disc(g, x - h * 0.25, base - h * 0.55, Math.round(h * 0.22), c);
        k.disc(g, x + h * 0.25, base - h * 0.58, Math.round(h * 0.22), c);
        for (let v = -2; v <= 2; v++) px(g, x + v * h * 0.12, base - h * 0.5, 1, RI(4, 12), c2 || c);
      } else if (kind === "spruce") {
        px(g, x, base - 3, 2, 3, trunk);
        k.tri(g, x + 1, base - 2, Math.round(h / 4), h, c);
        if (c2) for (let i = 4; i < h; i += 4) px(g, x + 1 - Math.round(i / 5), base - h - 2 + i, Math.round(i / 2.5), 1, c2);
      }
    };
    k.trees = (g, line, kind, c, trunk, gap, hr, c2) =>
      k.along(line, gap, (x, y) => k.tree(g, kind, x, y + 2, RI(hr[0], hr[1]), c, trunk, c2));

    // ----- buildings -----
    k.building = (g, x, base, w, h, o) => {
      const top = base - h;
      px(g, x, top, w, VH - top, o.body);
      const roof = o.roof === "mixed" ? pick(["flat", "gable", "dome", "spire", "flat"]) : o.roof || "flat";
      const rc = o.roofColor || o.body;
      if (roof === "gable") k.tri(g, x + w / 2, top, w / 2 + 2, Math.max(4, Math.round(w / 2.6)), rc);
      else if (roof === "dome") { k.ellipse(g, x + w / 2, top, Math.max(3, w / 2 - 2), Math.min(Math.round(w / 2.5), 12), rc); px(g, x + w / 2 - 1, top - Math.min(Math.round(w / 2.5), 12) - 4, 2, 4, rc); }
      else if (roof === "spire") k.tri(g, x + w / 2, top, Math.max(2, w / 4), Math.round(w * 1.1), rc);
      else if (roof === "pagoda") {
        for (let t = 0; t < 3; t++) {
          const y = top - t * 6;
          px(g, x - 4 + t * 3, y - 2, w + 8 - t * 6, 2, rc);
          px(g, x - 5 + t * 3, y - 3, 1, 1, rc);
          px(g, x + w + 4 - t * 3, y - 3, 1, 1, rc);
          if (t < 2) px(g, x + 2 + t * 3, y - 6, w - 4 - t * 6, 4, o.body);
        }
        px(g, x + w / 2 - 1, top - 22, 2, 5, rc);
      } else if (roof === "broken") {
        for (let i = 0; i < w; i += 2) k.cut(g, x + i, top, 2, RI(0, Math.round(h / 3)));
      } else if (roof === "flat" && rand() < (o.antenna ?? 0.25)) px(g, x + Math.round(w / 2), top - 6, 1, 6, o.body);
      if (o.lit || o.unlit) {
        const [ww, wh, p] = o.win || [2, 2, 5];
        for (let wy = top + 4; wy < base - 4; wy += p)
          for (let wx = x + 3; wx < x + w - 3 - ww + 1; wx += p) {
            const lit = rand() < (o.litChance ?? 0.3);
            if (lit && o.lit) px(g, wx, wy, ww, wh, o.lit);
            else if (o.unlit) px(g, wx, wy, ww, wh, o.unlit);
          }
      }
      if (o.neon && rand() < 0.55) {
        const nc = pick(o.neon);
        if (rand() < 0.5) px(g, x + 2, top + RI(6, Math.max(7, h - 12)), w - 4, 3, nc);
        else px(g, x + w - 4, top + 6, 2, Math.min(24, h - 10), nc);
      }
      if (roof === "broken" && o.holes) for (let i = 0; i < 3; i++) k.cut(g, x + RI(2, w - 6), top + RI(6, h - 6), RI(2, 5), RI(2, 4));
    };
    k.skyline = (g, base, o) => {
      for (let x = RI(0, 8); x < LW - 6;) {
        const w = RI(o.w[0], o.w[1]), h = RI(o.h[0], o.h[1]);
        k.building(g, x, base, Math.min(w, LW - x), h, o);
        x += w + RI((o.gap || [0, 4])[0], (o.gap || [0, 4])[1]);
      }
    };
    k.house = (g, x, base, o) => {
      const w = RI(o.w?.[0] ?? 18, o.w?.[1] ?? 30), h = RI(o.h?.[0] ?? 12, o.h?.[1] ?? 18);
      const top = base - h;
      px(g, x, top, w, h, o.wall);
      if (o.timber) {
        px(g, x, top, 1, h, o.timber); px(g, x + w - 1, top, 1, h, o.timber);
        px(g, x, top, w, 1, o.timber); px(g, x, top + Math.round(h / 2), w, 1, o.timber);
        k.line(g, x, top, x + w / 2, top + h / 2, o.timber);
      }
      const rh = RI(7, 12);
      k.tri(g, x + w / 2, top, w / 2 + 3, rh, o.roof);
      if (o.thatch) k.dither(g, x - 2, top - rh + 2, w + 4, rh - 2, o.thatch);
      if (rand() < 0.6) px(g, x + w - 6, top - rh + 2, 3, rh - 2, o.chimney || o.wall);
      px(g, x + 3, top + 4, 3, 3, o.win);
      if (w > 22) px(g, x + w - 7, top + 4, 3, 3, o.win);
      px(g, x + Math.round(w / 2) - 2, base - 7, 4, 7, o.door || "#3a2a1e");
      return w;
    };
    k.houses = (g, base, o, gap = [4, 14]) => {
      for (let x = RI(0, 10); x < LW - 36;) x += k.house(g, x, base, o) + RI(gap[0], gap[1]);
    };
    k.pyramid = (g, cx, base, hw, c, shade) => {
      for (let i = 0; i < hw; i++) {
        px(g, cx - i, base - hw + i, i + 1, 1, c);
        px(g, cx + 1, base - hw + i, i, 1, shade);
        if (i % 3 === 2) { px(g, cx - i, base - hw + i, i + 1, 1, shade); }
      }
    };
    k.column = (g, x, base, h, c, shade) => {
      px(g, x - 1, base - 3, 9, 3, c);
      px(g, x, base - h, 7, h, c);
      for (let i = 1; i < 7; i += 2) px(g, x + i, base - h + 3, 1, h - 6, shade);
      px(g, x - 1, base - h - 3, 9, 3, c);
    };
    k.temple = (g, x, base, n, c, shade) => {
      const h = 34;
      for (let i = 0; i < n; i++) k.column(g, x + 4 + i * 14, base, h, c, shade);
      const w = n * 14 + 4;
      px(g, x, base - h - 7, w, 4, c);
      k.tri(g, x + w / 2, base - h - 7, w / 2, 12, c);
      k.tri(g, x + w / 2, base - h - 9, w / 2 - 6, 7, shade);
      return w;
    };
    k.arches = (g, base, top, span, c) => {
      px(g, 0, top, LW, base - top, c);
      for (let x = 4; x < LW; x += span) {
        const r = Math.round(span / 2) - 3;
        k.cut(g, x, top + r + 6, r * 2, base - top - r - 6);
        for (let dy = 0; dy <= r; dy++) {
          const w = Math.round(Math.sqrt(r * r - dy * dy));
          k.cut(g, x + r - w, top + r + 6 - dy, w * 2, 1);
        }
      }
    };
    k.wallLine = (g, line, c, dark, tower = 90) => {
      line.forEach((y, x) => {
        px(g, x, y - 10, 1, 10, c);
        if (x % 6 < 3) px(g, x, y - 13, 1, 3, c);
        if (x % 3 === 0) px(g, x, y - 4, 1, 1, dark);
      });
      for (let x = RI(10, 40); x < LW - 20; x += RI(tower - 20, tower + 20)) {
        const y = line[x];
        px(g, x - 6, y - 22, 13, 22, c);
        for (let i = 0; i < 13; i += 4) px(g, x - 6 + i, y - 25, 2, 3, c);
        px(g, x - 1, y - 16, 2, 4, dark);
      }
    };
    k.castle = (g, cx, base, c, dark, roof) => {
      px(g, cx - 30, base - 30, 60, 30, c);
      for (let i = 0; i < 60; i += 6) px(g, cx - 30 + i, base - 34, 3, 4, c);
      for (const tx of [cx - 36, cx + 26]) {
        px(g, tx, base - 46, 10, 46, c);
        k.tri(g, tx + 5, base - 46, 7, 12, roof);
        px(g, tx + 4, base - 38, 2, 4, dark);
      }
      px(g, cx - 6, base - 54, 12, 24, c);
      k.tri(g, cx, base - 54, 9, 14, roof);
      px(g, cx - 4, base - 12, 8, 12, dark);
    };

    // ----- water and sea -----
    k.water = (g, y, c, hi, n = 60) => {
      px(g, 0, y, LW, VH - y, c);
      for (let i = 0; i < n; i++) px(g, RI(0, LW - 8), RI(y + 1, VH - 1), RI(3, 8), 1, hi);
      px(g, 0, y, LW, 1, hi);
    };
    k.rays = (g, c, n = 6) => {
      for (let i = 0; i < n; i++) {
        const x0 = RI(0, LW), w = RI(6, 16);
        for (let y = 0; y < VH; y += 1) for (let j = 0; j < w; j++) if ((x0 + j + y) % 3 === 0) px(g, x0 + j + y * 0.35, y, 1, 1, c);
      }
    };
    k.seaweed = (g, base, c, gap = [10, 26]) => {
      for (let x = RI(2, 10); x < LW - 4; x += RI(gap[0], gap[1])) {
        const h = RI(16, 50);
        for (let i = 0; i < h; i++) px(g, x + Math.round(Math.sin(i / 4) * 2), base - i, 2, 1, c);
      }
    };
    k.fish = (g, n, cols, y0, y1) => {
      for (let i = 0; i < n; i++) {
        const x = RI(4, LW - 12), y = RI(y0, y1), c = pick(cols);
        px(g, x, y, 6, 3, c); px(g, x + 6, y - 1, 2, 5, c); px(g, x + 1, y, 1, 1, "#10141a");
      }
    };
    k.ship = (g, x, waterY, hull, sail, mast) => {
      const w = RI(26, 44);
      for (let i = 0; i < 6; i++) px(g, x + i, waterY - 6 + i, w - i * 2, 1, hull);
      px(g, x - 2, waterY - 7, w + 4, 1, hull);
      const masts = w > 34 ? 2 : 1;
      for (let m = 0; m < masts; m++) {
        const mx = x + Math.round(w * (m + 1) / (masts + 1));
        px(g, mx, waterY - 30, 1, 23, mast);
        k.tri(g, mx + 6, waterY - 9, 5, 18, sail);
        px(g, mx, waterY - 32, 4, 2, "#d8402f");
      }
    };
    k.crane = (g, x, base, c) => {
      px(g, x, base - 60, 4, 60, c);
      for (let y = base - 60; y < base; y += 6) k.line(g, x, y, x + 3, y + 6, c);
      px(g, x - 14, base - 62, 50, 3, c);
      px(g, x + 30, base - 59, 1, 24, c);
      px(g, x + 28, base - 35, 5, 3, c);
    };

    // ----- interiors and caves -----
    k.bricks = (g, y0, y1, c, mortar, bw = 10, bh = 5) => {
      px(g, 0, y0, LW, y1 - y0, c);
      for (let y = y0; y < y1; y += bh) {
        px(g, 0, y, LW, 1, mortar);
        for (let x = ((y - y0) / bh) % 2 ? bw / 2 : 0; x < LW; x += bw) px(g, x, y, 1, bh, mortar);
      }
    };
    k.drips = (g, c, maxLen, fromTop = true, gap = [6, 18]) => {
      for (let x = RI(0, 6); x < LW - 4; x += RI(gap[0], gap[1])) {
        const len = RI(Math.round(maxLen / 3), maxLen), hw = Math.max(1, Math.round(len / 5));
        if (fromTop) k.tri(g, x, 0, hw, -len, c);
        else k.tri(g, x, VH, hw, len, c);
      }
    };
    k.crystals = (g, line, cols, gap = [12, 30]) =>
      k.along(line, gap, (x, y) => {
        const c = pick(cols);
        for (let i = 0; i < 3; i++) k.tri(g, x + i * 3 - 3, y + 1, 1 + (i % 2), RI(6, 16), c);
      });
    k.pillars = (g, gap, w, c, shade, top = 0) => {
      for (let x = RI(0, 20); x < LW - w; x += RI(gap[0], gap[1])) {
        px(g, x, top, w, VH - top, c);
        px(g, x + w - 2, top, 2, VH - top, shade);
      }
    };
    k.boulders = (g, line, c, hi, gap = [14, 40]) =>
      k.along(line, gap, (x, y) => {
        const r = RI(3, 9);
        k.disc(g, x, y - r + 2, r, c);
        k.disc(g, x - Math.round(r / 3), y - r, Math.max(1, Math.round(r / 3)), hi);
      });
    k.smoke = (g, x, y, c, n = 6) => {
      for (let i = 0; i < n; i++) k.disc(g, x + Math.round(Math.sin(i) * 4) + i * 2, y - i * 8, 4 + i, c);
    };
    k.planet = (g, cx, cy, r, c, shade, ring) => {
      k.disc(g, cx, cy, r, c);
      for (let dy = -r; dy <= r; dy++) {
        const w = Math.round(Math.sqrt(r * r - dy * dy));
        px(g, cx + Math.round(w * 0.3), cy + dy, Math.round(w * 0.7), 1, shade);
      }
      if (ring) { k.ellipse(g, cx, cy, r * 2, 2, ring); k.disc(g, cx, cy - 2, r - 2, c); }
    };
    k.grid = (g, horizon, c) => {
      for (let i = 1; i < 12; i++) px(g, 0, horizon + Math.round(i * i * 0.6), LW, 1, c);
      for (let x = -LW; x < LW * 2; x += 24) k.line(g, LW / 2 + (x - LW / 2) * 0.12, horizon, x, VH, c);
    };
    k.code = (g, c, c2, n = 40) => {
      for (let i = 0; i < n; i++) {
        const x = RI(0, LW / 4) * 4, y0 = RI(-20, VH - 20), len = RI(4, 14);
        for (let j = 0; j < len; j++) px(g, x, y0 + j * 4, 2, 2, j === len - 1 ? c2 : c);
      }
    };
    k.car = (g, x, y, c, glass = "#9ad0f0") => {
      px(g, x, y - 5, 20, 5, c);
      px(g, x + 4, y - 9, 11, 4, c);
      px(g, x + 6, y - 8, 3, 3, glass);
      px(g, x + 10, y - 8, 3, 3, glass);
      px(g, x + 2, y - 1, 4, 3, "#151515");
      px(g, x + 14, y - 1, 4, 3, "#151515");
    };
    k.tent = (g, x, base, c, dark) => {
      k.tri(g, x + 10, base, 12, 14, c);
      k.tri(g, x + 10, base, 3, 8, dark);
    };
    k.tower = (g, x, base, c) => {
      px(g, x, base - 40, 2, 40, c); px(g, x + 14, base - 40, 2, 40, c);
      for (let y = base - 40; y < base; y += 10) k.line(g, x, y, x + 14, y + 10, c);
      px(g, x - 3, base - 48, 22, 9, c);
      px(g, x - 5, base - 50, 26, 2, c);
    };
    k.fence = (g, y, c, gap = 8, wire = true) => {
      for (let x = 0; x < LW; x += gap) px(g, x, y - 12, 1, 12, c);
      px(g, 0, y - 11, LW, 1, c);
      px(g, 0, y - 6, LW, 1, c);
      if (wire) for (let x = 0; x < LW; x += 3) px(g, x, y - 14 + (x % 6 ? 0 : 1), 1, 1, c);
    };
    return k;
  }

  // ---------- themes ----------
  // layers(k) returns [[canvas, parallax factor], ...] from far to near.
  // tile: [style, palette]; deco: ground props; weather: overlay particles.

  const P = (top, hi, fill, dk, lt, accent) => ({ top, hi, fill, dk, lt, accent });

  const THEMES = [
    {
      name: "Forest",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#7ec4e8", "#9fd4ee", "#bfe3f2", "#dff1f6"]);
          k.disc(g, 386, 36, 9, "#fff6d0");
          const m = k.peaks(118, 50, 6);
          k.fill(g, m, "#7a9cb8");
          k.caps(g, m, 84, "#e8f0f4");
        });
        const mid = k.layer((g) => {
          const h = k.ridge(130, [6, 3]);
          k.fill(g, h, "#3f7a4f");
          k.trees(g, h, "pine", "#2f6a40", "#2a3a2a", [6, 12], [14, 24]);
        });
        const near = k.layer((g) => {
          const h = k.ridge(156, [5, 3]);
          k.fill(g, h, "#24543a");
          k.trees(g, h, "pine", "#1d4a30", "#3a2a1e", [18, 36], [26, 42]);
        });
        return [[far, 0.1], [mid, 0.3], [near, 0.55]];
      },
      tile: ["grass", P("#5cae48", "#8ad05a", "#7a4f2e", "#5e3a20", "#94653c")],
      deco: ["flower", "mushroom", "tuft"],
      portal: ["#7ef0c0", "#2fb08a"],
    },
    {
      name: "City at Night",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#1a1438", "#2a1d4f", "#43286a", "#6a3a7a"]);
          k.stars(g, 70, 90);
          k.disc(g, 76, 30, 7, "#f4eecf"); k.disc(g, 80, 28, 6, "#2a1d4f");
        });
        const mid = k.layer((g) => k.skyline(g, 150, { w: [18, 40], h: [40, 110], body: "#2e2a4a", lit: "#e8c46a", unlit: "#3a3658" }));
        const near = k.layer((g) => k.skyline(g, 176, { w: [24, 50], h: [30, 80], body: "#1c1a2e", lit: "#f2d27a", unlit: "#25233a", win: [2, 2, 6] }));
        return [[far, 0.05], [mid, 0.25], [near, 0.5]];
      },
      tile: ["brick", P("#8a8d96", "#b8bbc4", "#8a4a3a", "#5a2e24", "#c9b8a8")],
      deco: ["lamp", "hydrant", "trash"],
      portal: ["#f2b84b", "#e5604f"],
    },
    {
      name: "Desert",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#f2a65a", "#f6be72", "#f8d490", "#fbe6b4"]);
          k.disc(g, 240, 70, 22, "#fff0b0");
          for (let x = 0; x < LW - 60;) {
            const w = k.RI(30, 70), h = k.RI(20, 50);
            px(g, x + 4, 120 - h, w - 8, h + 80, "#c97a4a");
            px(g, x, 126 - h, w, h + 80, "#c97a4a");
            px(g, x, 126 - h, w, 2, "#a85e38");
            x += w + k.RI(30, 80);
          }
        });
        const mid = k.layer((g) => { const d = k.ridge(140, [8, 4]); k.fill(g, d, "#e0b070"); k.edge(g, d, "#f0c888"); });
        const near = k.layer((g) => {
          const d = k.ridge(162, [6, 3]);
          k.fill(g, d, "#d09a58");
          k.along(d, [40, 90], (x, y) => drawCactus(g, x, y, 1.6));
        });
        return [[far, 0.1], [mid, 0.3], [near, 0.5]];
      },
      tile: ["sand", P("#e8c47a", "#f6dc9c", "#c08a50", "#9a6a3a", "#d8a868")],
      deco: ["cactus", "bone", "rock"],
      portal: ["#b07ef0", "#6a3fd1"],
    },
    {
      name: "English Village",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#a8c8e0", "#bcd6e8", "#d0e2ee", "#e2ecf2"]);
          k.clouds(g, 20, 60, "#f4f8fa", 7, 1.3);
          const h = k.ridge(122, [8, 5]);
          k.fill(g, h, "#7aa86a");
          for (let x = 0; x < LW; x += 40) k.line(g, x, h[x] ?? 122, x + 30, (h[x + 30] ?? 122) + 2, "#5f9050"); // hedgerows
        });
        const mid = k.layer((g) => {
          const h = k.ridge(146, [3, 2]);
          k.fill(g, h, "#5f9050");
          k.houses(g, 150, { wall: "#e8dcc0", roof: "#c9a85a", thatch: "#a88a40", win: "#4a5a6a", door: "#3a5a8a" });
          k.building(g, 220, 150, 14, 34, { body: "#a8a090", roof: "spire", roofColor: "#6a6458" });
        });
        const near = k.layer((g) => {
          const h = k.ridge(166, [3, 2]);
          k.fill(g, h, "#4a7a40");
          k.trees(g, h, "round", "#3f6e3a", "#5a4030", [40, 90], [26, 36], "#5a8a48");
        });
        return [[far, 0.08], [mid, 0.25], [near, 0.5]];
      },
      tile: ["grass", P("#6aaa50", "#90c870", "#7a5a3a", "#5a4028", "#9a7a50")],
      deco: ["flower", "post", "tuft"],
      portal: ["#f2d24b", "#c9a85a"],
    },
    {
      name: "Swamp",
      weather: "fireflies",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#3a4a3a", "#4a5a40", "#5a6a48", "#6a7850"]);
          k.disc(g, 300, 50, 12, "#c8d0a0");
          const h = k.ridge(130, [4, 2]);
          k.fill(g, h, "#2f3f2f");
          k.trees(g, h, "dead", "#1f2a1f", "#1f2a1f", [14, 30], [20, 40]);
        });
        const mid = k.layer((g) => {
          k.water(g, 150, "#3a4a30", "#5a6a40", 50);
          k.trees(g, k.flat(152), "dead", "#2a3424", "#2a3424", [30, 60], [30, 56]);
          k.dither(g, 0, 132, LW, 14, "#8a9a78");
        });
        const near = k.layer((g) => {
          k.along(k.flat(176), [6, 14], (x, y) => { for (let i = 0; i < 3; i++) px(g, x + i * 2, y - k.RI(8, 20), 1, 30, "#4a5a2a"); px(g, x + 2, y - 22, 2, 5, "#6a4a2a"); });
        });
        return [[far, 0.08], [mid, 0.25], [near, 0.55]];
      },
      tile: ["mud", P("#4a6a30", "#6a8a40", "#4a3a28", "#33281c", "#5a4a34")],
      deco: ["reed", "mushroom", "puddle"],
      portal: ["#c0f07e", "#6aa83a"],
    },
    {
      name: "Egypt",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#5aa0e0", "#78b4e6", "#a0cae8", "#e8dcb0"]);
          k.disc(g, 90, 34, 10, "#fff6d0");
          k.pyramid(g, 200, 140, 70, "#d8b070", "#b08850");
          k.pyramid(g, 330, 140, 50, "#d8b070", "#b08850");
          k.pyramid(g, 90, 140, 36, "#d8b070", "#b08850");
          px(g, 0, 140, LW, 60, "#e0c080");
        });
        const mid = k.layer((g) => {
          const d = k.ridge(150, [4, 2]);
          k.fill(g, d, "#d8b070");
          k.trees(g, d, "palm", "#4f7a3a", "#7a5a30", [30, 70], [18, 28]);
        });
        const near = k.layer((g) => {
          k.along(k.flat(178), [90, 150], (x, y) => {
            px(g, x, y - 46, 10, 46, "#c8a060");
            k.tri(g, x + 5, y - 46, 5, 8, "#c8a060");
            for (let i = 0; i < 5; i++) px(g, x + 3, y - 40 + i * 8, 4, 2, "#8a6a3a");
          });
        });
        return [[far, 0.08], [mid, 0.3], [near, 0.5]];
      },
      tile: ["stone", P("#e8c88a", "#f8e0a8", "#d0a868", "#9a7a48", "#e8c88a")],
      deco: ["urn", "rock", "bone"],
      portal: ["#f2c23b", "#2a6ab0"],
    },
    {
      name: "Alien World",
      weather: "spores",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#1a0a2a", "#3a1050", "#6a2070", "#a03a7a"]);
          k.stars(g, 60, 100, ["#ffffff", "#f0a0ff"]);
          k.planet(g, 120, 46, 24, "#6ad0c0", "#3a9a8a", "#a0f0e0");
          k.disc(g, 380, 30, 6, "#f0f080");
          const m = k.peaks(130, 60, 7);
          k.fill(g, m, "#4a1a5a");
        });
        const mid = k.layer((g) => {
          const h = k.ridge(146, [7, 3]);
          k.fill(g, h, "#2a3a6a");
          k.along(h, [20, 40], (x, y) => { px(g, x, y - 26, 2, 26, "#3a9a7a"); k.disc(g, x + 1, y - 28, 5, "#6af0b0"); k.disc(g, x + 1, y - 28, 2, "#f0f080"); });
        });
        const near = k.layer((g) => {
          const h = k.ridge(168, [4, 2]);
          k.fill(g, h, "#1a2050");
          k.crystals(g, h, ["#f070d0", "#70f0f0", "#c0a0ff"], [16, 34]);
        });
        return [[far, 0.06], [mid, 0.25], [near, 0.5]];
      },
      tile: ["grass", P("#8a3ac0", "#c070f0", "#2a2a5a", "#1a1a40", "#4a4a8a")],
      deco: ["crystal", "alienPlant", "rock"],
      portal: ["#70f0f0", "#f070d0"],
    },
    {
      name: "Rabbit Hole",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#2a1a10", "#3a2414", "#4a2e1a", "#3a2414"]);
          for (let i = 0; i < 40; i++) k.ellipse(g, k.RI(0, LW), k.RI(0, VH), k.RI(6, 16), k.RI(3, 8), "#4e3420");
        });
        const mid = k.layer((g) => {
          // dangling roots from above
          for (let x = k.RI(0, 10); x < LW; x += k.RI(8, 20)) {
            let rx = x;
            const len = k.RI(20, 80);
            for (let y = 0; y < len; y++) { px(g, rx, y, 2, 1, "#6a4a2a"); if (k.rand() < 0.2) rx += k.pick([-1, 1]); }
          }
          px(g, 0, 0, LW, 8, "#3a2414");
        });
        const near = k.layer((g) => {
          k.along(k.flat(176), [60, 120], (x, y) => {
            // little burrow doors and lanterns
            k.ellipse(g, x, y - 10, 8, 10, "#1a0e08");
            px(g, x + 14, y - 30, 1, 14, "#3a2a1e");
            px(g, x + 12, y - 16, 5, 6, "#f2c23b");
          });
          for (let i = 0; i < 14; i++) k.disc(g, k.RI(0, LW), k.RI(20, 120), k.RI(1, 3), "#7a5a3a");
        });
        return [[far, 0.1], [mid, 0.3], [near, 0.5]];
      },
      tile: ["rock", P("#6a4a2a", "#8a6a3a", "#4a3020", "#2e1e12", "#6a4a30")],
      deco: ["carrot", "mushroom", "rock"],
      portal: ["#f2f2f2", "#f2a0c0"],
    },
    {
      name: "Medieval Village",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#8ab0d8", "#a0c0e0", "#b8d0e6", "#d0e0ea"]);
          k.clouds(g, 16, 50, "#eef4f8", 5, 1.2);
          const h = k.ridge(126, [10, 4]);
          k.fill(g, h, "#6a8a5a");
          k.castle(g, 300, h[300] + 2, "#8a8a90", "#3a3a40", "#5a5aa0");
        });
        const mid = k.layer((g) => {
          const h = k.ridge(150, [3, 2]);
          k.fill(g, h, "#4f7a40");
          k.houses(g, 152, { wall: "#e0d0b0", roof: "#8a4a2a", timber: "#4a3020", win: "#2a2a30", w: [16, 26] });
        });
        const near = k.layer((g) => {
          k.along(k.flat(178), [30, 70], (x, y) => { px(g, x, y - 18, 2, 18, "#5a4030"); px(g, x - 10, y - 18, 22, 2, "#5a4030"); px(g, x - 6, y - 16, 14, 6, "#b0302a"); });
        });
        return [[far, 0.08], [mid, 0.28], [near, 0.5]];
      },
      tile: ["cobble", P("#8a8a80", "#a8a89c", "#6a6a60", "#4a4a44", "#8a8a80")],
      deco: ["barrel", "hay", "post"],
      portal: ["#d0b0ff", "#8a5ad0"],
    },
    {
      name: "Neo Tokyo",
      weather: "rain",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#0a0a24", "#1a1040", "#3a1a5a", "#6a2a6a"]);
          k.disc(g, 380, 40, 16, "#f05a7a");
          k.skyline(g, 140, { w: [12, 26], h: [60, 130], body: "#1a1a3a", lit: "#6af0f0", unlit: "#22224a", litChance: 0.2, gap: [0, 2] });
        });
        const mid = k.layer((g) => {
          k.skyline(g, 160, { w: [20, 36], h: [30, 90], body: "#14142c", roof: "pagoda", roofColor: "#2a1a3a", lit: "#f070d0", unlit: "#1c1c3a", neon: ["#f070d0", "#70f0f0", "#f0f070"], gap: [6, 20] });
        });
        const near = k.layer((g) => {
          k.skyline(g, 180, { w: [24, 46], h: [20, 60], body: "#0c0c1c", lit: "#f2d27a", unlit: "#141428", neon: ["#ff3a6a", "#3af0ff", "#a0ff3a"], win: [2, 2, 6], gap: [4, 30] });
        });
        return [[far, 0.06], [mid, 0.25], [near, 0.5]];
      },
      tile: ["metal", P("#3a3a5a", "#70f0f0", "#22223a", "#14142a", "#5a5a8a")],
      deco: ["lantern", "neonSign", "cone"],
      portal: ["#70f0f0", "#f070d0"],
    },
    {
      name: "Renaissance Italy",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#8ac0e8", "#a8d0ec", "#e8d8b0", "#f0c890"]);
          const h = k.ridge(128, [8, 4]);
          k.fill(g, h, "#8a9a60");
          k.trees(g, h, "cypress", "#3a5a30", "#3a2a1e", [10, 24], [16, 26]);
        });
        const mid = k.layer((g) => {
          k.skyline(g, 156, { w: [22, 40], h: [26, 50], body: "#e0b080", roof: "flat", antenna: 0, unlit: "#8a5a3a", win: [2, 3, 7] });
          k.building(g, 180, 156, 50, 50, { body: "#e8c8a0", roof: "dome", roofColor: "#c0603a", unlit: "#8a5a3a", win: [2, 3, 8] });
          k.building(g, 260, 156, 12, 80, { body: "#e8d0b0", roof: "flat", antenna: 0, unlit: "#8a6a4a", win: [2, 3, 8] });
        });
        const near = k.layer((g) => {
          k.along(k.flat(178), [40, 80], (x, y) => k.tree(g, "cypress", x, y, k.RI(30, 44), "#2f4a26", "#3a2a1e"));
        });
        return [[far, 0.08], [mid, 0.28], [near, 0.5]];
      },
      tile: ["stone", P("#d8b890", "#f0d8b0", "#c8a070", "#9a7650", "#e0c098")],
      deco: ["urn", "flower", "post"],
      portal: ["#f2c23b", "#c0603a"],
    },
    {
      name: "Hawaiian Islands",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#3aa0e0", "#5ab8ea", "#8ad0f0", "#c0e8f6"]);
          k.clouds(g, 20, 60, "#ffffff", 6, 1.4);
          k.water(g, 132, "#2a8ac0", "#6ac0e8", 40);
          k.tri(g, 150, 133, 60, 36, "#3a6a3a");
          k.tri(g, 150, 100, 8, 4, "#5a4a3a");
          k.tri(g, 380, 133, 40, 20, "#4a7a40");
        });
        const mid = k.layer((g) => {
          k.water(g, 150, "#1a7ab0", "#8ad0f0", 60);
          k.along(k.flat(152), [80, 160], (x) => { k.ellipse(g, x, 152, 22, 4, "#e8d090"); k.tree(g, "palm", x, 150, 22, "#3a8a3a", "#7a5a30"); });
        });
        const near = k.layer((g) => {
          k.along(k.flat(178), [40, 100], (x, y) => k.tree(g, "palm", x, y, k.RI(34, 48), "#2f7a2f", "#6a4a28"));
        });
        return [[far, 0.06], [mid, 0.25], [near, 0.55]];
      },
      tile: ["sand", P("#f0dca0", "#fff0c0", "#d8b878", "#b09050", "#e8cc90")],
      deco: ["shell", "flower", "tuft"],
      portal: ["#70f0c0", "#f2a0c0"],
    },
    {
      name: "Snowy Peaks",
      weather: "snow",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#5a7ab0", "#7a9ac8", "#a0b8d8", "#d0dcea"]);
          const m = k.peaks(140, 100, 5);
          k.fill(g, m, "#8a9ab8");
          k.caps(g, m, 110, "#f4f8fc");
          m.forEach((y, x) => { if (x % 7 < 2 && y < 110) px(g, x, y + 5, 1, 4, "#c8d4e4"); });
        });
        const mid = k.layer((g) => {
          const m = k.peaks(158, 50, 7);
          k.fill(g, m, "#e8eef6");
          k.trees(g, m, "spruce", "#2a4a5a", "#2a2a2a", [8, 18], [16, 26], "#e8eef6");
        });
        const near = k.layer((g) => {
          const h = k.ridge(170, [4, 2]);
          k.fill(g, h, "#f4f8fc");
          k.trees(g, h, "spruce", "#1f3a48", "#2a2a2a", [24, 50], [30, 44], "#f4f8fc");
        });
        return [[far, 0.06], [mid, 0.25], [near, 0.5]];
      },
      tile: ["snow", P("#f4f8fc", "#ffffff", "#6a6a78", "#4a4a58", "#8a8a98")],
      deco: ["rock", "snowman", "post"],
      portal: ["#a0f0ff", "#5a8ad0"],
    },
    {
      name: "Supermarket",
      layers(k) {
        const far = k.layer((g) => {
          px(g, 0, 0, LW, VH, "#e8e4d8");
          px(g, 0, 0, LW, 18, "#c8c4b8");
          for (let x = 10; x < LW; x += 60) { px(g, x, 4, 40, 4, "#ffffff"); px(g, x, 8, 40, 1, "#a8a498"); }
          for (let x = 30; x < LW; x += 120) { px(g, x, 26, 50, 12, "#3a8a5a"); px(g, x + 6, 30, 38, 4, "#f4f4f4"); }
        });
        const mid = k.layer((g) => {
          for (let x = 0; x < LW; x += 96) {
            px(g, x, 60, 80, 120, "#b8b0a0");
            for (let y = 66; y < 176; y += 18) {
              px(g, x + 2, y + 14, 76, 2, "#7a7468");
              for (let i = x + 4; i < x + 76;) {
                const w = k.RI(3, 7), h = k.RI(6, 13);
                px(g, i, y + 14 - h, w, h, k.pick(["#e5604f", "#f2c23b", "#3a7fd5", "#5ad17a", "#f2f2f2", "#9a5fd1", "#e08a3c"]));
                i += w + 1;
              }
            }
          }
        });
        const near = k.layer((g) => {
          k.along(k.flat(178), [80, 160], (x, y) => {
            px(g, x, y - 18, 20, 12, "#a0a8b0");
            for (let i = 0; i < 20; i += 3) px(g, x + i, y - 18, 1, 12, "#c8d0d8");
            px(g, x + 20, y - 24, 2, 8, "#a0a8b0");
            px(g, x + 2, y - 4, 3, 3, "#303030"); px(g, x + 15, y - 4, 3, 3, "#303030");
          });
        });
        return [[far, 0.1], [mid, 0.3], [near, 0.6]];
      },
      tile: ["tile", P("#d0ccc0", "#f0ece0", "#e8e4d8", "#a8a498", "#c8c4b8")],
      deco: ["cone", "crate", "cart"],
      portal: ["#f2c23b", "#e5604f"],
    },
    {
      name: "Old European City",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#9ab0c8", "#b0c0d0", "#c8d0d8", "#dcdcd8"]);
          k.clouds(g, 10, 50, "#e8ecee", 6, 1.2);
          k.skyline(g, 140, { w: [14, 26], h: [30, 70], body: "#8a8a98", roof: "mixed", roofColor: "#6a6a7a", antenna: 0 });
          k.building(g, 240, 140, 18, 80, { body: "#7a7a88", roof: "spire", roofColor: "#5a6a6a" });
        });
        const mid = k.layer((g) => {
          k.skyline(g, 160, { w: [16, 24], h: [40, 70], body: "#c8a080", roof: "gable", roofColor: "#8a4a3a", lit: "#f2d27a", unlit: "#5a4a40", litChance: 0.15, win: [3, 4, 7], gap: [0, 1] });
        });
        const near = k.layer((g) => {
          k.along(k.flat(180), [50, 90], (x, y) => { px(g, x, y - 28, 2, 28, "#2a2a2a"); px(g, x - 2, y - 32, 6, 5, "#2a2a2a"); px(g, x - 1, y - 31, 4, 3, "#f2d27a"); });
        });
        return [[far, 0.08], [mid, 0.28], [near, 0.5]];
      },
      tile: ["cobble", P("#7a7a80", "#9a9aa0", "#5a5a60", "#3a3a40", "#7a7a80")],
      deco: ["lamp", "barrel", "flower"],
      portal: ["#f2d27a", "#8a4a3a"],
    },
    {
      name: "Savanna",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#f0b060", "#f4c478", "#f6d898", "#f8e8b8"]);
          k.disc(g, 300, 96, 26, "#fff0c0");
          const h = k.ridge(128, [5, 3]);
          k.fill(g, h, "#c8a050");
          k.along(h, [80, 160], (x, y) => k.tree(g, "acacia", x, y + 2, k.RI(16, 22), "#7a6a30", "#5a4a20"));
        });
        const mid = k.layer((g) => {
          const h = k.ridge(150, [4, 2]);
          k.fill(g, h, "#b89040");
          k.along(h, [60, 120], (x, y) => {
            // giraffe silhouette
            px(g, x, y - 12, 12, 6, "#6a4a20"); px(g, x + 10, y - 26, 2, 16, "#6a4a20"); px(g, x + 9, y - 28, 5, 3, "#6a4a20");
            for (const lx of [x, x + 2, x + 8, x + 10]) px(g, lx, y - 6, 1, 6, "#6a4a20");
          });
        });
        const near = k.layer((g) => {
          const h = k.ridge(170, [3, 2]);
          k.fill(g, h, "#a07a30");
          k.trees(g, h, "acacia", "#4a5a20", "#3a2a10", [80, 160], [30, 40]);
          k.along(h, [3, 6], (x, y) => px(g, x, y - k.RI(2, 6), 1, 6, "#c8a050"));
        });
        return [[far, 0.08], [mid, 0.28], [near, 0.5]];
      },
      tile: ["grass", P("#c8a850", "#e0c870", "#9a6a3a", "#7a4a2a", "#b08050")],
      deco: ["tuft", "rock", "bone"],
      portal: ["#f2c23b", "#c9603a"],
    },
    {
      name: "Ice Cave",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#1a2a4a", "#2a4a6a", "#3a6a8a", "#2a4a6a"]);
          for (let i = 0; i < 30; i++) k.ellipse(g, k.RI(0, LW), k.RI(0, VH), k.RI(10, 30), k.RI(4, 10), "#4a7a9a");
        });
        const mid = k.layer((g) => {
          k.drips(g, "#a0d8f0", 60, true, [8, 20]);
          k.drips(g, "#6aa0c8", 50, false, [12, 30]);
        });
        const near = k.layer((g) => {
          k.drips(g, "#d0f0ff", 36, true, [16, 40]);
          k.crystals(g, k.flat(180), ["#a0f0ff", "#d0f8ff", "#70c0f0"], [30, 70]);
        });
        return [[far, 0.1], [mid, 0.3], [near, 0.55]];
      },
      tile: ["ice", P("#c8f0ff", "#ffffff", "#7ab8e0", "#4a88b8", "#a8e0f8")],
      deco: ["crystal", "icicle", "rock"],
      portal: ["#ffffff", "#70c0f0"],
    },
    {
      name: "Deep Ocean",
      weather: "bubbles",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#0a3a6a", "#08305a", "#06244a", "#041a38"]);
          k.rays(g, "#2a6aa0", 7);
        });
        const mid = k.layer((g) => {
          k.fish(g, 14, ["#3a8ac0", "#5aa0c8"], 30, 140);
          const h = k.ridge(160, [6, 3]);
          k.fill(g, h, "#0a2440");
          k.seaweed(g, 176, "#1a5a4a");
        });
        const near = k.layer((g) => {
          k.fish(g, 6, ["#f2a03a", "#f2d24b", "#e5604f"], 40, 140);
          k.seaweed(g, 192, "#2a8a5a", [30, 60]);
          k.along(k.flat(182), [50, 100], (x, y) => { k.disc(g, x, y - 4, 6, "#e5604f"); k.disc(g, x + 6, y - 2, 4, "#f2a0c0"); });
        });
        return [[far, 0.08], [mid, 0.3], [near, 0.55]];
      },
      tile: ["sand", P("#c8b890", "#e0d0a8", "#8a7a5a", "#6a5a40", "#a89a78")],
      deco: ["shell", "coral", "weed"],
      portal: ["#70f0f0", "#3a8ac0"],
    },
    {
      name: "Space Station",
      layers(k) {
        const far = k.layer((g) => {
          px(g, 0, 0, LW, VH, "#05050f");
          k.stars(g, 120, VH, ["#ffffff", "#a0b0ff", "#ffd0a0"]);
          k.planet(g, 340, 120, 50, "#3a7ad0", "#2a5aa0");
          k.ellipse(g, 330, 110, 14, 6, "#5ad17a");
        });
        const mid = k.layer((g) => {
          // hull wall with big windows cut out
          px(g, 0, 0, LW, VH, "#5a6070");
          for (let x = 0; x < LW; x += 80) {
            k.cut(g, x + 12, 40, 56, 70);
            px(g, x + 10, 38, 60, 2, "#8a90a0"); px(g, x + 10, 110, 60, 2, "#3a4050");
            px(g, x + 38, 40, 2, 70, "#5a6070");
          }
          for (let x = 0; x < LW; x += 16) { px(g, x, 0, 1, VH, "#4a5060"); px(g, x + 4, 124, 2, 2, "#8a90a0"); }
          px(g, 0, 130, LW, 4, "#f2c23b");
          for (let x = 0; x < LW; x += 8) px(g, x, 130, 4, 4, "#2a2a2a");
        });
        const near = k.layer((g) => {
          px(g, 0, 0, LW, 10, "#3a4050");
          k.along(k.flat(10), [40, 80], (x) => { px(g, x, 10, 2, 40, "#3a4050"); px(g, x - 4, 50, 10, 4, "#3a4050"); px(g, x - 2, 54, 6, 2, "#70f0f0"); });
        });
        return [[far, 0.05], [mid, 0.3], [near, 0.5]];
      },
      tile: ["metal", P("#8a90a0", "#c0c8d8", "#5a6070", "#3a4050", "#9aa0b0")],
      deco: ["crate", "pipe", "terminal"],
      portal: ["#ffffff", "#3a7ad0"],
    },
    {
      name: "WWII Trenches",
      weather: "ash",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#5a5a50", "#6a6a5a", "#7a7a68", "#8a8a74"]);
          for (let i = 0; i < 4; i++) k.smoke(g, k.RI(20, LW - 40), 120, "#4a4a44", 7);
          const h = k.ridge(132, [3, 2]);
          k.fill(g, h, "#4a4a3a");
          k.trees(g, h, "dead", "#2a2a24", "#2a2a24", [30, 70], [16, 30]);
        });
        const mid = k.layer((g) => {
          const h = k.ridge(152, [5, 3]);
          k.fill(g, h, "#3a3a2e");
          k.along(h, [8, 16], (x, y) => { px(g, x, y - 10, 1, 10, "#2a2620"); });
          h.forEach((y, x) => { if (x % 4 < 2) px(g, x, y - 8 + (x % 8 < 4 ? 0 : 1), 1, 1, "#2a2620"); });
        });
        const near = k.layer((g) => {
          k.along(k.flat(180), [30, 70], (x, y) => { for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) k.ellipse(g, x + j * 9 + i * 4, y - 4 - i * 5, 5, 3, "#8a7a5a"); });
        });
        return [[far, 0.08], [mid, 0.3], [near, 0.55]];
      },
      tile: ["mud", P("#5a4a30", "#6a5a3a", "#4a3a26", "#33281a", "#5a4a32")],
      deco: ["sandbag", "wire", "post"],
      portal: ["#f2d27a", "#8a8a74"],
    },
    {
      name: "Harbor",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#6aa8d8", "#88bce0", "#a8d0e8", "#c8e0ee"]);
          k.clouds(g, 14, 50, "#f4f8fa", 5, 1.3);
          k.water(g, 130, "#3a7aa8", "#8ac0e0", 40);
          k.along(k.flat(130), [60, 120], (x) => k.ship(g, x, 131, "#4a3a2a", "#f4f0e0", "#3a2a1a"));
        });
        const mid = k.layer((g) => {
          k.water(g, 156, "#2a6a98", "#7ab0d8", 50);
          k.along(k.flat(156), [80, 140], (x) => k.crane(g, x, 156, "#d8603a"));
          k.along(k.flat(156), [50, 90], (x) => { for (let i = 0; i < 3; i++) px(g, x + i * 10, 146, 9, 10, k.pick(["#3a7fd5", "#e5604f", "#5ad17a", "#f2c23b"])); });
        });
        const near = k.layer((g) => {
          k.along(k.flat(180), [40, 80], (x, y) => { px(g, x, y - 10, 5, 10, "#4a3a2a"); px(g, x - 1, y - 11, 7, 2, "#6a5a4a"); });
        });
        return [[far, 0.08], [mid, 0.28], [near, 0.55]];
      },
      tile: ["wood", P("#9a7a50", "#b89868", "#7a5a38", "#4a3420", "#9a7a50")],
      deco: ["barrel", "crate", "anchor"],
      portal: ["#70f0f0", "#3a7aa8"],
    },
    {
      name: "Cyber World",
      weather: "bits",
      layers(k) {
        const far = k.layer((g) => {
          px(g, 0, 0, LW, VH, "#020812");
          k.code(g, "#0a4a2a", "#3af07a", 60);
        });
        const mid = k.layer((g) => {
          k.grid(g, 110, "#1a6a8a");
          for (let i = 0; i < 10; i++) {
            const x = k.RI(0, LW - 30), y = k.RI(20, 100), w = k.RI(10, 30);
            px(g, x, y, w, 1, "#3af0f0"); px(g, x, y + w / 2, w, 1, "#3af0f0"); px(g, x, y, 1, w / 2, "#3af0f0"); px(g, x + w, y, 1, w / 2 + 1, "#3af0f0");
          }
        });
        const near = k.layer((g) => {
          k.code(g, "#1a8a4a", "#a0ffa0", 30);
        });
        return [[far, 0.08], [mid, 0.25], [near, 0.5]];
      },
      tile: ["grid", P("#3af0f0", "#a0ffff", "#04121e", "#0a2a3a", "#1a6a8a")],
      deco: ["chip", "bit", "terminal"],
      portal: ["#3af0f0", "#3af07a"],
    },
    {
      name: "Rainforest",
      weather: "leaves",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#a8d8a0", "#90c890", "#78b880", "#60a070"]);
          k.dither(g, 0, 60, LW, 40, "#c8e8c0");
          const h = k.ridge(110, [10, 5]);
          k.fill(g, h, "#3a7a4a");
          k.trees(g, h, "jungle", "#2f6a3a", "#3a2a1a", [12, 22], [30, 44]);
        });
        const mid = k.layer((g) => {
          const h = k.ridge(140, [6, 3]);
          k.fill(g, h, "#1f5a2f");
          k.trees(g, h, "jungle", "#1f5a2a", "#3a2a1a", [20, 36], [44, 64], "#3a8a3a");
        });
        const near = k.layer((g) => {
          for (let x = k.RI(0, 10); x < LW; x += k.RI(10, 30)) { const len = k.RI(30, 110); for (let y = 0; y < len; y++) px(g, x + Math.round(Math.sin(y / 9) * 2), y, 1, 1, "#2a6a2a"); k.ellipse(g, x, len, 3, 2, "#3a8a3a"); }
          px(g, 0, 0, LW, 10, "#1a4a20");
          k.along(k.flat(182), [20, 40], (x, y) => { for (let i = -3; i <= 3; i++) k.line(g, x, y, x + i * 4, y - 10 - Math.abs(i) * -1, "#2a7a2a"); });
        });
        return [[far, 0.08], [mid, 0.28], [near, 0.5]];
      },
      tile: ["grass", P("#3a8a3a", "#5ab05a", "#4a3020", "#2e1e12", "#5a4030")],
      deco: ["flower", "mushroom", "weed"],
      portal: ["#f070d0", "#3a8a3a"],
    },
    {
      name: "Great Wall",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#a8c0d8", "#c0d0e0", "#d8dce4", "#e8e0d8"]);
          const m = k.peaks(140, 70, 6);
          k.fill(g, m, "#8a9aa0");
          k.wallLine(g, m.map((y) => y + 2), "#a09a8a", "#6a6458", 80);
        });
        const mid = k.layer((g) => {
          const h = k.ridge(146, [16, 6]);
          k.fill(g, h, "#5a7a4a");
          k.wallLine(g, h.map((y) => y + 1), "#b0a890", "#6a6450", 110);
        });
        const near = k.layer((g) => {
          const h = k.ridge(172, [5, 3]);
          k.fill(g, h, "#3a5a30");
          k.trees(g, h, "pine", "#2a4a2a", "#2a2a1a", [40, 90], [24, 36]);
        });
        return [[far, 0.06], [mid, 0.25], [near, 0.5]];
      },
      tile: ["stone", P("#b0a890", "#c8c0a8", "#9a9280", "#6a6450", "#b0a890")],
      deco: ["lantern", "rock", "tuft"],
      portal: ["#f2c23b", "#d83a2a"],
    },
    {
      name: "Stormy Suburbs",
      weather: "storm",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#2a2e3a", "#3a3e4a", "#4a4e58", "#5a5e66"]);
          k.clouds(g, 10, 60, "#22252e", 9, 1.8);
          k.line(g, 300, 40, 292, 70, "#f0f0ff"); k.line(g, 292, 70, 300, 74, "#f0f0ff"); k.line(g, 300, 74, 290, 110, "#f0f0ff");
        });
        const mid = k.layer((g) => {
          k.houses(g, 156, { wall: "#6a7080", roof: "#3a3e4a", win: "#f2d27a", door: "#2a2a30", w: [24, 34], h: [16, 22] }, [10, 20]);
          px(g, 0, 156, LW, 40, "#3a4a3a");
        });
        const near = k.layer((g) => {
          k.trees(g, k.flat(182), "round", "#2a3a2a", "#2a2220", [60, 120], [30, 42]);
          k.fence(g, 182, "#d8d8d0", 6, false);
        });
        return [[far, 0.06], [mid, 0.28], [near, 0.55]];
      },
      tile: ["grass", P("#4a6a40", "#5a7a4a", "#5a5a5a", "#3a3a3a", "#7a7a7a")],
      deco: ["puddle", "trash", "hydrant"],
      portal: ["#f0f0ff", "#5a7ab0"],
    },
    {
      name: "Highway",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#f0a070", "#f4b888", "#f6d0a8", "#f8e4c8"]);
          k.disc(g, 120, 90, 20, "#fff0c0");
          k.skyline(g, 140, { w: [12, 30], h: [20, 60], body: "#a07a7a", antenna: 0.4 });
        });
        const mid = k.layer((g) => {
          // elevated road with cars
          px(g, 0, 128, LW, 8, "#6a6a70");
          px(g, 0, 128, LW, 1, "#9a9aa0");
          for (let x = 0; x < LW; x += 60) px(g, x + 26, 136, 8, 60, "#5a5a60");
          k.along(k.flat(128), [24, 50], (x) => k.car(g, x, 128, k.pick(["#e5604f", "#3a7fd5", "#f2c23b", "#f2f2f2", "#2a2a2a"])));
        });
        const near = k.layer((g) => {
          px(g, 0, 160, LW, 32, "#3a3a40");
          for (let x = 0; x < LW; x += 24) px(g, x, 172, 12, 2, "#f2f2f2");
          k.along(k.flat(170), [40, 80], (x) => k.car(g, x, 170, k.pick(["#e5604f", "#3a7fd5", "#5ad17a", "#9a5fd1"])));
          k.along(k.flat(160), [90, 140], (x, y) => { px(g, x, y - 40, 2, 40, "#5a5a60"); px(g, x, y - 40, 14, 2, "#5a5a60"); px(g, x + 12, y - 39, 4, 2, "#fff0c0"); });
        });
        return [[far, 0.06], [mid, 0.3], [near, 0.6]];
      },
      tile: ["asphalt", P("#9a9aa0", "#c0c0c8", "#3a3a40", "#2a2a30", "#4a4a50")],
      deco: ["cone", "sign", "barrier"],
      portal: ["#f2c23b", "#3a7fd5"],
    },
    {
      name: "Concert Hall",
      layers(k) {
        const far = k.layer((g) => {
          px(g, 0, 0, LW, VH, "#1a0a10");
          for (let x = 0; x < LW; x += 6) px(g, x, 0, 3, VH, "#5a1020");
          for (let x = 0; x < LW; x += 6) px(g, x + 3, 0, 1, VH, "#7a1a2a");
          px(g, 0, 0, LW, 14, "#c8a040");
          for (let x = 0; x < LW; x += 10) k.ellipse(g, x + 5, 14, 5, 3, "#c8a040");
        });
        const mid = k.layer((g) => {
          // spotlight beams: sparse dithered cones, slanted from the rig
          for (let i = 0; i < 5; i++) {
            const x0 = k.RI(20, LW - 40), slant = k.R(-0.5, 0.5);
            px(g, x0 - 3, 14, 7, 4, "#2a2a2a");
            for (let y = 18; y < 150; y++) {
              const cx = Math.round(x0 + (y - 18) * slant), w = 2 + Math.round((y - 18) / 5);
              for (let dx = -w; dx <= w; dx++) if ((cx + dx + y * 3) % 5 === 0) px(g, cx + dx, y, 1, 1, "#f8e8a0");
            }
          }
          px(g, 0, 150, LW, 10, "#6a3a1a");
        });
        const near = k.layer((g) => {
          for (let row = 0; row < 3; row++) for (let x = (row % 2) * 6; x < LW; x += 12) {
            k.disc(g, x + 5, 164 + row * 9, 5, "#2a0a10");
            px(g, x + 1, 164 + row * 9, 9, 6, "#8a1a2a");
          }
        });
        return [[far, 0.05], [mid, 0.25], [near, 0.6]];
      },
      tile: ["wood", P("#a06a3a", "#c88a50", "#7a4a26", "#4a2a14", "#a06a3a")],
      deco: ["speaker", "mic", "note"],
      portal: ["#f8e8a0", "#c8a040"],
    },
    {
      name: "Mall Parking",
      layers(k) {
        const far = k.layer((g) => {
          px(g, 0, 0, LW, VH, "#5a5e66");
          px(g, 0, 0, LW, 20, "#4a4e56");
          for (let x = 0; x < LW; x += 48) { px(g, x + 8, 20, 30, 3, "#f0f0e8"); k.dither(g, x + 4, 23, 38, 6, "#8a8e96"); }
          for (let x = 30; x < LW; x += 160) { px(g, x, 50, 40, 14, "#2a7a4a"); px(g, x + 6, 54, 6, 6, "#f4f4f4"); px(g, x + 16, 56, 20, 2, "#f4f4f4"); }
        });
        const mid = k.layer((g) => {
          k.pillars(g, [70, 90], 12, "#7a7e86", "#5a5e66", 20);
          for (let x = 0; x < LW; x += 70) { px(g, x, 110, 12, 10, "#f2c23b"); for (let i = 0; i < 12; i += 4) px(g, x + i, 110, 2, 10, "#2a2a2a"); }
        });
        const near = k.layer((g) => {
          k.along(k.flat(180), [30, 50], (x) => k.car(g, x, 180, k.pick(["#e5604f", "#3a7fd5", "#f2f2f2", "#2a2a2a", "#9aa0a8"])));
        });
        return [[far, 0.1], [mid, 0.3], [near, 0.55]];
      },
      tile: ["asphalt", P("#8a8e96", "#f2c23b", "#4a4e56", "#3a3e46", "#5a5e66")],
      deco: ["cone", "cart", "barrier"],
      portal: ["#3a7fd5", "#f2f2f2"],
    },
    {
      name: "Inside the Volcano",
      weather: "embers",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#1a0806", "#3a0e08", "#6a1a0a", "#a03a10"]);
          for (let i = 0; i < 30; i++) k.ellipse(g, k.RI(0, LW), k.RI(0, 120), k.RI(10, 30), k.RI(4, 10), "#2a0c08");
        });
        const mid = k.layer((g) => {
          k.drips(g, "#3a1a10", 50, true, [10, 24]);
          const h = k.ridge(150, [8, 4]);
          k.fill(g, h, "#2a1410");
          for (let i = 0; i < 6; i++) { const x = k.RI(0, LW - 10); for (let y = h[x]; y < VH; y++) px(g, x + Math.round(Math.sin(y / 5)), y, 2, 1, "#f06a1a"); }
        });
        const near = k.layer((g) => {
          px(g, 0, 176, LW, 16, "#f05a10");
          for (let x = 0; x < LW; x += 3) px(g, x, 176 + (x % 6 ? 0 : 1), 3, 1, "#ffb03a");
          k.dither(g, 0, 170, LW, 6, "#f05a10");
        });
        return [[far, 0.08], [mid, 0.3], [near, 0.6]];
      },
      tile: ["rock", P("#4a2a20", "#6a3a28", "#2a1a14", "#1a0e0a", "#4a2a20", "#f06a1a")],
      deco: ["rock", "vent", "crystal"],
      portal: ["#ffb03a", "#f05a10"],
    },
    {
      name: "Landslide",
      weather: "dust",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#a89a80", "#b8aa90", "#c8baa0", "#d8cab0"]);
          const m = k.peaks(140, 80, 5);
          k.fill(g, m, "#8a7a60");
          m.forEach((y, x) => { if (x % 5 === 0) k.line(g, x, y, x + 10, y + 30, "#7a6a50"); });
        });
        const mid = k.layer((g) => {
          // tilted slabs and debris
          for (let i = 0; i < 12; i++) {
            const x = k.RI(0, LW - 40), y = k.RI(110, 150), w = k.RI(14, 30);
            for (let j = 0; j < 10; j++) px(g, x + j, y + j, w, 1, k.pick(["#6a5a44", "#7a6a50"]));
          }
          k.boulders(g, k.ridge(150, [6, 3]), "#5a4a38", "#7a6a54", [8, 20]);
        });
        const near = k.layer((g) => {
          k.boulders(g, k.flat(186), "#4a3a2a", "#6a5a44", [24, 60]);
          for (let i = 0; i < 8; i++) { const x = k.RI(10, LW - 30); k.line(g, x, 186, x + 14, 160, "#3a2a1a", 2); } // toppled trunks
        });
        return [[far, 0.08], [mid, 0.3], [near, 0.55]];
      },
      tile: ["rock", P("#8a7a5a", "#a89a78", "#6a5a42", "#4a3e2c", "#8a7a5a")],
      deco: ["rock", "warn", "tuft"],
      portal: ["#f2d27a", "#8a7a5a"],
    },
    {
      name: "Military Base",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#8aa0b0", "#a0b4c0", "#b8c8d0", "#d0d8dc"]);
          const h = k.ridge(128, [6, 3]);
          k.fill(g, h, "#6a7a5a");
          k.along(h, [100, 180], (x, y) => { k.ellipse(g, x, y, 30, 20, "#7a8070"); k.cut(g, x - 30, y + 1, 61, 20); px(g, x - 30, y, 61, 20, "#7a8070"); px(g, x - 10, y - 10, 20, 10, "#3a3e36"); });
        });
        const mid = k.layer((g) => {
          px(g, 0, 156, LW, 40, "#5a6a4a");
          k.along(k.flat(156), [50, 90], (x, y) => k.tent(g, x, y, "#5a6a3a", "#2a3220"));
          k.along(k.flat(156), [160, 240], (x, y) => k.tower(g, x, y, "#4a4a40"));
        });
        const near = k.layer((g) => { k.fence(g, 182, "#8a8e86", 10, true); });
        return [[far, 0.08], [mid, 0.3], [near, 0.6]];
      },
      tile: ["metal", P("#6a7a4a", "#8a9a5a", "#4a5032", "#33381e", "#6a704a")],
      deco: ["sandbag", "barrel", "crate"],
      portal: ["#f2c23b", "#6a7a4a"],
    },
    {
      name: "Ancient Rome",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#6ab0e0", "#88c0e6", "#a8d0ea", "#e8dcc0"]);
          k.arches(g, 140, 96, 20, "#c8b090");
          px(g, 0, 140, LW, 60, "#b8a080");
        });
        const mid = k.layer((g) => {
          px(g, 0, 156, LW, 40, "#c8b898");
          for (let x = 10; x < LW - 80;) x += k.temple(g, x, 156, k.RI(3, 5), "#f0e8d8", "#c8bca8") + k.RI(30, 70);
        });
        const near = k.layer((g) => {
          k.along(k.flat(180), [60, 120], (x, y) => { k.column(g, x, y, k.RI(16, 30), "#e8e0d0", "#c0b8a8"); k.cut(g, x - 1, y - 34, 9, k.RI(4, 10)); });
          k.trees(g, k.flat(180), "cypress", "#2f4a26", "#3a2a1e", [70, 130], [30, 40]);
        });
        return [[far, 0.08], [mid, 0.3], [near, 0.55]];
      },
      tile: ["stone", P("#e0d4c0", "#f4ece0", "#c8b8a0", "#9a8a70", "#e0d4c0")],
      deco: ["urn", "rock", "flower"],
      portal: ["#f2c23b", "#b0302a"],
    },
    {
      name: "Wild West",
      weather: "dust",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#f0905a", "#f4a870", "#f6c490", "#f8dcb0"]);
          k.disc(g, 360, 100, 22, "#fff0c0");
          for (let x = 0; x < LW - 60;) {
            const w = k.RI(30, 60), h = k.RI(30, 60);
            px(g, x + 6, 130 - h, w - 12, h + 80, "#a8583a"); px(g, x, 136 - h, w, h + 80, "#a8583a");
            x += w + k.RI(40, 90);
          }
        });
        const mid = k.layer((g) => {
          px(g, 0, 150, LW, 40, "#c08a50");
          k.along(k.flat(152), [60, 110], (x, y) => {
            const w = k.RI(30, 44), h = k.RI(24, 34);
            px(g, x, y - h, w, h, "#8a5a32");
            px(g, x, y - h - 8, w, 8, "#8a5a32");
            px(g, x + 3, y - h - 6, w - 6, 4, "#d8b070");
            px(g, x - 2, y - 14, w + 4, 2, "#5a3a20");
            px(g, x + w / 2 - 4, y - 10, 8, 10, "#3a2010");
          });
        });
        const near = k.layer((g) => {
          k.along(k.flat(182), [50, 120], (x, y) => drawCactus(g, x, y, 2.2));
          k.along(k.flat(184), [80, 160], (x, y) => { k.disc(g, x, y - 4, 4, "#8a6a3a"); k.dither(g, x - 4, y - 8, 8, 8, "#a8885a"); });
        });
        return [[far, 0.08], [mid, 0.3], [near, 0.55]];
      },
      tile: ["sand", P("#d8a868", "#e8c088", "#b07a48", "#8a5a32", "#c89060")],
      deco: ["cactus", "barrel", "bone"],
      portal: ["#f2c23b", "#a8583a"],
    },
    {
      name: "Cyberpunk Megacity",
      weather: "rain",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#0a0418", "#1a0a30", "#2a0a40", "#4a0a4a"]);
          k.skyline(g, 150, { w: [10, 22], h: [80, 150], body: "#1a0e2a", lit: "#f03a8a", unlit: "#22143a", litChance: 0.15, gap: [0, 2] });
          k.dither(g, 0, 100, LW, 30, "#3a1a4a");
        });
        const mid = k.layer((g) => {
          k.skyline(g, 166, { w: [20, 40], h: [50, 120], body: "#120a20", lit: "#3af0f0", unlit: "#1a1030", neon: ["#f03a8a", "#3af0f0", "#f0f03a", "#a03af0"], win: [3, 1, 4], litChance: 0.4 });
          for (let i = 0; i < 4; i++) { const y = k.RI(40, 100); px(g, 0, y, LW, 1, "#3a2a5a"); }
        });
        const near = k.layer((g) => {
          k.skyline(g, 184, { w: [30, 60], h: [30, 70], body: "#08040e", lit: "#f03a8a", unlit: "#100818", neon: ["#3af0f0", "#f03a8a"], win: [4, 2, 8], gap: [10, 40] });
        });
        return [[far, 0.06], [mid, 0.25], [near, 0.5]];
      },
      tile: ["grid", P("#f03a8a", "#ffa0d0", "#0e0818", "#2a0a2a", "#5a1a5a")],
      deco: ["neonSign", "trash", "terminal"],
      portal: ["#f03a8a", "#3af0f0"],
    },
    {
      name: "Wasteland",
      weather: "ash",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#5a3a2a", "#7a4a2a", "#9a6a3a", "#b08a4a"]);
          k.disc(g, 140, 70, 18, "#d8a860");
          k.skyline(g, 140, { w: [16, 34], h: [40, 100], body: "#4a3a30", roof: "broken", holes: true, gap: [2, 16] });
        });
        const mid = k.layer((g) => {
          const h = k.ridge(154, [6, 3]);
          k.fill(g, h, "#5a4a36");
          for (let i = 0; i < 3; i++) k.smoke(g, k.RI(20, LW - 40), 150, "#3a2e26", 8);
          k.trees(g, h, "dead", "#2a221a", "#2a221a", [40, 90], [18, 30]);
        });
        const near = k.layer((g) => {
          k.along(k.flat(182), [70, 140], (x, y) => { k.car(g, x, y, "#7a4a2a", "#3a2a20"); px(g, x + 4, y - 9, 11, 2, "#5a3a20"); });
          k.boulders(g, k.flat(188), "#4a3a2a", "#6a5040", [30, 70]);
        });
        return [[far, 0.06], [mid, 0.28], [near, 0.55]];
      },
      tile: ["rock", P("#7a6040", "#9a7a50", "#5a4632", "#3e3020", "#7a6040")],
      deco: ["barrel", "tire", "warn"],
      portal: ["#c0f07e", "#7a6040"],
    },
    {
      name: "Autumn Woods",
      weather: "autumn",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#e8a870", "#f0c090", "#f4d4a8", "#f6e2c0"]);
          const h = k.ridge(124, [10, 4]);
          k.fill(g, h, "#b0603a");
          k.trees(g, h, "round", "#c8783a", "#5a3a20", [8, 16], [16, 24], "#e0a040");
        });
        const mid = k.layer((g) => {
          const h = k.ridge(146, [6, 3]);
          k.fill(g, h, "#8a4a2a");
          k.trees(g, h, "round", "#d8602a", "#4a2a18", [16, 30], [28, 38], "#f0a03a");
        });
        const near = k.layer((g) => {
          const h = k.ridge(170, [4, 2]);
          k.fill(g, h, "#6a3a20");
          k.trees(g, h, "round", "#b83a1a", "#3a2010", [40, 80], [40, 50], "#e8702a");
        });
        return [[far, 0.08], [mid, 0.28], [near, 0.5]];
      },
      tile: ["grass", P("#c8782a", "#e8a040", "#6a4228", "#4a2c18", "#8a5a34")],
      deco: ["pumpkin", "leafpile", "mushroom"],
      portal: ["#f0a03a", "#b83a1a"],
    },
    {
      name: "Cherry Blossoms",
      weather: "petals",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#a8c8f0", "#c0d4f0", "#e0d8ee", "#f6e0ea"]);
          const m = k.peaks(130, 90, 2);
          k.fill(g, m, "#8a9ac8");
          k.caps(g, m, 70, "#ffffff");
        });
        const mid = k.layer((g) => {
          const h = k.ridge(148, [5, 3]);
          k.fill(g, h, "#7aa070");
          k.building(g, 200, 150, 24, 30, { body: "#e8dcc8", roof: "pagoda", roofColor: "#3a3a4a" });
          k.trees(g, h, "round", "#f0a8c8", "#5a3a3a", [16, 34], [22, 32], "#f8d0e0");
        });
        const near = k.layer((g) => {
          k.along(k.flat(180), [90, 160], (x, y) => {
            px(g, x, y - 34, 3, 34, "#d8302a"); px(g, x + 24, y - 34, 3, 34, "#d8302a");
            px(g, x - 5, y - 38, 37, 3, "#d8302a"); px(g, x - 3, y - 32, 33, 2, "#d8302a"); px(g, x - 6, y - 40, 39, 2, "#2a2a2a");
          });
          k.trees(g, k.flat(182), "round", "#f4b8d0", "#4a2a2a", [60, 120], [36, 46], "#fde0ec");
        });
        return [[far, 0.06], [mid, 0.28], [near, 0.55]];
      },
      tile: ["grass", P("#7ab070", "#a0d090", "#6a5040", "#4a3628", "#8a6a54")],
      deco: ["lantern", "flower", "rock"],
      portal: ["#f4b8d0", "#d8302a"],
    },
    {
      name: "Windmill Fields",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#78b0e8", "#98c4ee", "#b8d6f2", "#d8e8f6"]);
          k.clouds(g, 14, 60, "#ffffff", 8, 1.4);
          px(g, 0, 132, LW, 60, "#7aa860");
        });
        const mid = k.layer((g) => {
          // tulip stripes
          const cols = ["#e5604f", "#f2c23b", "#f2a0c0", "#9a5fd1", "#f4f4f4"];
          for (let y = 140; y < VH; y += 4) for (let x = 0; x < LW; x += 40) px(g, x, y, 34, 2, cols[((x / 40) + Math.floor(y / 12)) % cols.length]);
          for (let y = 142; y < VH; y += 4) px(g, 0, y, LW, 2, "#5a8a40");
          k.along(k.flat(142), [90, 150], (x, y) => {
            px(g, x - 5, y - 30, 10, 30, "#a8604a"); k.tri(g, x, y - 30, 7, 8, "#5a3a2a");
            for (const [dx, dy] of [[-16, -16], [16, 16], [-16, 16], [16, -16]]) k.line(g, x, y - 32, x + dx, y - 32 + dy, "#f0e8d8", 2);
          });
        });
        const near = k.layer((g) => {
          k.water(g, 182, "#4a7ab0", "#8ab0e0", 30);
        });
        return [[far, 0.06], [mid, 0.3], [near, 0.55]];
      },
      tile: ["grass", P("#6aa850", "#90c870", "#6a4a30", "#4a3220", "#8a6a48")],
      deco: ["tulip", "post", "tuft"],
      portal: ["#f2c23b", "#e5604f"],
    },
    {
      name: "Northern Lights",
      weather: "snow",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#060a1e", "#0a1430", "#102040", "#1a2a50"]);
          k.stars(g, 90, 110);
          for (const [c, y0] of [["#3af07a", 30], ["#3af0c0", 44], ["#a070f0", 56]]) {
            for (let x = 0; x < LW; x++) {
              const y = y0 + Math.round(Math.sin(x / 40 + y0) * 10 + Math.sin(x / 13) * 3);
              for (let j = 0; j < 18; j++) if ((x + j) % 2 === 0 && k.rand() < 0.7 - j / 30) px(g, x, y + j, 1, 1, c);
            }
          }
        });
        const mid = k.layer((g) => {
          const h = k.ridge(146, [6, 3]);
          k.fill(g, h, "#c8d4e8");
          k.trees(g, h, "spruce", "#1a2a3a", "#1a1a1a", [12, 26], [16, 26], "#c8d4e8");
        });
        const near = k.layer((g) => {
          const h = k.ridge(172, [3, 2]);
          k.fill(g, h, "#e8eef8");
          k.along(h, [100, 180], (x, y) => { k.ellipse(g, x, y, 14, 12, "#f4f8fc"); k.cut(g, x - 15, y + 1, 31, 12); px(g, x - 14, y, 29, 1, "#c8d4e8"); for (let i = -12; i < 14; i += 5) px(g, x + i, y - 10, 1, 10, "#c8d4e8"); k.ellipse(g, x + 8, y - 3, 3, 3, "#1a2a3a"); });
        });
        return [[far, 0.05], [mid, 0.28], [near, 0.5]];
      },
      tile: ["snow", P("#f4f8fc", "#ffffff", "#4a5a70", "#34405a", "#6a7a90")],
      deco: ["snowman", "rock", "icicle"],
      portal: ["#3af07a", "#a070f0"],
    },
    {
      name: "Moon Base",
      layers(k) {
        const far = k.layer((g) => {
          px(g, 0, 0, LW, VH, "#04040c");
          k.stars(g, 140, VH, ["#ffffff", "#c0c8ff"]);
          k.planet(g, 120, 50, 22, "#3a7ad0", "#2a5aa0");
          k.ellipse(g, 112, 44, 8, 4, "#5ad17a"); k.ellipse(g, 128, 58, 6, 3, "#5ad17a");
        });
        const mid = k.layer((g) => {
          const h = k.ridge(148, [8, 4]);
          k.fill(g, h, "#8a8a90");
          k.along(h, [30, 60], (x, y) => { k.ellipse(g, x, y + 6, k.RI(6, 12), 2, "#6a6a70"); });
          k.along(h, [120, 200], (x, y) => { k.ellipse(g, x, y, 16, 10, "#c8ccd4"); k.cut(g, x - 17, y + 1, 35, 12); px(g, x - 2, y - 18, 1, 8, "#c8ccd4"); px(g, x - 4, y - 19, 5, 1, "#e5604f"); });
        });
        const near = k.layer((g) => {
          k.along(k.flat(182), [120, 220], (x, y) => {
            px(g, x, y - 16, 16, 10, "#d8d8e0"); px(g, x + 3, y - 20, 10, 4, "#f2c23b");
            k.line(g, x, y - 6, x - 6, y, "#a0a0a8"); k.line(g, x + 15, y - 6, x + 21, y, "#a0a0a8");
          });
          k.along(k.flat(184), [24, 60], (x, y) => k.ellipse(g, x, y, k.RI(4, 9), 2, "#5a5a60"));
        });
        return [[far, 0.04], [mid, 0.25], [near, 0.5]];
      },
      tile: ["rock", P("#a8a8b0", "#c8c8d0", "#7a7a84", "#5a5a64", "#9a9aa4")],
      deco: ["flag", "rock", "crate"],
      portal: ["#5ad17a", "#3a7ad0"],
    },
    {
      name: "Haunted Graveyard",
      weather: "fireflies",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#14102a", "#20183a", "#2e2448", "#3e3056"]);
          k.stars(g, 40, 80);
          k.disc(g, 380, 44, 18, "#f0ecd0"); k.disc(g, 386, 40, 4, "#d8d4b8");
          k.building(g, 120, 140, 40, 40, { body: "#1a1428", roof: "gable", roofColor: "#120e1e", lit: "#f2d27a", unlit: "#1a1428", litChance: 0.15, win: [3, 4, 9] });
          k.building(g, 150, 140, 10, 66, { body: "#1a1428", roof: "spire", roofColor: "#120e1e" });
        });
        const mid = k.layer((g) => {
          const h = k.ridge(150, [4, 2]);
          k.fill(g, h, "#1e2a24");
          k.trees(g, h, "dead", "#140f1a", "#140f1a", [30, 70], [26, 44]);
          k.dither(g, 0, 140, LW, 12, "#5a5a70");
        });
        const near = k.layer((g) => {
          k.along(k.flat(182), [14, 34], (x, y) => {
            if (k.rand() < 0.5) { px(g, x, y - 12, 8, 12, "#6a6a78"); k.ellipse(g, x + 4, y - 12, 4, 3, "#6a6a78"); px(g, x + 2, y - 9, 4, 1, "#4a4a58"); }
            else { px(g, x + 3, y - 14, 2, 14, "#5a5a68"); px(g, x, y - 11, 8, 2, "#5a5a68"); }
          });
          k.fence(g, 186, "#14101a", 5, false);
        });
        return [[far, 0.06], [mid, 0.28], [near, 0.55]];
      },
      tile: ["grass", P("#3a4a3a", "#4a5a48", "#2e2620", "#1e1814", "#3e342c")],
      deco: ["tombstone", "pumpkin", "bone"],
      portal: ["#a070f0", "#3af07a"],
    },
    {
      name: "Candy Land",
      weather: "sprinkles",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#f8c0e0", "#fad0e8", "#fce0ee", "#fef0f6"]);
          k.clouds(g, 14, 60, "#ffffff", 8, 1.4);
          const h = k.ridge(128, [10, 5]);
          k.fill(g, h, "#c08ae0");
          k.edge(g, h, "#f4f4f4", 4);
        });
        const mid = k.layer((g) => {
          const h = k.ridge(150, [6, 3]);
          k.fill(g, h, "#8ad8b0");
          k.along(h, [20, 40], (x, y) => { const c = k.pick(["#e5604f", "#f2c23b", "#3a7fd5", "#9a5fd1"]); k.ellipse(g, x, y - 3, 6, 5, c); px(g, x - 2, y - 6, 2, 2, "#ffffff"); });
        });
        const near = k.layer((g) => {
          k.along(k.flat(182), [50, 100], (x, y) => {
            px(g, x, y - 30, 2, 30, "#f4f4f4");
            k.disc(g, x + 1, y - 38, 10, "#f2a0c0");
            for (let a = 0; a < 20; a++) { const r = a / 2; px(g, x + 1 + Math.cos(a) * r, y - 38 + Math.sin(a) * r, 2, 2, "#e5604f"); }
          });
          k.along(k.flat(182), [70, 130], (x, y) => { for (let i = 0; i < 26; i++) px(g, x, y - i, 3, 1, Math.floor(i / 3) % 2 ? "#e5604f" : "#ffffff"); for (let i = 0; i < 6; i++) px(g, x + i, y - 26 - Math.round(Math.sin(i / 2) * 4), 3, 1, i % 2 ? "#e5604f" : "#ffffff"); });
        });
        return [[far, 0.06], [mid, 0.28], [near, 0.55]];
      },
      tile: ["tile", P("#f2a0c0", "#ffd0e4", "#f8e0ec", "#e080a8", "#fdf0f6")],
      deco: ["lollipop", "candycane", "flower"],
      portal: ["#f2a0c0", "#8ad8b0"],
    },
    {
      name: "Lighthouse Coast",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#5a8ac0", "#7aa0cc", "#a0b8d8", "#c8d4e0"]);
          k.clouds(g, 10, 50, "#e8eef4", 6, 1.4);
          k.water(g, 128, "#2a5a8a", "#6a9ac8", 50);
        });
        const mid = k.layer((g) => {
          // cliffs with a lighthouse
          px(g, 0, 140, 200, 60, "#6a6a60"); k.tri(g, 200, 192, 30, 52, "#6a6a60");
          px(g, 0, 138, 200, 3, "#5a8a40");
          const x = 80;
          for (let i = 0; i < 50; i++) { const w = 7 - Math.floor(i / 12); px(g, x - w, 138 - i, w * 2, 1, Math.floor(i / 8) % 2 ? "#d8302a" : "#f4f4f4"); }
          px(g, x - 5, 82, 10, 6, "#f2e84b"); px(g, x - 6, 80, 12, 2, "#2a2a2a"); k.tri(g, x, 80, 6, 6, "#d8302a");
          k.dither(g, x + 6, 80, 60, 10, "#fff6b0");
          k.water(g, 158, "#1a4a7a", "#a0c8e8", 40);
        });
        const near = k.layer((g) => {
          k.boulders(g, k.flat(186), "#4a4a44", "#6a6a60", [30, 70]);
          for (let x = 0; x < LW; x += 6) px(g, x, 184 + (x % 12 ? 0 : 1), 4, 1, "#ffffff");
        });
        return [[far, 0.06], [mid, 0.25], [near, 0.55]];
      },
      tile: ["stone", P("#8a8a80", "#a8a89c", "#6a6a60", "#4a4a44", "#8a8a80")],
      deco: ["anchor", "shell", "tuft"],
      portal: ["#fff6b0", "#d8302a"],
    },
    {
      name: "Steel Factory",
      weather: "embers",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#4a3a3a", "#6a4a3a", "#8a5a3a", "#a86a3a"]);
          k.along(k.flat(150), [50, 90], (x, y) => { px(g, x, y - 90, 10, 90, "#3a3030"); px(g, x - 1, y - 92, 12, 3, "#2a2222"); for (let i = 0; i < 90; i += 10) px(g, x, y - 90 + i, 10, 1, "#d8402f"); k.smoke(g, x + 5, y - 100, "#5a4a44", 5); });
          k.skyline(g, 160, { w: [30, 60], h: [30, 60], body: "#2a2424", roof: "flat", antenna: 0, lit: "#f2a03a", unlit: "#2a2424", litChance: 0.4, win: [4, 2, 8] });
        });
        const mid = k.layer((g) => {
          for (let y = 60; y < 160; y += 30) { px(g, 0, y, LW, 4, "#5a5a60"); px(g, 0, y, LW, 1, "#8a8a90"); }
          k.along(k.flat(160), [40, 70], (x) => { px(g, x, 60, 4, 100, "#4a4a50"); });
          for (let x = 0; x < LW; x += 90) { k.disc(g, x + 40, 120, 16, "#6a6a70"); k.disc(g, x + 40, 120, 6, "#3a3a40"); for (let a = 0; a < 8; a++) px(g, x + 38 + Math.cos(a * 0.8) * 18, 118 + Math.sin(a * 0.8) * 18, 5, 5, "#6a6a70"); }
        });
        const near = k.layer((g) => {
          px(g, 0, 172, LW, 6, "#3a3a40");
          for (let x = 0; x < LW; x += 8) k.disc(g, x + 4, 178, 3, "#2a2a30");
          k.along(k.flat(172), [40, 80], (x) => { px(g, x, 162, 12, 10, "#a87a48"); px(g, x, 162, 12, 1, "#c89a68"); });
        });
        return [[far, 0.06], [mid, 0.28], [near, 0.55]];
      },
      tile: ["metal", P("#7a7a80", "#f2c23b", "#4a4a50", "#2a2a30", "#6a6a70")],
      deco: ["barrel", "pipe", "gearDeco"],
      portal: ["#f2a03a", "#d8402f"],
    },
    {
      name: "Pirate Cove",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#f08a5a", "#f4a070", "#f6c090", "#f8d8b0"]);
          k.disc(g, 300, 112, 24, "#fff0b0");
          k.water(g, 124, "#3a6a98", "#f6c090", 50);
          k.along(k.flat(124), [140, 240], (x) => { k.ship(g, x, 125, "#2a1a10", "#f4f0e0", "#2a1a10"); px(g, x + 10, 96, 6, 4, "#1a1a1a"); });
        });
        const mid = k.layer((g) => {
          k.water(g, 156, "#2a5a88", "#8ab0d8", 50);
          k.along(k.flat(156), [100, 180], (x) => { k.ellipse(g, x, 156, 26, 5, "#e8cc90"); k.tree(g, "palm", x - 6, 154, 24, "#2f7a2f", "#6a4a28"); });
          k.along(k.flat(156), [70, 120], (x) => { k.ellipse(g, x, 150, 14, 12, "#5a5a54"); k.cut(g, x - 15, 157, 31, 6); k.ellipse(g, x, 154, 6, 5, "#1a1a1a"); });
        });
        const near = k.layer((g) => {
          k.along(k.flat(182), [60, 120], (x, y) => { px(g, x, y - 10, 14, 10, "#8a5a2a"); px(g, x, y - 13, 14, 3, "#a87a3a"); px(g, x, y - 7, 14, 1, "#f2c23b"); px(g, x + 6, y - 9, 2, 3, "#f2c23b"); });
        });
        return [[far, 0.06], [mid, 0.28], [near, 0.55]];
      },
      tile: ["wood", P("#8a6a40", "#a88a58", "#6a4a28", "#3a2614", "#8a6a40")],
      deco: ["chest", "barrel", "anchor"],
      portal: ["#f2c23b", "#2a5a88"],
    },
    {
      name: "Jungle Temple",
      weather: "leaves",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#8ac8a0", "#a0d4b0", "#b8e0c0", "#d0ecd0"]);
          k.dither(g, 0, 70, LW, 30, "#e0f0e0");
          // stepped pyramid
          const cx = 240;
          for (let i = 0; i < 7; i++) px(g, cx - 70 + i * 10, 150 - (i + 1) * 12, 140 - i * 20, 12, i % 2 ? "#8a8a6a" : "#7a7a5a");
          px(g, cx - 10, 50, 20, 16, "#6a6a4a"); px(g, cx - 4, 56, 8, 10, "#2a2a1a");
          for (let i = 0; i < 80; i += 3) px(g, cx - 4, 70 + i, 8, 1, "#6a6a4a");
        });
        const mid = k.layer((g) => {
          const h = k.ridge(140, [6, 3]);
          k.fill(g, h, "#2f6a3a");
          k.trees(g, h, "jungle", "#2a6a30", "#3a2a1a", [24, 40], [40, 56], "#3a8a3a");
        });
        const near = k.layer((g) => {
          for (let x = k.RI(0, 10); x < LW; x += k.RI(12, 30)) { const len = k.RI(20, 90); for (let y = 0; y < len; y++) px(g, x + Math.round(Math.sin(y / 9) * 2), y, 1, 1, "#2a6a2a"); }
          k.along(k.flat(182), [80, 160], (x, y) => { px(g, x, y - 20, 14, 20, "#7a7a5a"); px(g, x + 3, y - 16, 3, 3, "#2a2a1a"); px(g, x + 8, y - 16, 3, 3, "#2a2a1a"); px(g, x + 3, y - 9, 8, 2, "#2a2a1a"); px(g, x, y - 20, 14, 2, "#3a8a3a"); });
        });
        return [[far, 0.06], [mid, 0.28], [near, 0.5]];
      },
      tile: ["stone", P("#7a8a5a", "#9aaa6a", "#7a7a5a", "#4a4a34", "#9a9a74")],
      deco: ["weed", "urn", "flower"],
      portal: ["#f2c23b", "#3a8a3a"],
    },
    {
      name: "Funfair",
      weather: "confetti",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#3a2a6a", "#5a3a7a", "#8a4a7a", "#c86a6a"]);
          k.stars(g, 30, 60);
          // ferris wheel
          const cx = 140, cy = 82, r = 44;
          for (let a = 0; a < 120; a++) px(g, cx + Math.cos(a / 19) * r, cy + Math.sin(a / 19) * r, 2, 2, "#f2d27a");
          for (let s = 0; s < 8; s++) { const a = (s / 8) * Math.PI * 2; k.line(g, cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, "#c8a050"); px(g, cx + Math.cos(a) * r - 3, cy + Math.sin(a) * r, 7, 5, k.pick(["#e5604f", "#3a7fd5", "#5ad17a", "#f2c23b"])); }
          k.line(g, cx, cy, cx - 24, 150, "#c8a050", 2); k.line(g, cx, cy, cx + 24, 150, "#c8a050", 2);
          // coaster track
          for (let x = 220; x < LW; x++) { const y = 110 + Math.round(Math.sin(x / 22) * 26); px(g, x, y, 1, 2, "#e8e0d0"); if (x % 12 === 0) px(g, x, y, 1, 150 - y, "#a89a88"); }
        });
        const mid = k.layer((g) => {
          k.along(k.flat(156), [60, 110], (x, y) => {
            const c = k.pick(["#e5604f", "#3a7fd5", "#9a5fd1"]);
            px(g, x, y - 18, 30, 18, "#f4f0e0");
            for (let i = 0; i < 30; i += 6) px(g, x + i, y - 18, 3, 18, c);
            k.tri(g, x + 15, y - 18, 18, 12, c);
            px(g, x + 14, y - 34, 1, 5, "#2a2a2a"); px(g, x + 15, y - 34, 4, 2, "#f2c23b");
          });
          px(g, 0, 156, LW, 40, "#4a3a5a");
        });
        const near = k.layer((g) => {
          for (let x = 0; x < LW; x += 3) px(g, x, 30 + Math.round(Math.sin(x / 24) * 6), 1, 1, "#2a2a2a");
          for (let x = 0; x < LW; x += 12) k.disc(g, x, 32 + Math.round(Math.sin(x / 24) * 6), 2, k.pick(["#f2d27a", "#e5604f", "#5ad17a", "#3af0f0"]));
          k.along(k.flat(182), [60, 130], (x, y) => { px(g, x, y - 26, 1, 22, "#f4f4f4"); k.ellipse(g, x, y - 30, 5, 6, k.pick(["#e5604f", "#3a7fd5", "#f2c23b"])); });
        });
        return [[far, 0.06], [mid, 0.28], [near, 0.55]];
      },
      tile: ["wood", P("#c87a4a", "#e8a070", "#9a5a34", "#6a3a20", "#c87a4a")],
      deco: ["balloon", "barrier", "flower"],
      portal: ["#f2d27a", "#e5604f"],
    },
    {
      name: "Steampunk Skies",
      weather: "ash",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#c8a078", "#d8b088", "#e4c4a0", "#ecd8b8"]);
          k.clouds(g, 20, 70, "#f0e4d0", 7, 1.5);
          k.along(k.flat(60), [140, 220], (x) => { k.ellipse(g, x, k.RI(30, 70), 26, 9, "#8a5a3a"); });
        });
        const mid = k.layer((g) => {
          k.skyline(g, 150, { w: [20, 40], h: [40, 90], body: "#6a4a32", roof: "mixed", roofColor: "#8a6a3a", lit: "#f2c23b", unlit: "#4a3222", litChance: 0.3 });
          k.along(k.flat(80), [120, 200], (x) => {
            k.ellipse(g, x, 60, 30, 10, "#a87a48"); 
            for (let i = -24; i < 26; i += 8) px(g, x + i, 52, 1, 16, "#8a5a32");
            px(g, x - 10, 72, 20, 6, "#5a3a22"); k.line(g, x - 10, 70, x - 14, 72, "#5a3a22"); k.line(g, x + 10, 70, x + 14, 72, "#5a3a22");
            k.disc(g, x + 32, 60, 4, "#c8a050");
          });
        });
        const near = k.layer((g) => {
          for (let x = 0; x < LW; x += 110) {
            const cx = x + 40, cy = 176, r = 22;
            k.disc(g, cx, cy, r, "#8a6a3a"); k.disc(g, cx, cy, r - 8, "#6a4a2a"); k.disc(g, cx, cy, 4, "#c8a050");
            for (let a = 0; a < 10; a++) px(g, cx + Math.cos(a * 0.628) * (r + 2) - 2, cy + Math.sin(a * 0.628) * (r + 2) - 2, 5, 5, "#8a6a3a");
          }
          px(g, 0, 140, LW, 3, "#a87a48");
        });
        return [[far, 0.06], [mid, 0.28], [near, 0.55]];
      },
      tile: ["metal", P("#a87a48", "#d8a868", "#6a4a2a", "#3a2614", "#c89a60")],
      deco: ["gearDeco", "pipe", "barrel"],
      portal: ["#f2c23b", "#a87a48"],
    },
    {
      name: "Grand Library",
      layers(k) {
        const far = k.layer((g) => {
          px(g, 0, 0, LW, VH, "#3a2418");
          for (let x = 0; x < LW; x += 60) { px(g, x + 18, 20, 24, 50, "#5a7aa0"); k.ellipse(g, x + 30, 20, 12, 10, "#5a7aa0"); px(g, x + 29, 12, 2, 58, "#3a2418"); px(g, x + 18, 44, 24, 2, "#3a2418"); }
        });
        const mid = k.layer((g) => {
          for (let x = 0; x < LW; x += 120) {
            px(g, x, 40, 100, 150, "#5a3420");
            for (let y = 46; y < 180; y += 16) {
              px(g, x + 2, y + 13, 96, 3, "#3a2010");
              for (let i = x + 4; i < x + 96;) { const w = k.RI(2, 5), h = k.RI(8, 12); px(g, i, y + 13 - h, w, h, k.pick(["#8a2a2a", "#2a4a8a", "#2a6a3a", "#8a6a2a", "#5a2a6a", "#c8b890"])); i += w; }
            }
            for (let i = 0; i < 20; i++) px(g, x + 104, 40 + i * 7, 8, 1, "#8a5a32");
            px(g, x + 104, 40, 1, 150, "#8a5a32"); px(g, x + 111, 40, 1, 150, "#8a5a32");
          }
        });
        const near = k.layer((g) => {
          k.along(k.flat(0), [120, 200], (x) => {
            px(g, x, 0, 1, 20, "#c8a050");
            px(g, x - 14, 20, 29, 3, "#c8a050");
            for (let i = -12; i <= 12; i += 6) { px(g, x + i, 23, 1, 4, "#c8a050"); px(g, x + i - 1, 27, 3, 3, "#fff0b0"); }
          });
        });
        return [[far, 0.08], [mid, 0.3], [near, 0.5]];
      },
      tile: ["wood", P("#8a5a32", "#a87a48", "#5a3a20", "#3a2412", "#8a5a32")],
      deco: ["book", "lantern", "urn"],
      portal: ["#fff0b0", "#8a2a2a"],
    },
    {
      name: "Sky Islands",
      layers(k) {
        const far = k.layer((g) => {
          k.sky(g, ["#5aa8f0", "#78bcf4", "#a0d0f6", "#d0e8fa"]);
          k.clouds(g, 120, 180, "#ffffff", 12, 2);
          k.along(k.flat(80), [100, 170], (x) => { const y = k.RI(40, 100), w = k.RI(14, 26); px(g, x - w, y, w * 2, 3, "#6ab04a"); k.tri(g, x, y + 3, w, -k.RI(10, 18), "#8a6a48"); });
        });
        const mid = k.layer((g) => {
          k.along(k.flat(100), [120, 200], (x) => {
            const y = k.RI(70, 120), w = k.RI(24, 40);
            px(g, x - w, y, w * 2, 4, "#5aa040");
            k.tri(g, x, y + 4, w, -k.RI(18, 30), "#7a5a3a");
            k.tree(g, "round", x - w / 2, y, 18, "#3a8a3a", "#5a3a20", "#5ab04a");
            for (let i = 0; i < 20; i++) px(g, x + w - 6, y + 4 + i, 2, 1, "#a0d8ff");
          });
        });
        const near = k.layer((g) => {
          k.clouds(g, 170, 190, "#f4f8ff", 10, 2.4);
        });
        return [[far, 0.06], [mid, 0.25], [near, 0.6]];
      },
      tile: ["grass", P("#5ab04a", "#88d070", "#8a6a48", "#6a4a30", "#a88a64")],
      deco: ["flower", "tuft", "flag"],
      portal: ["#ffffff", "#5aa8f0"],
    },
  ];

  // ---------- enemies: one pixel-map archetype per theme, recoloured ----------
  // Letters: k outline, c main, d dark, w light/eyes, a accent. "b" holds
  // replacement bottom rows for the second walk frame. hover: floats and bobs.
  const ENEMIES = {
    beetle: { rows: ["....kkkk....", "..kkccccckk.", ".kccccccccck", ".kcwwccwwcck", ".kcwkccwkcck", "kcccccccccck", "kcddddddddck", ".kkkkkkkkkk.", "..kk.kk.kk.."], b: ["...kk.kk.kk."] },
    slime: { rows: ["....kkkk....", "..kkcwwcck..", ".kcwcccccck.", ".kcckccckck.", "kcccccccccck", "kcccccccccck", "kddddddddddk", ".kkkkkkkkkk."], b: ["kkkkkkkkkkkk"] },
    rat: { rows: [".......kk...", "..kkkkkkakk.", ".kcccccccckk", "kccccccccwck", "kcccccccccca", "kdccccccccck", ".kkkkkkkkkk.", "k.kk..kk...."], b: ["k..kk..kk..."] },
    scorpion: { rows: ["..kkk.......", ".kcack......", ".kk.kk......", "....kk...k.k", "...kcckkkkck", "..kcccccccck", "..kcwccccck.", "..kdddddddk.", "..k.k.k.k..."], b: ["...k.k.k.k.."] },
    mummy: { rows: ["...kkkkkk...", "..kccccccck.", "..kdddddddk.", "..kcwkcwkck.", "..kccccccck.", "..kdddddddk.", ".kkccccccckk", "..kddddddk..", "..kcck.kcck.", "..kkk..kkk.."], b: ["...kcckkcck.", "...kkk.kkk.."] },
    robot: { rows: [".....kk.....", ".....ka.....", "..kkkkkkkk..", "..kcccccck..", "..kwwccwwk..", "..kcaaaack..", ".kkkkkkkkkk.", ".kdcccccccdk", ".kdddddddddk", "..kk....kk.."], b: ["...kk..kk..."] },
    tank: { rows: ["....kkkk....", "...kcccckkkk", "...kcccck...", ".kkkkkkkkkk.", "kcccccccccck", "kddddddddddk", "kakakakakaak", ".kkkkkkkkkk."], b: ["kkakakakakak", ".kkkkkkkkkk."] },
    crab: { rows: [".kk......kk.", "kack....kack", ".kk.k..k.kk.", "..kkwkkwkk..", ".kcccccccck.", "kcccccccccck", ".kddddddddk.", "k.k.k..k.k.k"], b: [".k.k.kk.k.k."] },
    fish: { hover: true, rows: ["...kkkkk....", "..kcccccck.k", ".kcwkcccckck", "kcccccccccck", ".kdddddddkck", "..kkkkkkk..k"], b: ["..kkkkkkk.k."] },
    penguin: { rows: ["...kkkkk....", "..kcccccck..", "..kcwkwkck..", "..kcwwawck..", ".kccwwwwcck.", ".kccwwwwcck.", "..kcwwwwck..", "..kkkkkkkk..", "..kaa..aak.."], b: ["...kaa.aak.."] },
    iceblob: { rows: [".k...k...k..", "kck.kck.kck.", ".kcccccccck.", "kcwwcccwwcck", "kcwkcccwkcck", "kcccccccccck", "kcddddddddck", ".kkkkkkkkkk."], b: [".kkk.kk.kkk."] },
    mole: { rows: ["...kkkkk....", "..kcccccck..", ".kcckccckck.", "kcccccccccak", "kcccccccccck", ".kdddddddddk", "kwk.kk.kk.kw"], b: ["kwk..kk.kk.w"] },
    goose: { rows: [".......kkk..", "......kcwkk.", "......kccaa.", "......kck...", "......kck...", "..kkkkkcck..", ".kcccccccck.", "kdcccccccck.", ".kdddddddk..", "....ka.ka..."], b: [".....ka.ka.."] },
    knight: { rows: ["....kak.....", "...kaak.....", "..kkkkkkk...", ".kcccccccck.", ".kkkkkkkkck.", ".kcccccccck.", "..kdddddddk.", "..kdaaaddk..", "..kk...kk..."], b: ["...kk.kk...."] },
    centurion: { rows: ["..kaaaaak...", "...kkkkk....", "..kcccccck..", ".kccwkcwkck.", ".kcwwwwwck..", "..kwwwwwk...", ".kaaaaaaak..", ".kdddddddk..", "..kw..kw...."], b: ["...kw.kw...."] },
    lantern: { hover: true, rows: [".....kk.....", "...kkkkkk...", "..kcccccck..", ".kddddddddk.", ".kcwkccwkck.", ".kccckkccck.", ".kddddddddk.", "..kccaacck..", "...kkkkkk...", "....k..k...."], b: [".....kk....."] },
    fox: { rows: ["..k...k.....", "..kakkak....", "..kcccck....", ".kckcckck...", ".kcwwwwck...", "..kkwwkcccck", "....kccccckw", "....kdddddkk", "....kk..kk.."], b: [".....kk.kk.."] },
    boar: { rows: ["..kkkkkkk...", ".kcccccccck.", "kccccccwkcck", "kcccccccccak", "kcccccccccwk", "kdddddddddk.", ".kk.kk.kk.k."], b: ["..kk.kk.kk.."] },
    snake: { rows: ["........kkk.", ".......kcwck", ".......kccak", "..kkk..kcck.", ".kcdck.kck..", "kcdkdckcdk..", "kdk.kdcdk...", ".k...kkk...."], b: ["k....kkk...."] },
    frog: { rows: ["..kk....kk..", ".kwkk..kkwk.", ".kccckkccck.", "kcccccccccck", "kckkkkkkkkck", "kcwwwwwwwwck", ".kcccccccck.", "kck......kck"], b: [".kk......kk."] },
    cart: { rows: ["kk..........", ".k..........", ".kkkkkkkkkkk", ".kcwcwcwcwck", ".kwcwcwcwcwk", "..kcwcwcwck.", "..kkkkkkkk..", "..k......k..", ".kak....kak."], b: [".kka....kka."] },
    minicar: { rows: ["...kkkkkk...", "..kcwwcwwk..", ".kccccccccck", "kcccccccccak", "kddddddddddk", ".kwk....kwk.", "..k......k.."], b: ["..kk....kk.."] },
    virus: { rows: ["kk..kkkk..kk", "kakkccccckak", ".kcccccccck.", ".kcwkccwkck.", ".kcccccccck.", ".kcakkkkack.", ".kcccccccck.", "kakkkkkkkkak", "kk........kk"], b: [".kk......kk."] },
    drone: { hover: true, rows: ["kkkk....kkkk", "..k......k..", "..kkkkkkkk..", ".kcccccccck.", ".kcckwwkcck.", ".kccckkccck.", "..kddddddk..", "...ka..ak..."], b: ["....kaak...."] },
    note: { rows: [".....kkkkk..", ".....kcccck.", ".....kck.kk.", ".....kck....", ".....kck....", "..kkkkck....", ".kccccck....", "kcwkcwcck...", "kcccccck....", ".kkkkkk....."], b: [".kk..kk....."] },
    boulder: { rows: ["...kkkkkk...", "..kcccwcck..", ".kccwccccdk.", "kcccccccddck", "kcwkccwkcdck", "kccccccccddk", "kdccckkcdddk", ".kdddddddddk", "..kkkkkkkk.."], b: ["..kkkkkkkk.."] },
    ghost: { hover: true, rows: ["...kkkkkk...", "..kcccccck..", ".kcccccccck.", ".kckkcckkck.", ".kckkcckkck.", ".kcccccccck.", ".kccckkccck.", ".kcccccccck.", ".kckckckckk."], b: [".kkckckckck."] },
    book: { hover: true, rows: [".kkkk..kkkk.", "kcwwckkcwwck", "kckwckkckwck", "kcwwckkcwwck", "kcwwkaakwwck", "kcccckkcccck", ".kkkk..kkkk."], b: ["..kkk..kkk.."] },
    gear: { rows: ["...k.kk.k...", "..kkcaakk...", "..kcakkack..", "..kkcaakkkk.", ".kddddddddwk", "kddddddddddk", ".k.k.k.k.k.."], b: ["..k.k.k.k.k."] },
    alien: { rows: ["..k......k..", "...k....k...", "...kkkkkk...", "..kcccccck..", ".kcwwccwwck.", ".kcwkccwkck.", "..kcccccck..", "..kkddddkk..", "..kddddddk..", "..kk....kk.."], b: ["...kk..kk..."] },
    pumpkin: { rows: [".....ka.....", "....kkak....", "..kkcccckk..", ".kcccccccck.", "kcwwcdcwwcck", "kcccdcdcccck", "kcwcwcwcwcck", ".kcccdcccck.", "..kkkkkkkk..", ".k.k....k.k."], b: ["..k.k..k.k.."] },
    cloud: { hover: true, rows: ["....kkk.....", "..kkwwwkkk..", ".kwwwwwwwwk.", "kwwkwwwkwwwk", "kwwwwwwwwwwk", "kwccwwwwccwk", ".kwwwkkwwwk.", "..kkk..kkk.."], b: ["..kkk..kkk.."] },
  };

  // Which enemy each theme uses, with its colours.
  const E = (kind, c, d, w = "#ffffff", a = "#f2c23b") => ({ kind, pal: { k: "#1a1420", c, d, w, a } });
  const ENEMY_FOR = {
    "Forest": E("beetle", "#9a5fd1", "#6a3f9a"),
    "City at Night": E("rat", "#8a8a96", "#5a5a66", "#ff5a4a", "#f2a0c0"),
    "Desert": E("scorpion", "#c9603a", "#8a3a20", "#1a1420", "#e08a3c"),
    "English Village": E("goose", "#f4f4f4", "#c8c8c8", "#1a1420", "#f08a2a"),
    "Swamp": E("frog", "#6a9a3a", "#4a6a2a", "#f2e84b"),
    "Egypt": E("mummy", "#e8dcc0", "#b8a888", "#f2c23b"),
    "Alien World": E("slime", "#f0f070", "#b0b030", "#ff3a8a"),
    "Rabbit Hole": E("mole", "#6a5a5a", "#4a3a3a", "#ffffff", "#f2a0c0"),
    "Medieval Village": E("knight", "#a8a8b0", "#6a6a74", "#ffffff", "#d8402f"),
    "Neo Tokyo": E("lantern", "#e03a2a", "#a02010", "#f2e84b", "#1a1420"),
    "Renaissance Italy": E("goose", "#9a9aa8", "#6a6a78", "#f2a03a", "#e08a3c"),
    "Hawaiian Islands": E("crab", "#e5604f", "#a83a2a"),
    "Snowy Peaks": E("penguin", "#2a2a3a", "#1a1a24", "#ffffff", "#f2a03a"),
    "Supermarket": E("cart", "#a0a8b0", "#6a7078", "#e5604f", "#3a3a3a"),
    "Old European City": E("rat", "#7a6a5a", "#4a3a2a", "#ff5a4a", "#f2a0c0"),
    "Savanna": E("boar", "#8a5a3a", "#5a3a20", "#f4f0e0", "#3a2a1a"),
    "Ice Cave": E("iceblob", "#c8f0ff", "#7ab8e0", "#ffffff"),
    "Deep Ocean": E("fish", "#3a5a8a", "#1a3a6a", "#f2e84b", "#f2e84b"),
    "Space Station": E("robot", "#c0c8d8", "#8a90a0", "#3af0f0", "#ff3a3a"),
    "WWII Trenches": E("tank", "#5a6a3a", "#3a4a2a", "#ffffff", "#2a2a2a"),
    "Harbor": E("crab", "#d8402f", "#8a2a1a"),
    "Cyber World": E("virus", "#3af07a", "#1a9a4a", "#020812", "#f03a8a"),
    "Rainforest": E("snake", "#3a9a3a", "#f2c23b", "#1a1420", "#e5604f"),
    "Great Wall": E("lantern", "#d83a2a", "#8a2010", "#f2c23b"),
    "Stormy Suburbs": E("robot", "#5ad17a", "#3a9a5a", "#f2f2f2", "#e5604f"),
    "Highway": E("minicar", "#f2c23b", "#b08a20", "#9ad0f0", "#ffffff"),
    "Concert Hall": E("note", "#2a2a2a", "#1a1a1a", "#f8e8a0"),
    "Mall Parking": E("minicar", "#e5604f", "#a03a2a", "#9ad0f0", "#fff0c0"),
    "Inside the Volcano": E("slime", "#f06a1a", "#a03a10", "#ffe08a"),
    "Landslide": E("boulder", "#8a7a5a", "#5a4a32", "#f2f2f2"),
    "Military Base": E("tank", "#6a7a4a", "#4a5032", "#ffffff", "#2a2a2a"),
    "Ancient Rome": E("centurion", "#d8b040", "#a8802a", "#f2c79a", "#b0302a"),
    "Wild West": E("scorpion", "#8a5a32", "#5a3a20", "#1a1420", "#c08a50"),
    "Cyberpunk Megacity": E("drone", "#3a3a5a", "#22223a", "#f03a8a", "#3af0f0"),
    "Wasteland": E("rat", "#8a9a3a", "#5a6a2a", "#ff3a3a", "#c0f07e"),
    "Autumn Woods": E("pumpkin", "#e8782a", "#b0501a", "#ffe08a", "#3a8a3a"),
    "Cherry Blossoms": E("fox", "#e8782a", "#a8501a", "#ffffff", "#1a1420"),
    "Windmill Fields": E("beetle", "#d8302a", "#1a1420", "#ffffff"),
    "Northern Lights": E("fox", "#f4f8fc", "#c8d4e8", "#ffffff", "#1a1420"),
    "Moon Base": E("alien", "#5ad17a", "#3a9a5a", "#ffffff"),
    "Haunted Graveyard": E("ghost", "#e8ecf4", "#a8b0c8"),
    "Candy Land": E("slime", "#f2a0c0", "#d0709a", "#ffffff"),
    "Lighthouse Coast": E("goose", "#f4f4f4", "#a8b0b8", "#1a1420", "#f2c23b"),
    "Steel Factory": E("robot", "#e08a3c", "#a05a20", "#3af0f0", "#f2e84b"),
    "Pirate Cove": E("crab", "#9a5fd1", "#6a3f9a"),
    "Jungle Temple": E("boulder", "#8a8a6a", "#5a5a44", "#3af07a"),
    "Funfair": E("goose", "#f2c23b", "#c8902a", "#1a1420", "#e5604f"),
    "Steampunk Skies": E("gear", "#c8a050", "#6a4a2a", "#3af0f0", "#e8d080"),
    "Grand Library": E("book", "#8a2a2a", "#5a1a1a", "#f4ecd8", "#e5604f"),
    "Sky Islands": E("cloud", "#f2a0c0", "#d0709a", "#ffffff"),
  };
  const enemyFor = (theme) => ENEMY_FOR[theme.name] || E("beetle", "#9a5fd1", "#6a3f9a");
  // ---------- static enemies: stay in place, can't be stomped ----------
  // anim: "blink" (eyes close), "swap:xy" (swap two colours), "pulse" (bobs 1px).
  const STATICS = {
    thornbush: { anim: "blink", rows: [".k...k...k..", ".kk.kck.kk..", "..kcccccck..", ".kcdcccdcck.", "kccwkccwkcck", "kcdcccccdcck", "kakcdkkdckak", ".kcccdcccck.", "..kkkkkkkk.."] },
    cactus: { anim: "blink", rows: ["....kkkk....", "...kcacck...", "...kcccck...", "kk.kcccck.kk", "kckkwccwkkck", "kcckcccckcck", ".kkkckkckkk.", "...kcccck...", "...kcdcck...", "..kkkkkkkk.."] },
    urchin: { anim: "swap:dc", rows: ["..k..k..k...", "k..kkkkk..k.", ".kkcccccck..", "..kcwkcwkck.", "kkkccccccckk", "..kcdcdcdck.", ".kkcccccckk.", "k..kkkkkk..k", "..k..k..k..."] },
    mine: { anim: "swap:ad", rows: [".....kk.....", ".....ka.....", "...kkkkkk...", "..kcccccck..", ".kcdcccccdk.", "kkkkkkkkkkkk", "kddddddddddk"] },
    flame: { anim: "swap:ac", rows: ["....k.......", "...kak...k..", "...kaak.kak.", "..kacak.kak.", "..kacaakcak.", ".kacccacccak", ".kacwcccwcak", "kacckcccckak", "kacccccccak.", ".kkkkkkkkk.."] },
    crystal: { anim: "blink", rows: ["...k....k...", "..kwk..kwk..", "..kck..kck..", ".kcck..kcck.", ".kcck.kccck.", "kcdck.kcdck.", "kcdckkkcdcck", "kcdccccdcdck", "kkkkkkkkkkkk"] },
    spikes: { anim: "none", rows: ["..k...k...k.", ".kwk.kwk.kwk", ".kck.kck.kck", "kcdckcdckcdk", "kddddddddddk", "kakakakakaak", "kkkkkkkkkkkk"] },
    flytrap: { anim: "pulse", rows: ["..kkk..kkk..", ".kcwkkkkwck.", "kccwcccwcck.", "kcccckkcccck", ".kccwkkwcck.", "..kkcaackk..", ".....kak....", "..kk.kak.kk.", ".kaakka.kaak", "..kk.kk..kk."] },
    turret: { anim: "swap:ad", rows: ["....kkkk....", "...kcaack...", "..kcckkcck..", "..kcccccck..", ".kddddddddk.", "kcccccccccck", "kdkdkdkdkdkk"] },
    glitch: { anim: "swap:ac", rows: ["kkkkkkkkkkkk", "kcacacacacak", "kacacacacack", "kcwkacacwkck", "kacacacacack", "kcacacacacak", "kkkkkkkkkkkk"] },
    hedgehog: { anim: "blink", rows: ["...k.k.k....", "..kdkdkdk...", ".kdddddddk..", "kddddddddck.", "kdddddddcwk.", "kdddddcccckk", ".kkkkkkkkkk.", "..kk....kk.."] },
    hand: { anim: "pulse", rows: ["....k.k.k...", "...kckckck..", "...kckckckk.", "...kccccccck", "...kcccccck.", "....kcccck..", "....kdddk...", "...kddddk...", ".kkdddddkk.."] },
    snowman: { anim: "pulse", rows: ["....kkkk....", "....kddk....", "...kkkkkk...", "...kckcka...", "...kcccck...", "..kcccccck..", ".kcckcckcck.", ".kcccccccck.", "..kkkkkkkk.."] },
    cupcake: { anim: "blink", rows: [".....ka.....", "....kaak....", "..kkcccckk..", ".kccwccwcck.", "kcccccccccck", "kdkdkdkdkdkk", ".kdkdkdkdkk.", "..kkkkkkkk.."] },
    speaker: { anim: "pulse", rows: ["kkkkkkkkkkkk", "kcccccccccck", "kcdddccdddck", "kcdwdccdwdck", "kcdddccdddck", "kcccccccccck", "kccdddddddck", "kcccccccccck", "kkkkkkkkkkkk"] },
    cone: { anim: "pulse", rows: [".....kk.....", "....kcck....", "....kwwk....", "...kcccck...", "...kckkck...", "..kwwwwwwk..", "..kcccccck..", ".kcccccccck.", "kkkkkkkkkkkk"] },
    jackbox: { anim: "pulse", rows: ["....kkkk....", "...kwwwwk...", "...kwkkwk...", "...kwaawk...", "....kkkk....", ".....kk.....", "....k..k....", ".....kk.....", "..kkkkkkkk..", "..kcdcdcdk..", "..kdcdcdck..", "..kkkkkkkk.."] },
    saw: { anim: "swap:wc", rows: ["...k.kk.k...", "..kwkwwkwk..", ".kwwccccwwk.", "kwwccddccwwk", ".kwccddccwk.", "kkkkkkkkkkkk", "kddddddddddk"] },
    mushroom: { anim: "pulse", rows: ["...kkkkkk...", "..kcwcccwck.", ".kcccccccwck", "kcwcccccccck", "kkkkkkkkkkkk", "...kwwwwk...", "...kwkkwk...", "...kwwwwk...", "..kkkkkkkk.."] },
  };

  const SF = (kind, c, d, w = "#ffffff", a = "#f2c23b") => ({ kind, pal: { k: "#1a1420", c, d, w, a } });
  const STATIC_FOR = {
    "Forest": SF("thornbush", "#3a8a3a", "#2a6a2a", "#ffffff", "#c8e070"),
    "City at Night": SF("cone", "#f06a1a", "#a04010"),
    "Desert": SF("cactus", "#4f8a3a", "#3a6a2a", "#ffffff", "#f2a0c0"),
    "English Village": SF("hedgehog", "#d8b890", "#6a4a30", "#ffffff"),
    "Swamp": SF("flytrap", "#6a9a3a", "#4a6a2a", "#ffffff", "#d8402f"),
    "Egypt": SF("spikes", "#d8b070", "#9a7a48", "#fff0c0", "#2a6ab0"),
    "Alien World": SF("crystal", "#f070d0", "#a03a90", "#ffffff"),
    "Rabbit Hole": SF("mushroom", "#d8402f", "#8a2a1a", "#f4ecd8"),
    "Medieval Village": SF("spikes", "#8a8a90", "#5a5a60", "#d8d8e0", "#8a5a32"),
    "Neo Tokyo": SF("turret", "#3a3a5a", "#22223a", "#ffffff", "#f070d0"),
    "Renaissance Italy": SF("thornbush", "#3a6a30", "#2a4a20", "#ffffff", "#e5604f"),
    "Hawaiian Islands": SF("urchin", "#6a3a8a", "#4a2a6a", "#ffffff"),
    "Snowy Peaks": SF("snowman", "#f4f8fc", "#2a2a3a", "#ffffff", "#f06a1a"),
    "Supermarket": SF("cone", "#f2c23b", "#b08a20"),
    "Old European City": SF("spikes", "#3a3a40", "#2a2a30", "#9a9aa0", "#c8a050"),
    "Savanna": SF("thornbush", "#8a7a30", "#5a4a20", "#ffffff", "#c8a050"),
    "Ice Cave": SF("crystal", "#a0e0ff", "#5a9ac8", "#ffffff"),
    "Deep Ocean": SF("urchin", "#2a2a4a", "#1a1a34", "#f2e84b"),
    "Space Station": SF("turret", "#8a90a0", "#5a6070", "#ffffff", "#ff3a3a"),
    "WWII Trenches": SF("mine", "#4a5a3a", "#2a3420", "#ffffff", "#ff3a3a"),
    "Harbor": SF("mine", "#3a3a40", "#1a1a20", "#ffffff", "#ff3a3a"),
    "Cyber World": SF("glitch", "#3af07a", "#1a6a3a", "#ffffff", "#f03a8a"),
    "Rainforest": SF("flytrap", "#3a9a3a", "#2a6a2a", "#ffffff", "#f070d0"),
    "Great Wall": SF("spikes", "#b0a890", "#6a6450", "#e8e0c8", "#d83a2a"),
    "Stormy Suburbs": SF("hedgehog", "#c8b090", "#5a4a3a", "#ffffff"),
    "Highway": SF("cone", "#f06a1a", "#a04010"),
    "Concert Hall": SF("speaker", "#3a3a3a", "#1a1a1a", "#f8e8a0"),
    "Mall Parking": SF("cone", "#f06a1a", "#a04010"),
    "Inside the Volcano": SF("flame", "#ffb03a", "#a03a10", "#ffffff", "#f05a10"),
    "Landslide": SF("spikes", "#8a7a5a", "#5a4a32", "#c8b898", "#4a3a2a"),
    "Military Base": SF("mine", "#5a6a3a", "#3a4a2a", "#ffffff", "#ff3a3a"),
    "Ancient Rome": SF("spikes", "#e0d4c0", "#9a8a70", "#ffffff", "#b0302a"),
    "Wild West": SF("cactus", "#4f7a3a", "#3a5a2a", "#ffffff", "#e5604f"),
    "Cyberpunk Megacity": SF("turret", "#22143a", "#120a20", "#ffffff", "#3af0f0"),
    "Wasteland": SF("mine", "#7a4a2a", "#4a2a14", "#ffffff", "#c0f07e"),
    "Autumn Woods": SF("thornbush", "#c8582a", "#8a3a1a", "#ffffff", "#f0b03a"),
    "Cherry Blossoms": SF("thornbush", "#f0a8c8", "#c87898", "#ffffff", "#ffffff"),
    "Windmill Fields": SF("hedgehog", "#d8c0a0", "#7a5a3a", "#ffffff"),
    "Northern Lights": SF("crystal", "#3af0c0", "#1a8a7a", "#ffffff"),
    "Moon Base": SF("turret", "#c8ccd4", "#8a8a90", "#ffffff", "#5ad17a"),
    "Haunted Graveyard": SF("hand", "#8aa07a", "#3a3a48", "#ffffff"),
    "Candy Land": SF("cupcake", "#f2a0c0", "#8a5a3a", "#ffffff", "#e5604f"),
    "Lighthouse Coast": SF("urchin", "#3a2a4a", "#2a1a3a", "#ffffff"),
    "Steel Factory": SF("flame", "#ffd03a", "#a04010", "#ffffff", "#f06a1a"),
    "Pirate Cove": SF("urchin", "#4a2a5a", "#2a1a3a", "#f2c23b"),
    "Jungle Temple": SF("spikes", "#8a8a6a", "#5a5a44", "#c8c8a0", "#3a8a3a"),
    "Funfair": SF("jackbox", "#e5604f", "#3a7fd5", "#f4f4f4", "#e5604f"),
    "Steampunk Skies": SF("saw", "#c8a050", "#6a4a2a", "#e8e0c8"),
    "Grand Library": SF("flame", "#a0d0ff", "#3a5aa0", "#ffffff", "#5a7af0"),
    "Sky Islands": SF("crystal", "#f4f8ff", "#a0c0e0", "#ffffff"),
  };
  const staticFor = (theme) => STATIC_FOR[theme.name] || SF("spikes", "#8a8a90", "#5a5a60");


  function drawCactus(g, x, y, s = 1) {
    const c = "#4f7a3a";
    px(g, x, y - 9 * s, 3 * s, 9 * s, c);
    px(g, x - 3 * s, y - 6 * s, 3 * s, 1.5 * s, c); px(g, x - 3 * s, y - 9 * s, 1.5 * s, 4 * s, c);
    px(g, x + 3 * s, y - 4 * s, 3 * s, 1.5 * s, c); px(g, x + 4.5 * s, y - 8 * s, 1.5 * s, 5 * s, c);
  }

  // ---------- ground tiles ----------

  function makeTiles(style, p, rand) {
    const RI = (a, b) => Math.floor(a + rand() * (b - a + 1));
    const [top, gt] = offscreen(T, T);
    const [fill, gf] = offscreen(T, T);
    const specks = (g, y0, n) => { for (let i = 0; i < n; i++) px(g, RI(0, T - 2), RI(y0, T - 1), 2, 1, rand() < 0.5 ? p.dk : p.lt); };
    const both = (fn) => { fn(gf, 0, false); fn(gt, 0, true); };
    switch (style) {
      case "grass": case "snow": case "mud": case "sand": {
        for (const [g, y0] of [[gf, 0], [gt, 4]]) { px(g, 0, y0, T, T - y0, p.fill); specks(g, y0, 10); }
        if (style === "sand") for (const g of [gf, gt]) for (let y = 6; y < T; y += 5) px(g, 0, y, T, 1, p.lt);
        px(gt, 0, 0, T, 4, p.top);
        px(gt, 0, 0, T, 1, p.hi);
        for (let x = 0; x < T; x += 2) if (rand() < 0.6) px(gt, x, 4, 1, RI(1, 2), p.top);
        if (style === "mud") for (let i = 0; i < 3; i++) px(gt, RI(0, 12), RI(1, 3), 4, 1, p.dk);
        break;
      }
      case "brick": {
        const bricks = (g, y0) => {
          px(g, 0, y0, T, T - y0, p.fill);
          for (let y = y0; y < T; y += 4) {
            px(g, 0, y, T, 1, p.lt);
            for (let x = (((y - y0) / 4) % 2) * 4; x < T; x += 8) px(g, x, y, 1, 4, p.lt);
          }
          for (let i = 0; i < 4; i++) px(g, RI(0, T - 2), RI(y0 + 1, T - 1), 2, 1, p.dk);
        };
        bricks(gf, 0); bricks(gt, 5);
        px(gt, 0, 0, T, 5, p.top); px(gt, 0, 0, T, 1, p.hi); px(gt, 0, 4, T, 1, p.dk); px(gt, 7, 1, 1, 3, p.dk);
        break;
      }
      case "stone": case "cobble": {
        for (const g of [gf, gt]) {
          px(g, 0, 0, T, T, p.dk);
          if (style === "stone") {
            for (let y = 0; y < T; y += 8) for (let x = (y / 8) % 2 ? -4 : 0; x < T; x += 8) {
              px(g, x + 1, y + 1, 7, 7, p.fill); px(g, x + 1, y + 1, 7, 1, p.lt); px(g, x + 1, y + 1, 1, 7, p.lt);
            }
          } else {
            for (let y = 0; y < T; y += 5) for (let x = (y / 5) % 2 ? -3 : 0; x < T; x += 6) {
              px(g, x + 1, y + 1, 5, 3, p.fill); px(g, x + 2, y + 1, 3, 1, p.hi);
            }
          }
        }
        px(gt, 0, 0, T, 2, p.top); px(gt, 0, 0, T, 1, p.hi);
        break;
      }
      case "metal": {
        for (const g of [gf, gt]) {
          px(g, 0, 0, T, T, p.fill);
          px(g, 0, 0, T, 1, p.lt); px(g, 0, 0, 1, T, p.lt); px(g, T - 1, 0, 1, T, p.dk); px(g, 0, T - 1, T, 1, p.dk);
          for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) px(g, x, y, 1, 1, p.lt);
        }
        px(gt, 0, 0, T, 3, p.top); px(gt, 0, 0, T, 1, p.hi);
        break;
      }
      case "wood": {
        for (const g of [gf, gt]) {
          px(g, 0, 0, T, T, p.fill);
          for (let y = 3; y < T; y += 4) px(g, 0, y, T, 1, p.dk);
          for (let y = 0; y < T; y += 4) px(g, ((y / 4) % 2) * 8 + 3, y + 1, 1, 1, p.dk);
        }
        px(gt, 0, 0, T, 3, p.top); px(gt, 0, 0, T, 1, p.hi);
        break;
      }
      case "tile": {
        for (const g of [gf, gt]) {
          px(g, 0, 0, T, T, p.dk);
          px(g, 1, 1, 7, 7, p.fill); px(g, 9, 9, 6, 6, p.fill);
          px(g, 9, 1, 6, 7, p.lt); px(g, 1, 9, 7, 6, p.lt);
        }
        px(gt, 0, 0, T, 2, p.top); px(gt, 0, 0, T, 1, p.hi);
        break;
      }
      case "asphalt": {
        for (const g of [gf, gt]) { px(g, 0, 0, T, T, p.fill); specks(g, 0, 8); }
        px(gt, 0, 0, T, 3, p.top); px(gt, 0, 0, T, 1, p.hi);
        break;
      }
      case "grid": {
        for (const g of [gf, gt]) {
          px(g, 0, 0, T, T, p.fill);
          px(g, 0, 0, T, 1, p.lt); px(g, 0, 0, 1, T, p.lt);
          px(g, 7, 7, 2, 2, p.dk);
        }
        px(gt, 0, 0, T, 2, p.top); px(gt, 0, 0, T, 1, p.hi);
        break;
      }
      case "ice": {
        for (const g of [gf, gt]) {
          px(g, 0, 0, T, T, p.fill);
          for (let i = 0; i < 6; i++) px(g, RI(0, 13), RI(0, 15), 3, 1, p.lt);
          px(g, RI(2, 10), RI(4, 10), 1, 4, p.dk);
        }
        px(gt, 0, 0, T, 3, p.top); px(gt, 0, 0, T, 1, p.hi);
        break;
      }
      case "rock": default: {
        for (const g of [gf, gt]) {
          px(g, 0, 0, T, T, p.fill);
          specks(g, 0, 8);
          let x = RI(2, 12);
          for (let y = 2; y < T; y++) { px(g, x, y, 1, 1, p.accent || p.dk); if (rand() < 0.4) x += rand() < 0.5 ? -1 : 1; }
        }
        px(gt, 0, 0, T, 2, p.top); px(gt, 0, 0, T, 1, p.hi);
      }
    }
    return { top, fill };
  }

  // ---------- small ground props, drawn each frame at the surface (x, y) ----------

  function drawDeco(g, kind, x, y, t) {
    const R = (dx, dy, w, h, c) => px(g, x + dx, y + dy, w, h, c);
    switch (kind) {
      case "flower": R(1, -4, 1, 4, "#2f6a40"); R(0, -6, 3, 2, t % 3 === 0 ? "#f2d24b" : t % 3 === 1 ? "#e5604f" : "#f2a0c0"); break;
      case "tuft": R(0, -3, 1, 3, "#3a7a3a"); R(2, -4, 1, 4, "#4a8a3a"); R(4, -2, 1, 2, "#3a7a3a"); break;
      case "mushroom": R(1, -3, 2, 3, "#f0e8d8"); R(-1, -6, 6, 3, "#d8402f"); R(0, -6, 1, 1, "#ffffff"); R(3, -5, 1, 1, "#ffffff"); break;
      case "lamp":
        R(1, -20, 1, 20, "#3a3d48"); R(-1, -22, 5, 2, "#3a3d48"); R(-1, -20, 5, 1, "#ffe08a");
        for (let i = 0; i < 19; i++) { const half = 2 + Math.floor(i / 3); for (let dx = -half; dx <= half; dx++) if ((dx + i) % 2 === 0) R(1 + dx, -19 + i, 1, 1, "#ffe08a"); }
        break;
      case "cactus": drawCactus(g, x, y, 1); break;
      case "hydrant": R(0, -6, 4, 6, "#d8402f"); R(-1, -4, 6, 1, "#d8402f"); R(1, -7, 2, 1, "#a82a1f"); break;
      case "trash": R(0, -7, 6, 7, "#4a5a4a"); R(-1, -8, 8, 1, "#3a4a3a"); break;
      case "bone": R(0, -2, 6, 1, "#f0e8d8"); R(-1, -3, 1, 3, "#f0e8d8"); R(6, -3, 1, 3, "#f0e8d8"); break;
      case "rock": R(0, -3, 6, 3, "#6a6a6a"); R(1, -4, 4, 1, "#6a6a6a"); R(1, -4, 2, 1, "#9a9a9a"); break;
      case "post": R(1, -8, 2, 8, "#7a5a3a"); R(-2, -6, 8, 1, "#7a5a3a"); break;
      case "reed": R(0, -10, 1, 10, "#5a6a2a"); R(2, -8, 1, 8, "#5a6a2a"); R(-1, -12, 2, 4, "#6a4a2a"); break;
      case "puddle": R(-2, -1, 10, 1, "#5a7aa0"); R(0, -1, 3, 1, "#a0c0e0"); break;
      case "urn": R(0, -6, 5, 5, "#b0603a"); R(1, -7, 3, 1, "#b0603a"); R(0, -4, 5, 1, "#2a2a2a"); R(1, -1, 3, 1, "#8a4a2a"); break;
      case "crystal": R(1, -7, 2, 7, "#c0a0ff"); R(-1, -4, 2, 4, "#70f0f0"); R(3, -5, 2, 5, "#f070d0"); break;
      case "alienPlant": R(1, -8, 1, 8, "#3a9a7a"); R(0, -10, 3, 2, "#6af0b0"); R(-2, -5, 2, 1, "#3a9a7a"); break;
      case "carrot": R(1, -5, 2, 5, "#f08a2a"); R(0, -8, 1, 3, "#3a9a3a"); R(2, -8, 1, 3, "#3a9a3a"); break;
      case "barrel": R(0, -8, 6, 8, "#8a5a32"); R(0, -6, 6, 1, "#3a3a3a"); R(0, -2, 6, 1, "#3a3a3a"); break;
      case "hay": R(-1, -6, 9, 6, "#d8b050"); R(0, -7, 7, 1, "#e8c870"); R(-1, -3, 9, 1, "#a8883a"); break;
      case "lantern": R(1, -12, 1, 4, "#3a2a1e"); R(-1, -8, 5, 6, "#e03a2a"); R(0, -7, 3, 4, "#f2a03a"); R(1, -2, 1, 2, "#3a2a1e"); break;
      case "neonSign": R(0, -14, 1, 14, "#3a3a4a"); R(-3, -16, 8, 5, "#f070d0"); R(-2, -15, 6, 3, "#ffd0f0"); break;
      case "cone": R(1, -7, 2, 2, "#f06a1a"); R(0, -5, 4, 2, "#f2f2f2"); R(0, -3, 4, 2, "#f06a1a"); R(-1, -1, 6, 1, "#f06a1a"); break;
      case "shell": R(0, -3, 5, 3, "#f2c0a0"); R(1, -4, 3, 1, "#f2c0a0"); R(2, -3, 1, 3, "#c88a70"); break;
      case "snowman": R(0, -6, 6, 6, "#f4f8fc"); R(1, -10, 4, 4, "#f4f8fc"); R(2, -9, 1, 1, "#1a1420"); R(4, -8, 2, 1, "#f06a1a"); break;
      case "crate": R(0, -8, 8, 8, "#a87a48"); R(0, -8, 8, 1, "#c89a68"); R(0, -1, 8, 1, "#7a5430"); R(3, -8, 2, 8, "#7a5430"); break;
      case "cart": R(0, -7, 8, 5, "#a0a8b0"); R(8, -10, 1, 5, "#a0a8b0"); R(1, -2, 2, 2, "#303030"); R(5, -2, 2, 2, "#303030"); break;
      case "icicle": R(0, -6, 3, 6, "#c8f0ff"); R(1, -8, 1, 2, "#ffffff"); break;
      case "coral": R(1, -8, 2, 8, "#f2a0c0"); R(-1, -6, 2, 2, "#f2a0c0"); R(3, -5, 2, 2, "#f2a0c0"); break;
      case "weed": for (let i = 0; i < 8; i++) R(Math.round(Math.sin(i / 2 + t) * 1), -i, 1, 1, "#2a8a5a"); break;
      case "pipe": R(0, -10, 3, 10, "#8a90a0"); R(0, -10, 8, 3, "#8a90a0"); R(1, -9, 1, 9, "#c0c8d8"); break;
      case "terminal": R(0, -9, 7, 9, "#3a4050"); R(1, -8, 5, 4, "#3af07a"); R(1, -3, 5, 1, "#8a90a0"); break;
      case "sandbag": R(-2, -3, 6, 3, "#a89068"); R(4, -3, 6, 3, "#a89068"); R(1, -6, 6, 3, "#b8a078"); break;
      case "wire": for (let i = 0; i < 10; i += 2) { R(i, -4 + (i % 4 ? 0 : 1), 1, 1, "#8a8a8a"); R(i, -2, 1, 1, "#8a8a8a"); } R(0, -6, 1, 6, "#5a4a30"); break;
      case "anchor": R(2, -9, 1, 8, "#5a5a6a"); R(0, -8, 5, 1, "#5a5a6a"); R(0, -2, 1, 1, "#5a5a6a"); R(4, -2, 1, 1, "#5a5a6a"); R(1, -1, 3, 1, "#5a5a6a"); break;
      case "chip": R(0, -5, 6, 5, "#1a1a2a"); for (let i = 0; i < 6; i += 2) { R(i, -6, 1, 1, "#3af0f0"); } R(1, -4, 4, 3, "#3af07a"); break;
      case "bit": R(0, -6, 1, 6, "#3af07a"); R(3, -6, 3, 6, "#3af07a"); R(4, -5, 1, 4, "#020812"); break;
      case "sign": R(1, -12, 1, 12, "#5a5a60"); R(-3, -16, 9, 5, "#2a7a4a"); R(-2, -14, 7, 1, "#f4f4f4"); break;
      case "barrier": R(-2, -6, 12, 3, "#f2f2f2"); for (let i = 0; i < 12; i += 4) R(-2 + i, -6, 2, 3, "#e5604f"); R(-1, -3, 1, 3, "#5a5a5a"); R(8, -3, 1, 3, "#5a5a5a"); break;
      case "speaker": R(0, -10, 7, 10, "#1a1a1a"); R(2, -8, 3, 3, "#4a4a4a"); R(2, -4, 3, 3, "#4a4a4a"); break;
      case "mic": R(2, -12, 1, 12, "#5a5a5a"); R(1, -14, 3, 3, "#9a9a9a"); R(0, -1, 5, 1, "#5a5a5a"); break;
      case "note": R(0, -3, 2, 2, "#f8e8a0"); R(1, -8, 1, 6, "#f8e8a0"); R(2, -8, 2, 1, "#f8e8a0"); break;
      case "vent": R(-1, -2, 7, 2, "#2a1a14"); R(1, -3, 3, 1, "#f06a1a"); R(2, -4 - (t % 3), 1, 1, "#ffb03a"); break;
      case "warn": R(1, -10, 1, 10, "#5a5a5a"); k_tri(g, x + 1, y - 9, 4, 6, "#f2c23b"); R(1, -14, 1, 2, "#1a1420"); break;
      case "pumpkin": R(0, -5, 7, 5, "#e8782a"); R(1, -6, 5, 1, "#e8782a"); R(3, -8, 1, 2, "#3a8a3a"); R(2, -4, 1, 1, "#ffe08a"); R(4, -4, 1, 1, "#ffe08a"); break;
      case "leafpile": R(-2, -2, 10, 2, "#c8782a"); R(0, -3, 6, 1, "#e8a040"); R(2, -4, 2, 1, "#b83a1a"); break;
      case "tulip": R(1, -5, 1, 5, "#3a8a3a"); R(0, -8, 3, 3, t % 2 ? "#e5604f" : "#f2c23b"); R(1, -8, 1, 1, "#ffffff"); break;
      case "flag": R(0, -14, 1, 14, "#c8c8c8"); R(1, -14, 7, 5, t % 2 ? "#e5604f" : "#3a7fd5"); R(1, -12, 7, 1, "#ffffff"); break;
      case "tombstone": R(0, -9, 7, 9, "#7a7a88"); R(1, -10, 5, 1, "#7a7a88"); R(2, -7, 3, 1, "#4a4a58"); R(3, -8, 1, 4, "#4a4a58"); break;
      case "lollipop": R(2, -6, 1, 6, "#f4f4f4"); R(0, -11, 5, 5, t % 2 ? "#f2a0c0" : "#5ad17a"); R(1, -10, 2, 1, "#ffffff"); break;
      case "candycane": for (let i = 0; i < 10; i++) R(0, -i - 1, 2, 1, Math.floor(i / 2) % 2 ? "#e5604f" : "#ffffff"); R(1, -11, 3, 1, "#e5604f"); R(4, -10, 1, 2, "#ffffff"); break;
      case "gearDeco": R(0, -6, 6, 6, "#a87a48"); R(2, -8, 2, 10, "#a87a48"); R(-2, -4, 10, 2, "#a87a48"); R(2, -4, 2, 2, "#3a2614"); break;
      case "chest": R(0, -6, 9, 6, "#8a5a2a"); R(0, -7, 9, 1, "#a87a3a"); R(0, -4, 9, 1, "#f2c23b"); R(4, -5, 1, 2, "#f2c23b"); break;
      case "balloon": R(2, -8, 1, 8, "#f4f4f4"); R(0, -14, 5, 6, t % 2 ? "#e5604f" : "#3a7fd5"); R(1, -13, 1, 2, "#ffffff"); break;
      case "book": R(0, -3, 8, 3, "#8a2a2a"); R(1, -5, 6, 2, "#2a4a8a"); R(0, -3, 8, 1, "#f4ecd8"); break;
      case "tire": R(0, -6, 7, 6, "#1a1a1a"); R(2, -4, 3, 2, "#4a3a2a"); break;
      default: break;
    }
  }

  function k_tri(g, cx, baseY, halfW, h, c) {
    for (let i = 0; i < h; i++) { const w = Math.round((halfW * (i + 1)) / h); px(g, cx - w, baseY - h + i, w * 2 + 1, 1, c); }
  }

  return { THEMES, ENEMIES, enemyFor, STATICS, staticFor, toolkit, makeTiles, drawDeco, mulberry32, offscreen, px, LW };
})();
