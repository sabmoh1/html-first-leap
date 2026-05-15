/* Crash game engine — drives the static 1xbet HTML markup. */
(function () {
  "use strict";

  const SVG_W = 1230;
  const X0 = 47, Y0 = 385;
  const X1 = 1207, Y1 = 20;
  const COUNTDOWN_MS = 5000;
  const CRASH_HOLD_MS = 2500;
  const GROWTH = 0.00018;
  const MAX_M = 200;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const counterEl = $(".crash-game__counter");
  const strokeEl = $(".crash-game__stroke");
  // The static HTML ships an orange dot + sample text at end of stroke; remove.
  if (strokeEl) {
    const g = strokeEl.parentNode;
    if (g) {
      g.querySelectorAll("circle").forEach((c) => {
        if (c.getAttribute("fill") === "#de8a06") c.remove();
      });
    }
  }
  const planePin = $(".crash-game__pin--crash"); // shared element, we toggle modifier
  const planeShine = $(".crash-game__wrap .crash-game__shine");
  const waitingBox = $(".crash-game__waiting");
  const waitingText = $(".crash-game__text");
  const timerBox = $(".crash-game__timer");
  const timerCounter = $(".crash-timer__counter");
  const timerSegments = $$(".crash-timer__segment");
  const mountainsEl = $(".crash-game__mountains");

  const totalPlayersEl = $(".crash-total__value--players");
  const totalBetsEl = $(".crash-total__value--bets");
  const totalPrizeEl = $(".crash-total__value--prize");
  const resultsTable = $(".crash-results__table");
  const historyTable = $(".crash-history__table");
  const historyEmpty = $(".crash-history__empty");
  const svgEl = $(".crash-game__svg");

  if (!counterEl || !strokeEl) return;

  // Make the canvas fill the available width (covers right gap).
  if (svgEl) {
    svgEl.removeAttribute("width");
    svgEl.removeAttribute("height");
    svgEl.style.width = "100%";
    svgEl.style.height = "auto";
  }
  const styleFix = document.createElement("style");
  styleFix.textContent = `
    .crash-game__svg{width:100% !important;height:auto !important;display:block;}
    .crash-game__timeline{width:100%;}
    .crash-game__mountains{width:100%;}
    .crash__wrap--main{flex-grow:1;min-width:0;}
    .crash-game__counter{ fill:#fff !important; }
  `;
  document.head.appendChild(styleFix);

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function fmt(n, d = 2) { return Number(n).toFixed(d); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  // crash distribution: P(crash >= x) = 0.97 / x, with hard floor 1.05
  function sampleCrashPoint() {
    const r = Math.random() * 0.97; // exclude instant-crash band
    const x = 0.97 / (1 - r);
    return Math.min(MAX_M, Math.max(1.05, Math.floor(x * 100) / 100));
  }

  function curvePoint(m) {
    const t = Math.min(1, Math.log(m) / Math.log(15));
    const x = X0 + (X1 - X0) * t;
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

  function setMountainsRunning(run) {
    if (!mountainsEl) return;
    mountainsEl.classList.toggle("crash-game__mountains--game", !!run);
  }

  function setWaitingVisible(show, text) {
    if (!waitingBox) return;
    waitingBox.classList.toggle("crash-game__waiting--is-show", !!show);
    waitingBox.style.opacity = show ? "" : "0";
    waitingBox.style.pointerEvents = show ? "" : "none";
    if (text && waitingText) waitingText.textContent = text;
    // Always hide the inner orange "waiting" pin/shine — the app uses its own.
    const wp = waitingBox.querySelector(".crash-game__pin--waiting");
    const ws = waitingBox.querySelector(".crash-game__shine--waiting");
    if (wp) wp.style.display = "none";
    if (ws) ws.style.display = "none";
  }

  function setPlane(m, mode) {
    // mode: "hidden" | "fly" | "crash"
    if (!planePin || !planeShine) return;
    if (mode === "hidden") {
      planePin.style.display = "none";
      planeShine.style.display = "none";
      return;
    }
    const p = curvePoint(m);
    const leftPct = (p.x / SVG_W) * 100;
    const bottomPct = ((Y0 - p.y) / Y0) * 100;
    if (mode === "fly") {
      planePin.classList.remove("crash-game__pin--crash");
    } else if (mode === "crash") {
      planePin.classList.add("crash-game__pin--crash");
    }
    planePin.style.cssText =
      `display:block;left:${leftPct}%;bottom:${bottomPct}%;`;
    planeShine.style.cssText =
      `display:block;left:${leftPct}%;bottom:${(bottomPct + 4).toFixed(1)}%;`;
  }

  // ---- bets ----
  const NAMES_POOL = Array.from({ length: 60 }, () =>
    "*******" + Math.floor(rand(10, 99)));
  let activeBets = [];
  let totals = { players: 0, bets: 0, prize: 0 };

  function clearBets() {
    if (!resultsTable) return;
    $$(".crash-results-table__row", resultsTable).forEach((r, i) => {
      if (i > 0) r.remove();
    });
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

  function lossAllPending() {
    activeBets.forEach((b) => {
      if (!b.cashed) {
        const cells = b.row.querySelectorAll(".crash-results-table__cell");
        cells[1].textContent = " x0";
        b.row.classList.add("crash-results-table__row--loss");
      }
    });
  }

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
    const header = historyTable.firstElementChild;
    header.after(row);
    $$(".crash-history-table__row", historyTable).slice(31).forEach((r) => r.remove());
  }

  // ---- player buttons ----
  const playButtons = $$(".crash-bet-btn--play");
  const playerState = playButtons.map(() => ({ pending: null, active: null }));
  function setPlayBtn(idx, mode, mult) {
    const btn = playButtons[idx];
    if (!btn) return;
    const playText = btn.querySelector(".crash-bet-btn__text--play");
    const nextText = btn.querySelector(".crash-bet-btn__text--next-round");
    if (mode === "place") {
      playText.textContent = "Place a bet";
      if (nextText) nextText.style.display = "";
    } else if (mode === "pending") {
      playText.textContent = "Cancel";
      if (nextText) nextText.style.display = "";
    } else if (mode === "cashout") {
      playText.textContent = "Cash out " + fmt(mult) + "x";
      if (nextText) nextText.style.display = "none";
    } else if (mode === "won") {
      playText.textContent = "Won " + fmt(mult) + "x";
      if (nextText) nextText.style.display = "none";
    }
  }

  playButtons.forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".crash-bet__item");
      const input = item && item.querySelector(".bet-input");
      const amt = Math.max(1, parseFloat((input && input.value) || "10") || 10);
      const ps = playerState[idx];
      if (state.phase === "flying" && ps.active) {
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

  // ---- round loop ----
  const state = { phase: "idle", mult: 1, crashAt: 1, t0: 0 };
  let rafId = 0, tickId = 0;

  function startCountdown() {
    state.phase = "waiting";
    state.mult = 1;
    setMountainsRunning(false);              // pause clouds/mountains
    setPlane(1, "hidden");                   // no plane / no explosion
    strokeEl.setAttribute("d", `M${X0} ${Y0}`);
    counterEl.textContent = "";
    setWaitingVisible(false);                // hide orange waiting pin
    if (timerBox) timerBox.style.display = "";

    const startedAt = performance.now();
    const total = COUNTDOWN_MS;
    function tick() {
      const left = Math.max(0, total - (performance.now() - startedAt));
      const sec = Math.ceil(left / 1000);     // integer seconds
      if (timerCounter) timerCounter.textContent = String(sec);
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
    tickId = setInterval(tick, 100);
    tick();

    playerState.forEach((ps, idx) => {
      if (ps.pending) {
        ps.active = addBet("YOU", ps.pending.amount);
        ps.pending = null;
        setPlayBtn(idx, "cashout", 1);
      }
    });
    seedBots();
  }

  function seedBots() {
    clearBets();
    const n = Math.floor(rand(40, 90));
    for (let i = 0; i < n; i++) {
      const name = NAMES_POOL[Math.floor(Math.random() * NAMES_POOL.length)];
      const amt = Math.round(rand(10, 800) * 100) / 100;
      const bet = addBet(name, amt);
      bet._botCashoutAt = Math.random() < 0.85
        ? 1.05 + Math.pow(Math.random(), 2) * 6
        : null;
    }
  }

  function startFlight() {
    state.phase = "flying";
    state.crashAt = sampleCrashPoint();
    state.t0 = performance.now();
    setMountainsRunning(true);                // resume clouds/mountains
    if (timerBox) timerBox.style.display = "none";
    setPlane(1, "fly");                       // show airplane sprite at start

    function frame(now) {
      const dt = now - state.t0;
      const m = Math.min(state.crashAt, Math.exp(GROWTH * dt));
      state.mult = m;
      counterEl.textContent = fmt(m) + "x ";
      strokeEl.setAttribute("d", buildPath(m));
      setPlane(m, "fly");

      playerState.forEach((ps, idx) => {
        if (ps.active) setPlayBtn(idx, "cashout", m);
      });
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
    setMountainsRunning(false);               // pause on crash
    counterEl.textContent = fmt(state.crashAt) + "x";
    setWaitingVisible(true, `Crashed at ${fmt(state.crashAt)}x`);
    setPlane(state.crashAt, "crash");         // explosion sprite, in place
    lossAllPending();
    addHistory(state.crashAt);
    playerState.forEach((ps, idx) => {
      ps.active = null;
      setPlayBtn(idx, "place");
    });
    setTimeout(startCountdown, CRASH_HOLD_MS);
  }

  setTimeout(startCountdown, 400);
})();
