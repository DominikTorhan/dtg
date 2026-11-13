// Districts: puzzle generator and exact solver.
// Usable in the browser (global DistrictsGen) and in Node (require).
//
// An n x n grid of voters is split into n districts of n connected cells.
// A district is won by strict majority. The solver finds the most districts
// your party can win, so the game can tell you whether you hit the optimum.
var DistrictsGen = (() => {
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

  const need = (n) => Math.floor(n / 2) + 1; // strict majority of n voters

  // All connected sets of k free cells that contain cell f.
  function regionsFrom(f, free, n, k) {
    let level = [[f]];
    for (let size = 1; size < k; size++) {
      const seen = new Set(), nextLevel = [];
      for (const set of level) {
        const has = new Set(set);
        for (const c of set) {
          for (const nb of neighbors(c, n)) {
            if (!free[nb] || has.has(nb)) continue;
            const grown = set.concat(nb).sort((a, b) => a - b);
            const key = grown.join(",");
            if (seen.has(key)) continue;
            seen.add(key);
            nextLevel.push(grown);
          }
        }
      }
      level = nextLevel;
    }
    return level;
  }

  // Every leftover patch of free cells must be fillable by whole districts.
  function patchesOk(free, n, k) {
    const seen = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) {
      if (!free[i] || seen[i]) continue;
      let size = 0;
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const c = stack.pop();
        size++;
        for (const nb of neighbors(c, n)) if (free[nb] && !seen[nb]) { seen[nb] = 1; stack.push(nb); }
      }
      if (size % k) return false;
    }
    return true;
  }

  // Max districts won by party 1. Branch and bound over all partitions.
  function solve(votes, n) {
    const k = n, maj = need(n);
    const free = new Uint8Array(n * n).fill(1);
    const total = votes.reduce((a, b) => a + b, 0);
    const ceiling = Math.min(n, Math.floor(total / maj));
    let best = -1;

    function go(placed, wins, mineLeft) {
      if (best === ceiling) return;
      if (placed === n) { if (wins > best) best = wins; return; }
      // Even winning with the bare minimum, can we beat the best so far?
      if (wins + Math.min(n - placed, Math.floor(mineLeft / maj)) <= best) return;
      const f = free.indexOf(1);
      const options = regionsFrom(f, free, n, k).map((cells) => {
        const mine = cells.reduce((a, c) => a + votes[c], 0);
        return { cells, mine, win: mine >= maj };
      });
      // Try efficient wins first (bare majorities), then cheap losses.
      options.sort((a, b) => (b.win - a.win) || (a.win ? a.mine - b.mine : a.mine - b.mine));
      for (const o of options) {
        for (const c of o.cells) free[c] = 0;
        if (patchesOk(free, n, k)) go(placed + 1, wins + (o.win ? 1 : 0), mineLeft - o.mine);
        for (const c of o.cells) free[c] = 1;
        if (best === ceiling) return;
      }
    }
    go(0, 0, total);
    return best;
  }

  // Your party gets a minority of voters, so winning takes clever lines.
  function generate(seed, n) {
    const rand = mulberry32(hashString(String(seed)));
    const mine = Math.round(n * n * (n === 5 ? 0.36 : 0.42));
    const votes = new Array(n * n).fill(0);
    const cells = [...votes.keys()];
    for (let i = 0; i < mine; i++) votes[cells.splice(Math.floor(rand() * cells.length), 1)[0]] = 1;
    return { n, votes, need: need(n) };
  }

  return { generate, solve, neighbors, need };
})();

if (typeof module !== "undefined") module.exports = DistrictsGen;

// When loaded as a Web Worker: solve off the main thread (7x7 can take seconds).
if (typeof importScripts === "function" && typeof document === "undefined") {
  onmessage = (e) => postMessage({ id: e.data.id, best: DistrictsGen.solve(e.data.votes, e.data.n) });
}
