(() => {
  const SYMBOLS = ["🍎", "🚀", "🎲", "🌵", "🐙", "⚡", "🎧", "🍩"];
  const BEST_KEY = "dtg.memory.best";

  const board = document.getElementById("board");
  const movesEl = document.getElementById("moves");
  const bestEl = document.getElementById("best");
  const statusEl = document.getElementById("status");

  let first, second, lock, moves, matched;
  let best = Number(safeGet(BEST_KEY)) || 0;
  if (best) bestEl.textContent = best;

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function newGame() {
    first = second = null;
    lock = false;
    moves = 0;
    matched = 0;
    movesEl.textContent = 0;
    statusEl.textContent = "";
    board.replaceChildren(
      ...shuffle([...SYMBOLS, ...SYMBOLS]).map((sym) => {
        const btn = document.createElement("button");
        btn.className = "card";
        btn.dataset.sym = sym;
        btn.setAttribute("aria-label", "Hidden card");
        btn.addEventListener("click", () => flip(btn));
        return btn;
      })
    );
  }

  function show(card, open) {
    card.textContent = open ? card.dataset.sym : "";
    card.classList.toggle("open", open);
    card.setAttribute("aria-label", open ? card.dataset.sym : "Hidden card");
  }

  function flip(card) {
    if (lock || card === first || card.classList.contains("done")) return;
    show(card, true);
    if (!first) { first = card; return; }

    second = card;
    moves++;
    movesEl.textContent = moves;

    if (first.dataset.sym === second.dataset.sym) {
      first.classList.add("done");
      second.classList.add("done");
      first = second = null;
      matched += 2;
      if (matched === SYMBOLS.length * 2) win();
    } else {
      lock = true;
      setTimeout(() => {
        show(first, false);
        show(second, false);
        first = second = null;
        lock = false;
      }, 700);
    }
  }

  function win() {
    let msg = `Done in ${moves} moves!`;
    if (!best || moves < best) {
      best = moves;
      bestEl.textContent = best;
      safeSet(BEST_KEY, best);
      msg += " New best.";
    }
    statusEl.textContent = msg;
  }

  document.getElementById("restart").addEventListener("click", newGame);
  newGame();
})();
