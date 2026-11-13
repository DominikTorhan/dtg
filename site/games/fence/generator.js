// Fence the Sheep: puzzle generator and region check.
// Usable in the browser (global FenceGen) and in Node (require).
var FenceGen = (() => {
  const GRASS = 0, WATER = 1, CLOVER = 2;
  const CLOVER_BONUS = 3;

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

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function neighbors(i, n) {
    const x = i % n, y = (i / n) | 0, out = [];
    if (x > 0) out.push(i - 1);
    if (x < n - 1) out.push(i + 1);
    if (y > 0) out.push(i - n);
    if (y < n - 1) out.push(i + n);
    return out;
  }

  function onEdge(i, n) {
    const x = i % n, y = (i / n) | 0;
    return x === 0 || y === 0 || x === n - 1 || y === n - 1;
  }

  // Where can the sheep walk? Returns the reachable cells, whether it can
  // escape (reach the edge of the map), and one shortest escape path.
  function region(p, fences) {
    const { n, tiles, sheep } = p;
    const prev = new Map([[sheep, -1]]);
    const queue = [sheep];
    let exit = -1;
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q];
      if (exit < 0 && onEdge(c, n)) exit = c;
      for (const nb of neighbors(c, n)) {
        if (prev.has(nb) || tiles[nb] === WATER || fences.has(nb)) continue;
        prev.set(nb, c);
        queue.push(nb);
      }
    }
    const path = [];
    for (let c = exit; c >= 0; c = prev.get(c)) path.push(c);
    const clovers = queue.filter((c) => tiles[c] === CLOVER).length;
    return {
      cells: new Set(queue),
      escaped: exit >= 0,
      path,
      score: queue.length + clovers * CLOVER_BONUS,
    };
  }

  function generate(seed, n = 13) {
    const rand = mulberry32(hashString(String(seed)));
    const ri = (k) => Math.floor(rand() * k);
    for (;;) {
      const tiles = new Array(n * n).fill(GRASS);
      const lakes = 6 + ri(5);
      for (let l = 0; l < lakes; l++) {
        let c = ri(n * n);
        const len = 5 + ri(18);
        for (let s = 0; s < len; s++) {
          tiles[c] = WATER;
          const nb = neighbors(c, n);
          c = nb[ri(nb.length)];
        }
      }
      const mid = (n / 2) | 0;
      const sheep = (mid - 2 + ri(5)) * n + (mid - 2 + ri(5));
      tiles[sheep] = GRASS;
      const grass = tiles.map((t, i) => (t === GRASS && i !== sheep ? i : -1)).filter((i) => i >= 0);
      for (let k = 0; k < 5 && grass.length; k++) tiles[grass.splice(ri(grass.length), 1)[0]] = CLOVER;

      const water = tiles.filter((t) => t === WATER).length / tiles.length;
      const p = { n, tiles, sheep, budget: 8 + ri(5) };
      const open = region(p, new Set());
      // Needs a real escape to block, and enough open land to be interesting.
      if (water < 0.18 || water > 0.42 || !open.escaped || open.cells.size < n * n * 0.4) continue;
      // The sheep's own neighbours must be fenceable, so there is always some answer.
      if (neighbors(sheep, n).filter((c) => tiles[c] !== WATER).length > p.budget) continue;
      return p;
    }
  }

  return { GRASS, WATER, CLOVER, CLOVER_BONUS, generate, region };
})();

if (typeof module !== "undefined") module.exports = FenceGen;
