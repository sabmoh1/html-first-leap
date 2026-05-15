/* Crash game engine — drives the static 1xbet HTML markup with a
   simulated round loop matching real WebSocket round semantics:
   waiting countdown -> flying (multiplier curve) -> crash -> repeat.
   Updates: SVG curve, plane pin, shine, multiplier text, timer,
   live bets list (green on cashout, red on crash), totals,
   history table. Mountains/clouds animation pauses on crash/wait. */
(function () {
  "use strict";

  // ---------- Constants ----------
  const SVG_W = 1230, SVG_H = 420;
  const X0 = 47, Y0 = 385;          // origin (ground-left)
  const X1 = 1207, Y1 = 20;         // top-right bound
  const COUNTDOWN_MS = 5000;        // pre-flight wait
  const CRASH_HOLD_MS = 2500;       // post-crash hold
  const GROWTH = 0.00018;           // multiplier growth per ms (~e^kt)
  const MAX_M = 200;

  // ---------- DOM ----------
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const counterEl = $(".crash-game__counter");
  const strokeEl = $(".crash-game__stroke");
  const planeShine = $(".crash-game__wrap .crash-game__shine");
  const planePin = $(".crash-game__pin--crash");
  const waitingBox = $(".crash-game__waiting");
  const waitingText = $(".crash-game__text");
  const timerBox = $(".crash-game__timer");
  const timerCounter = $(".crash-timer__counter");
  const timerSegments = $$(".crash-timer__segment");
  const gameRoot = $(".crash__game");
  const mountainsEl = $(".crash-game__mountains");

  const totalPlayersEl = $(".crash-total__value--players");
  const totalBetsEl = $(".crash-total__value--bets");
  const totalPrizeEl = $(".crash-total__value--prize");
  const resultsTable = $(".crash-results__table");
  const historyTable = $(".crash-history__table");
  const historyEmpty = $(".crash-history__empty");

  if (!counterEl || !strokeEl) return;

  // ---------- Pause CSS (clouds/mountains/animations) ----------
  const css = document.createElement("style");
  css.textContent = `
    .crash-game.crash-game--paused .crash-game__mountains *,
    .crash-game.crash-game--paused .crash-game__mountain,
    .crash-game.crash-game--paused [class*="cloud"],
    .crash-game.crash-game--paused .crash-game__bg,
    .crash-game.crash-game--paused .crash-game__bg * {
      animation-play-state: paused !important;
    }
    .crash-game__counter.is-crashed { fill: #ff3b3b; }
    .crash-results-table__row { transition: background-color .25s; }
  `;
  document.head.appendChild(css);

  // ---------- Helpers ----------
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function fmt(n, d = 2) { return Number(n).toFixed(d); }

  // House-edge crash distribution: P(crash >= x) = 0.97 / x
  function sampleCrashPoint() {
    const r = Math.random();
    if (r < 0.03) return 1.00;
    const x = 0.97 / (1 - r);
    return Math.min(MAX_M, Math.max(1.01, Math.floor(x * 100) / 100));
  }

  function curvePoint(m) {
    // map multiplier -> normalized progress [0..1]
    const t = Math.min(1, Math.log(m) / Math.log(15)); // visual scale: 15x fills view
    const x = X0 + (X1 - X0) * t;
    // y is parabolic: more curve at higher multipliers
    const norm = t * t;
    const y = Y0 - (Y0 - Y1) * norm;
    return { x, y, t };
  }

  function buildPath(m) {
    const steps = 48;
    let d = `M${X0} ${Y0}`;
    for (let i = 1; i <= steps; i++) {
      const cm = 1 + (m - 1) * (i / steps);
      const p = curvePoint(cm);
      d += ` L${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    }
    return d;
  }

  function setPlane(m, visible) {
    if (!planePin || !planeShine) return;
    if (!visible) {
      planePin.style.display = "none";
      planeShine.style.display = "none";
      return;
    }
    const p = curvePoint(m);
    const leftPct = (p.x / SVG_W) * 100;
    const bottomPct = ((Y0 - p.y) / Y0) * 100;
    // approximate tangent angle
    const eps = 0.001;
    const p2 = curvePoint(m * (1 + eps));
    const dx = p2.x - p.x, dy = p2.y - p.y;
    const ang = Math.atan2(dy, dx) * 180 / Math.PI; // negative since y up
    planePin.style.cssText =
      `display:block;left:${leftPct}%;bottom:${bottomPct}%;transform:rotate(${ang.toFixed(1)}deg);`;
    planeShine.style.cssText =
      `display:block;left:${leftPct}%;bottom:${(bottomPct + 4).toFixed(1)}%;`;
  }

  // ---------- Live bets ----------
  const NAMES_POOL = Array.from({ length: 60 }, () =>
    "*******" + Math.floor(rand(10, 99)));
  let activeBets = []; // {id,name,bet,cashed,cashAt,win,row}
  let totals = { players: 0, bets: 0, prize: 0 };

  function clearBets() {
    if (!resultsTable) return;
    $$(".crash-results-table__row", resultsTable)
      .forEach((r, i) => { if (i > 0) r.remove(); });
    activeBets = [];
    totals = { players: 0, bets: 0, prize: 0 };
    syncTotals();
  }

  function syncTotals() {
    if (totalPlayersEl) totalPlayersEl.textContent = totals.players;
    if (totalBetsEl) totalBetsEl.textContent = fmt(totals.bets) + " RUB";
    if (totalPrizeEl) totalPrizeEl.textContent = fmt(totals.prize) + " RUB";
  }

  function addBet(name, amount) {
    if (!resultsTable) return null;
    const row = document.createElement("div");
    row.className = "crash-results-table__row";
    row.innerHTML =
      `<p class="crash-results-table__cell">${name}</p>` +
      `<p class="crash-results-table__cell"> x0</p>` +
      `<p class="crash-results-table__cell">${fmt(amount)} RUB</p>` +
      `<p class="crash-results-table__cell">0 RUB</p>`;
    resultsTable.appendChild(row);
    const bet = { name, bet: amount, cashed: false, cashAt: 0, win: 0, row };
    activeBets.push(bet);
    totals.players++;
    totals.bets += amount;
    syncTotals();
    return bet;
  }

  function cashoutBet(bet, mult) {
    if (bet.cashed) return;
    bet.cashed = true;
    bet.cashAt = mult;
    bet.win = bet.bet * mult;
    totals.prize += bet.win;
    syncTotals();
    const cells = bet.row.querySelectorAll(".crash-results-table__cell");
    cells[1].textContent = " x" + fmt(mult);
    cells[3].textContent = fmt(bet.win) + " RUB";
    bet.row.classList.add("crash-results-table__row--win");
  }

  function lossAllPending(crashAt) {
    activeBets.forEach((b) => {
      if (!b.cashed) {
        const cells = b.row.querySelectorAll(".crash-results-table__cell");
        cells[1].textContent = " x0";
        b.row.classList.add("crash-results-table__row--loss");
      }
    });
  }

  // ---------- History ----------
  function addHistory(crashAt) {
    if (!historyTable) return;
    if (historyEmpty) historyEmpty.style.display = "none";
    const now = new Date();
    const date = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const id = Math.floor(rand(100000000, 999999999));
    const cls = crashAt < 2 ? "crash-history-table__row--loss" :
                crashAt >= 10 ? "crash-history-table__row--win" : "";
    const row = document.createElement("div");
    row.className = "crash-history-table__row " + cls;
    row.innerHTML =
      `<p class="crash-history-table__cell">${date}</p>` +
      `<p class="crash-history-table__cell">${time}</p>` +
      `<p class="crash-history-table__cell">${id}</p>` +
      `<p class="crash-history-table__cell">—</p>` +
      `<p class="crash-history-table__cell">—</p>` +
      `<p class="crash-history-table__cell">—</p>` +
      `<p class="crash-history-table__cell" style="color:${crashAt<2?'#ff3b3b':'#28c76f'}">x${fmt(crashAt)}</p>`;
    // insert just after header row
    const header = historyTable.firstElementChild;
    header.after(row);
    // keep last 30
    const rows = $$(".crash-history-table__row", historyTable);
    rows.slice(31).forEach((r) => r.remove());
  }

  // ---------- Player bet (Place a bet / Cash out) ----------
  const playButtons = $$(".crash-bet-btn--play");
  const playerState = playButtons.map(() => ({ pending: null, active: null }));
  function setPlayBtn(idx, mode, mult) {
    const btn = playButtons[idx];
    if (!btn) return;
    const playText = btn.querySelector(".crash-bet-btn__text--play");
    const nextText = btn.querySelector(".crash-bet-btn__text--next-round");
    if (mode === "place") {
      playText.textContent = "Place a bet";
      nextText.style.display = "";
      btn.style.background = "";
    } else if (mode === "pending") {
      playText.textContent = "Cancel";
      nextText.style.display = "";
    } else if (mode === "cashout") {
      playText.textContent = "Cash out " + fmt(mult) + "x";
      nextText.style.display = "none";
    } else if (mode === "won") {
      playText.textContent = "Won " + fmt(mult) + "x";
      nextText.style.display = "none";
    }
  }

  playButtons.forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".crash-bet__item");
      const input = item && item.querySelector(".bet-input");
      const amt = Math.max(1, parseFloat((input && input.value) || "10") || 10);
      const ps = playerState[idx];
      if (state.phase === "flying" && ps.active) {
        // Cash out
        cashoutBet(ps.active, state.mult);
        setPlayBtn(idx, "won", state.mult);
        ps.active = null;
      } else if (state.phase === "flying" && !ps.active && !ps.pending) {
        ps.pending = { amount: amt };
        setPlayBtn(idx, "pending");
      } else if (state.phase !== "flying") {
        if (ps.pending) {
          ps.pending = null;
          setPlayBtn(idx, "place");
        } else {
          ps.pending = { amount: amt };
          setPlayBtn(idx, "pending");
        }
      }
    });
  });
  $$(".crash-bet-control__btn").forEach((b) => {
    b.addEventListener("click", () => {
      const item = b.closest(".crash-bet__item");
      const input = item && item.querySelector(".bet-input");
      if (input) input.value = b.textContent.trim();
    });
  });

  // ---------- Round loop ----------
  const state = { phase: "idle", mult: 1, crashAt: 1, t0: 0 };
  let rafId = 0, tickId = 0;

  function setPaused(paused) {
    if (!gameRoot) return;
    gameRoot.classList.toggle("crash-game--paused", paused);
  }

  function startCountdown() {
    state.phase = "waiting";
    state.mult = 1;
    setPaused(true);
    // hide plane, blank curve, show timer
    setPlane(1, false);
    strokeEl.setAttribute("d", `M${X0} ${Y0}`);
    counterEl.textContent = "";
    counterEl.classList.remove("is-crashed");
    if (timerBox) timerBox.style.display = "";
    if (waitingBox) waitingBox.style.display = "none";

    const startedAt = performance.now();
    const total = COUNTDOWN_MS;
    function tick() {
      const left = Math.max(0, total - (performance.now() - startedAt));
      const sec = (left / 1000);
      if (timerCounter) timerCounter.textContent = sec.toFixed(1);
      const filled = Math.round((1 - left / total) * timerSegments.length);
      timerSegments.forEach((s, i) => {
        s.style.opacity = i < filled ? "0.25" : "1";
      });
      if (left <= 0) {
        clearInterval(tickId);
        startFlight();
      }
    }
    clearInterval(tickId);
    tickId = setInterval(tick, 50);
    tick();

    // promote pending bets to active
    playerState.forEach((ps, idx) => {
      if (ps.pending) {
        ps.active = addBet("YOU", ps.pending.amount);
        ps.pending = null;
        setPlayBtn(idx, "cashout", 1);
      }
    });
    // seed bots
    seedBots();
  }

  function seedBots() {
    clearBets();
    const n = Math.floor(rand(40, 90));
    for (let i = 0; i < n; i++) {
      const name = NAMES_POOL[Math.floor(Math.random() * NAMES_POOL.length)];
      const amt = Math.round(rand(10, 800) * 100) / 100;
      const bet = addBet(name, amt);
      // pre-decide bot cashout
      bet._botCashoutAt = Math.random() < 0.85
        ? 1.05 + Math.pow(Math.random(), 2) * 6
        : null;
    }
    // re-add player bets at top
    playerState.forEach((ps, idx) => {
      if (ps.active) {
        ps.active = addBet("YOU", ps.active.bet);
        setPlayBtn(idx, "cashout", 1);
      }
    });
  }

  function startFlight() {
    state.phase = "flying";
    state.crashAt = sampleCrashPoint();
    state.t0 = performance.now();
    setPaused(false);
    if (timerBox) timerBox.style.display = "none";

    function frame(now) {
      const dt = now - state.t0;
      const m = Math.min(state.crashAt, Math.exp(GROWTH * dt));
      state.mult = m;
      counterEl.textContent = fmt(m) + "x ";
      strokeEl.setAttribute("d", buildPath(m));
      setPlane(m, true);

      // update player cashout button label
      playerState.forEach((ps, idx) => {
        if (ps.active) setPlayBtn(idx, "cashout", m);
      });
      // bot cashouts
      activeBets.forEach((b) => {
        if (!b.cashed && b._botCashoutAt && m >= b._botCashoutAt) {
          cashoutBet(b, b._botCashoutAt);
        }
      });

      if (m >= state.crashAt) {
        crash();
        return;
      }
      rafId = requestAnimationFrame(frame);
    }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(frame);
  }

  function crash() {
    state.phase = "crashed";
    setPaused(true);
    counterEl.textContent = fmt(state.crashAt) + "x";
    counterEl.classList.add("is-crashed");
    if (waitingText) waitingText.textContent = `Crashed at ${fmt(state.crashAt)}x`;
    if (waitingBox) waitingBox.style.display = "";
    setPlane(state.crashAt, false);
    lossAllPending(state.crashAt);
    addHistory(state.crashAt);
    // reset player buttons
    playerState.forEach((ps, idx) => {
      ps.active = null;
      setPlayBtn(idx, "place");
    });
    setTimeout(startCountdown, CRASH_HOLD_MS);
  }

  // boot
  setTimeout(startCountdown, 400);
})();
