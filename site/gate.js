// Shared password gate. NOT real security: anyone who reads this file can
// bypass it. It only keeps casual visitors out of the games.
//
// To change the password: open any page, run  dtgGate.hash("new password")
// in the browser console, and paste the result into HASH below.
// Changing it also logs out everyone who unlocked with the old one.
(function () {
  "use strict";

  var HASH = "f6359ad7bc1a7"; // dtgGate.hash(password); keep the password itself out of this file
  var KEY = "dtg:unlocked";

  // cyrb53: small, fast, non-cryptographic string hash.
  function hash(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* ignore */ } }

  window.dtgGate = {
    hash: hash,
    lock: function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      location.reload();
    }
  };

  if (get() === HASH) return;

  var root = document.documentElement;
  root.classList.add("gate-locked");

  // Keep game keyboard handlers (arrows, space...) from seeing keys while locked.
  function block(e) { e.stopPropagation(); }
  window.addEventListener("keydown", block, true);
  window.addEventListener("keyup", block, true);

  function build() {
    var form = document.createElement("form");
    form.className = "gate";
    form.innerHTML =
      '<h1>DTG Games</h1>' +
      '<p class="sub">Enter the password to play.</p>' +
      '<input type="password" autocomplete="current-password" aria-label="Password" placeholder="Password" required>' +
      '<button type="submit">Unlock</button>' +
      '<p class="gate-error" role="alert"></p>';
    document.body.appendChild(form);

    var input = form.querySelector("input");
    var error = form.querySelector(".gate-error");
    input.focus();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (hash(input.value.trim()) === HASH) {
        set(HASH);
        window.removeEventListener("keydown", block, true);
        window.removeEventListener("keyup", block, true);
        form.remove();
        root.classList.remove("gate-locked");
      } else {
        error.textContent = "Wrong password.";
        input.select();
      }
    });
  }

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();
