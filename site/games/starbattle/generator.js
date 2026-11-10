// Star Battle puzzle generator (1 star per row, column and region).
// Usable in the browser (global StarBattleGen) and in Node (require).
var StarBattleGen = (() => {
  // Small seeded RNG so a given seed always yields the same puzzle.
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

  // Random star placement: one per row and column, no two touching.
  function placeStars(n, rand) {
    const cols = new Array(n);
    const used = new Array(n).fill(false);
    const order = () => shuffle([...Array(n).keys()], rand);
    function go(r) {
      if (r === n) return true;
      for (const c of order()) {
        if (used[c] || (r > 0 && Math.abs(c - cols[r - 1]) <= 1)) continue;
        used[c] = true; cols[r] = c;
        if (go(r + 1)) return true;
        used[c] = false;
      }
      return false;
    }
    return go(0) ? cols : null;
  }

  // Grow one region from each star until the grid is covered.
  function growRegions(n, stars, rand) {
    const region = new Array(n * n).fill(-1);
    stars.forEach((c, r) => { region[r * n + c] = r; });
    let left = n * n - n;
    while (left > 0) {
      const i = Math.floor(rand() * n * n);
      if (region[i] !== -1) continue;
      const r = Math.floor(i / n), c = i % n;
      const nb = [];
      if (r > 0 && region[i - n] !== -1) nb.push(region[i - n]);
      if (r < n - 1 && region[i + n] !== -1) nb.push(region[i + n]);
      if (c > 0 && region[i - 1] !== -1) nb.push(region[i - 1]);
      if (c < n - 1 && region[i + 1] !== -1) nb.push(region[i + 1]);
      if (!nb.length) continue;
      region[i] = nb[Math.floor(rand() * nb.length)];
      left--;
    }
    return region;
  }

  // Count solutions, stopping at `limit`. Returns {count, first}.
  function solve(n, region, limit = 2) {
    const cols = new Array(n);
    const colUsed = new Array(n).fill(false);
    const regUsed = new Array(n).fill(false);
    let count = 0, first = null;
    (function go(r) {
      if (r === n) {
        if (count++ === 0) first = cols.slice();
        return;
      }
      for (let c = 0; c < n && count < limit; c++) {
        const g = region[r * n + c];
        if (colUsed[c] || regUsed[g] || (r > 0 && Math.abs(c - cols[r - 1]) <= 1)) continue;
        colUsed[c] = regUsed[g] = true; cols[r] = c;
        go(r + 1);
        colUsed[c] = regUsed[g] = false;
      }
    })(0);
    return { count, first };
  }

  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function neighbours(n, i) {
    const r = Math.floor(i / n), c = i % n, out = [];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  }

  // Is region g still connected if cell `skip` is removed from it?
  function connectedWithout(n, region, g, skip) {
    const cells = [];
    for (let i = 0; i < n * n; i++) if (region[i] === g && i !== skip) cells.push(i);
    if (!cells.length) return false;
    const seen = new Set([cells[0]]);
    const stack = [cells[0]];
    while (stack.length) {
      for (const j of neighbours(n, stack.pop())) {
        if (j !== skip && region[j] === g && !seen.has(j)) { seen.add(j); stack.push(j); }
      }
    }
    return seen.size === cells.length;
  }

  // Break an alternative solution by moving one of its star cells into a
  // neighbouring region: that region then holds two of the alternative's
  // stars, so the alternative is no longer valid. The intended solution is
  // untouched because the moved cell is never one of its stars.
  function repair(n, region, stars, alt, rand) {
    const cells = shuffle(
      alt.map((c, r) => r * n + c).filter((i) => stars[Math.floor(i / n)] !== i % n),
      rand
    );
    for (const i of cells) {
      const from = region[i];
      const targets = shuffle(neighbours(n, i).map((j) => region[j]).filter((g) => g !== from), rand);
      if (targets.length && connectedWithout(n, region, from, i)) {
        region[i] = targets[0];
        return true;
      }
    }
    return false;
  }

  // Returns {n, region: number[n*n], solution: col-per-row}.
  function generate(n, seed) {
    const rand = mulberry32(typeof seed === "string" ? hashString(seed) : seed);
    for (let attempt = 1; attempt <= 1000; attempt++) {
      const stars = placeStars(n, rand);
      if (!stars) throw new Error(`no star layout for n=${n}`);
      const region = growRegions(n, stars, rand);
      for (let step = 0; step < n * n; step++) {
        const { count, first } = solve(n, region);
        if (count === 1) return { n, region, solution: stars, attempts: attempt };
        // `first` may be the intended solution; ask for one that differs.
        const alt = first.join() === stars.join() ? findOther(n, region, stars) : first;
        if (!repair(n, region, stars, alt, rand)) break;
      }
    }
    throw new Error("could not generate a unique puzzle");
  }

  function findOther(n, region, stars) {
    const key = stars.join();
    let found = null;
    const cols = new Array(n), colUsed = new Array(n).fill(false), regUsed = new Array(n).fill(false);
    (function go(r) {
      if (found) return;
      if (r === n) { if (cols.join() !== key) found = cols.slice(); return; }
      for (let c = 0; c < n && !found; c++) {
        const g = region[r * n + c];
        if (colUsed[c] || regUsed[g] || (r > 0 && Math.abs(c - cols[r - 1]) <= 1)) continue;
        colUsed[c] = regUsed[g] = true; cols[r] = c;
        go(r + 1);
        colUsed[c] = regUsed[g] = false;
      }
    })(0);
    return found;
  }

  return { generate, solve, hashString };
})();

if (typeof module !== "undefined") module.exports = StarBattleGen;
