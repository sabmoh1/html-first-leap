/* Crash game engine v3 — drives the static 1xbet HTML markup. */
(function () {
  "use strict";

  // ---------- constants / geometry ----------
  const SVG_W = 1230, SVG_H = 420;
  const X0 = 47, Y0 = 385;     // start
  const X1 = 1100, Y1 = 60;    // top-right plateau (plane stays here on big m)
  const COUNTDOWN_SEC = 6;     // visible dots count
  const CRASH_HOLD_MS = 2200;
  const GROWTH = 0.00022;
  const MAX_M = 1000;
  const SPLASH_MS = 4000;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // ---------- splash overlay ----------
  function mountSplash() {
    if (document.getElementById("cg-splash")) return;
    const s = document.createElement("div");
    s.id = "cg-splash";
    s.innerHTML =
      '<div class="cg-splash__inner">' +
      '<img src="/wifi-spinner.svg" alt="Connecting" />' +
      '<p>Connecting...</p>' +
      '</div>';
    document.body.appendChild(s);
    setTimeout(() => { s.style.opacity = "0"; setTimeout(() => s.remove(), 400); }, SPLASH_MS);
  }

  // ---------- main boot ----------
  function boot() {
    mountSplash();

    const counterEl = $(".crash-game__counter");
    const counterGroup = counterEl && counterEl.parentNode;
    const strokeEl = $(".crash-game__stroke");
    const planePin = $(".crash-game__wrap .crash-game__pin");
    const planeShine = $(".crash-game__wrap .crash-game__shine");
    const waitingBox = $(".crash-game__waiting");
    const timerBox = $(".crash-game__timer");
    const timerCounter = $(".crash-timer__counter");
    const timerSegments = $$(".crash-timer__segment");
    const mountainsEl = $(".crash-game__mountains");
    const svgEl = $(".crash-game__svg");

    const totalPlayersEl = $(".crash-total__value--players");
    const totalBetsEl = $(".crash-total__value--bets");
    const totalPrizeEl = $(".crash-total__value--prize");
    const resultsTable = $(".crash-results__table");
    const historyTable = $(".crash-history__table");
    const historyEmpty = $(".crash-history__empty");

    if (!counterEl || !strokeEl) return;

    // make counter group visible
    if (counterGroup) counterGroup.style.display = "";
    if (waitingBox) waitingBox.style.display = "none";

    // remove built-in orange dot at end of stroke (we control our own crash dot)
    const strokeParent = strokeEl.parentNode;
    if (strokeParent) {
      strokeParent.querySelectorAll("circle").forEach(c => {
        if (c.getAttribute("fill") === "#de8a06") c.remove();
      });
    }

    // expand SVG to fill width; allow it to grow
    if (svgEl) {
      svgEl.removeAttribute("width");
      svgEl.removeAttribute("height");
      svgEl.setAttribute("preserveAspectRatio", "none");
    }

    // inject CSS
    const css = document.createElement("style");
    css.textContent = `
      .crash-game__svg{width:100% !important;height:auto !important;display:block;}
      .crash__wrap--main{flex-grow:1;min-width:0;}
      .crash-game__counter{fill:#fff !important;font-weight:700;}
      /* hide the orange ground glow (mountain layer 1 is the orange tint) */
      .crash-game__mountain:not([class*="--"]){opacity:0 !important;}
      /* beam under plane */
      .cg-beam{position:absolute;pointer-events:none;width:240px;height:140px;
        transform:translate(-50%,-30%);opacity:0;transition:opacity .25s;
        background:radial-gradient(closest-side,
          rgba(255,170,60,.55) 0%,
          rgba(255,120,30,.35) 40%,
          rgba(255,90,20,0) 75%);
        mix-blend-mode:screen;filter:blur(6px);z-index:1;}
      .cg-beam.is-on{opacity:1;}
      /* crash circle (orange) */
      .cg-crash-dot{position:absolute;width:36px;height:36px;border-radius:50%;
        background:radial-gradient(circle,#ffb347 0%,#de8a06 55%,rgba(222,138,6,0) 80%);
        transform:translate(-50%,50%);pointer-events:none;display:none;z-index:3;
        box-shadow:0 0 30px 8px rgba(222,138,6,.7);}
      /* tilt plane */
      .crash-game__pin{transform-origin:50% 50%;}
      /* pause clouds during waiting / crash */
      .crash-game__mountains.cg-paused .crash-game__mountain{animation-play-state:paused !important;}

      /* splash */
      #cg-splash{position:fixed;inset:0;background:#1d4268;display:flex;
        align-items:center;justify-content:center;z-index:99999;
        transition:opacity .35s ease;}
      #cg-splash .cg-splash__inner{display:flex;flex-direction:column;align-items:center;gap:18px;}
      #cg-splash img{width:140px;height:140px;background:transparent !important;border-radius:50%;}
      #cg-splash p{color:#b8deff;font-family:system-ui,-apple-system,sans-serif;
        font-size:18px;letter-spacing:.5px;margin:0;}

      /* countdown dots above the timer */
      .cg-dots{position:absolute;top:-26px;left:50%;transform:translateX(-50%);
        display:flex;gap:8px;}
      .cg-dot{width:9px;height:9px;border-radius:50%;background:#fff;opacity:.85;
        transition:transform .25s ease,opacity .2s,background .2s;}
      .cg-dot.is-last{background:#ff8a1f;}
      .cg-dot.is-jump{transform:translateY(-12px);}
      .cg-dot.is-gone{opacity:0;transform:translateY(8px);}

      /* bet button states */
      .crash-bet-btn--play.cg-loading .crash-bet-btn__text--play{visibility:hidden;}
      .crash-bet-btn--play.cg-loading::after{
        content:"";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
        width:42px;height:10px;background-image:
          radial-gradient(circle,#fff 40%,transparent 42%),
          radial-gradient(circle,#fff 40%,transparent 42%),
          radial-gradient(circle,#fff 40%,transparent 42%);
        background-size:10px 10px;background-repeat:no-repeat;
        background-position:0 50%,50% 50%,100% 50%;
        animation:cg-dots-blink 1s infinite;}
      @keyframes cg-dots-blink{
        0%,100%{opacity:.3}50%{opacity:1}}
      .crash-bet-btn--play.cg-collect{
        background:linear-gradient(180deg,#ffd84a,#f0a800) !important;
        color:#1a1a1a !important;}
      .crash-bet-btn--play.cg-collect .crash-bet-btn__text--play{color:#1a1a1a;}

      /* toasts */
      .cg-toast{position:absolute;left:50%;top:30px;transform:translateX(-50%);
        background:rgba(35,40,48,.92);border:1px solid rgba(255,255,255,.08);
        padding:10px 22px;border-radius:8px;color:#fff;font-weight:600;
        font-family:system-ui,sans-serif;font-size:14px;z-index:50;
        animation:cg-toast-in .25s ease;}
      .cg-toast--placed{color:#28c76f;}
      .cg-result{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);
        background:rgba(35,40,48,.95);border:1px solid rgba(255,255,255,.1);
        padding:18px 34px;border-radius:12px;text-align:center;
        font-family:system-ui,sans-serif;font-weight:700;font-size:20px;z-index:60;
        animation:cg-toast-in .25s ease;box-shadow:0 10px 40px rgba(0,0,0,.5);}
      .cg-result--win{color:#28c76f;}
      .cg-result--loss{color:#ff3b3b;}
      @keyframes cg-toast-in{from{opacity:0;transform:translate(-50%,-10px);}to{opacity:1;}}

      /* history rows */
      .crash-history-table__row--win .crash-history-table__cell{color:#28c76f !important;}
      .crash-history-table__row--loss .crash-history-table__cell{color:#ff3b3b !important;}
    `;
    document.head.appendChild(css);

    // tilt plane element baseline
    if (planePin) {
      planePin.style.transformOrigin = "50% 50%";
    }

    // host element for plane/beam positioning
    const gameHost = $(".crash-game") || $(".crash-game__timeline");
    if (gameHost) gameHost.style.position = "relative";

    // beam + crash dot
    const beam = document.createElement("div");
    beam.className = "cg-beam";
    gameHost && gameHost.appendChild(beam);
    const crashDot = document.createElement("div");
    crashDot.className = "cg-crash-dot";
    gameHost && gameHost.appendChild(crashDot);

    // countdown dots
    let dotsWrap = null;
    if (timerBox) {
      timerBox.style.position = "relative";
      dotsWrap = document.createElement("div");
      dotsWrap.className = "cg-dots";
      for (let i = 0; i < COUNTDOWN_SEC; i++) {
        const d = document.createElement("span");
        d.className = "cg-dot" + (i === COUNTDOWN_SEC - 1 ? " is-last" : "");
        dotsWrap.appendChild(d);
      }
      timerBox.appendChild(dotsWrap);
    }

    // helpers
    const pad = n => n < 10 ? "0" + n : "" + n;
    const fmt = (n, d = 2) => Number(n).toFixed(d);
    const rand = (a, b) => a + Math.random() * (b - a);

    function sampleCrashPoint() {
      const r = Math.random() * 0.97;
      const x = 0.97 / (1 - r);
      return Math.min(MAX_M, Math.max(1.05, Math.floor(x * 100) / 100));
    }

    function curvePoint(m) {
      // map multiplier -> normalized t along curve, clamp so plane stops near top
      const t = Math.min(1, Math.log(Math.max(1, m)) / Math.log(20));
      const x = X0 + (X1 - X0) * t;
      const y = Y0 - (Y0 - Y1) * (t * t);
      // tangent angle (degrees) for plane tilt
      const eps = 0.001;
      const t2 = Math.min(1, t + eps);
      const x2 = X0 + (X1 - X0) * t2;
      const y2 = Y0 - (Y0 - Y1) * (t2 * t2);
      const ang = -Math.atan2(y2 - y, x2 - x) * 180 / Math.PI; // positive = nose up
      return { x, y, t, angle: ang };
    }

    function buildPath(m) {
      const steps = 56;
      let d = `M${X0} ${Y0}`;
      for (let i = 1; i <= steps; i++) {
        const cm = 1 + (m - 1) * (i / steps);
        const p = curvePoint(cm);
        d += ` L${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
      }
      return d;
    }

    function pctPos(p) {
      // convert svg coords to % of host (which renders the svg at full width)
      const rect = svgEl.getBoundingClientRect();
      const hostRect = gameHost.getBoundingClientRect();
      const px = (p.x / SVG_W) * rect.width + (rect.left - hostRect.left);
      const py = (p.y / SVG_H) * rect.height + (rect.top - hostRect.top);
      return { px, py };
    }

    function placePlane(m, mode) {
      if (!planePin) return;
      if (mode === "hidden") {
        planePin.style.display = "none";
        planeShine && (planeShine.style.display = "none");
        beam.classList.remove("is-on");
        return;
      }
      const p = curvePoint(m);
      const { px, py } = pctPos(p);
      planePin.style.display = "block";
      planePin.style.left = px + "px";
      planePin.style.bottom = "auto";
      planePin.style.top = py + "px";
      planePin.style.position = "absolute";
      planePin.style.transform = `translate(-50%, -50%) rotate(${(-p.angle).toFixed(1)}deg)`;
      if (mode === "crash") {
        planePin.classList.add("crash-game__pin--crash");
        beam.classList.remove("is-on");
      } else {
        planePin.classList.remove("crash-game__pin--crash");
        beam.classList.add("is-on");
        beam.style.left = px + "px";
        beam.style.top = (py + 30) + "px";
      }
      if (planeShine) {
        planeShine.style.display = "block";
        planeShine.style.position = "absolute";
        planeShine.style.left = px + "px";
        planeShine.style.top = py + "px";
      }
    }

    function showCrashDot(m) {
      const p = curvePoint(m);
      const { px, py } = pctPos(p);
      crashDot.style.left = px + "px";
      crashDot.style.top = py + "px";
      crashDot.style.display = "block";
    }
    function hideCrashDot() { crashDot.style.display = "none"; }

    function setMountainsRunning(run) {
      if (!mountainsEl) return;
      mountainsEl.classList.toggle("cg-paused", !run);
    }

    // ---------- bets (bots) ----------
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
      if (totalBetsEl) totalBetsEl.textContent = fmt(totals.bets) + " DZDM";
      if (totalPrizeEl) totalPrizeEl.textContent = fmt(totals.prize) + " DZDM";
    }
    function addBet(name, amount) {
      if (!resultsTable) return null;
      const row = document.createElement("div");
      row.className = "crash-results-table__row";
      row.innerHTML =
        `<p class="crash-results-table__cell">${name}</p>` +
        `<p class="crash-results-table__cell"> x0</p>` +
        `<p class="crash-results-table__cell">${fmt(amount)} DZDM</p>` +
        `<p class="crash-results-table__cell">0 DZDM</p>`;
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
      cells[3].textContent = fmt(bet.win) + " DZDM";
      bet.row.classList.add("crash-results-table__row--win");
    }
    function lossAllPending() {
      activeBets.forEach(b => {
        if (!b.cashed) {
          const cells = b.row.querySelectorAll(".crash-results-table__cell");
          cells[1].textContent = " x0";
          b.row.classList.add("crash-results-table__row--loss");
        }
      });
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

    // ---------- history (user only) ----------
    function addHistoryUser(crashAt, userBet, userWin, isWin) {
      if (!historyTable) return;
      if (historyEmpty) historyEmpty.style.display = "none";
      const now = new Date();
      const date = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}`;
      const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const id = Math.floor(rand(100000000, 999999999));
      const row = document.createElement("div");
      row.className = "crash-history-table__row " +
        (isWin ? "crash-history-table__row--win" : "crash-history-table__row--loss");
      row.innerHTML =
        `<p class="crash-history-table__cell">${date}</p>` +
        `<p class="crash-history-table__cell">${time}</p>` +
        `<p class="crash-history-table__cell">${id}</p>` +
        `<p class="crash-history-table__cell">${fmt(userBet)}</p>` +
        `<p class="crash-history-table__cell">x${fmt(isWin ? (userWin/userBet) : 0)}</p>` +
        `<p class="crash-history-table__cell">${fmt(isWin ? userWin : 0)}</p>` +
        `<p class="crash-history-table__cell">x${fmt(crashAt)}</p>`;
      const header = historyTable.firstElementChild;
      header.after(row);
      $$(".crash-history-table__row", historyTable).slice(31).forEach(r => r.remove());
    }

    // ---------- modals/toasts ----------
    function toast(text, cls, ttl) {
      const t = document.createElement("div");
      t.className = "cg-toast " + (cls || "");
      t.textContent = text;
      gameHost.appendChild(t);
      setTimeout(() => t.remove(), ttl || 1500);
    }
    function resultModal(win, mult) {
      const t = document.createElement("div");
      t.className = "cg-result " + (win ? "cg-result--win" : "cg-result--loss");
      t.innerHTML = win
        ? `You Won<br><span style="font-size:28px">x${fmt(mult)}</span>`
        : `You Lose<br><span style="font-size:14px;font-weight:500;opacity:.85">Better luck next time</span>`;
      gameHost.appendChild(t);
      setTimeout(() => t.remove(), 1800);
    }

    // ---------- player buttons ----------
    const playButtons = $$(".crash-bet-btn--play");
    const playerState = playButtons.map(() => ({
      pending: null, active: null, lastBet: 0, mode: "place"
    }));

    function setBtnText(btn, text) {
      const t = btn.querySelector(".crash-bet-btn__text--play");
      if (t) t.textContent = text;
    }
    function setBtnMode(idx, mode, extra) {
      const btn = playButtons[idx];
      if (!btn) return;
      playerState[idx].mode = mode;
      btn.classList.remove("cg-loading", "cg-collect");
      if (mode === "place") setBtnText(btn, "Place a bet");
      else if (mode === "loading") { btn.classList.add("cg-loading"); }
      else if (mode === "pending") setBtnText(btn, "Cancel");
      else if (mode === "collect") {
        btn.classList.add("cg-collect");
        setBtnText(btn, "Collect " + fmt(extra) + "x");
      } else if (mode === "won") {
        btn.classList.add("cg-collect");
        setBtnText(btn, "Won x" + fmt(extra));
      }
    }

    playButtons.forEach((btn, idx) => {
      // ensure relative for ::after
      btn.style.position = "relative";
      btn.addEventListener("click", () => {
        const ps = playerState[idx];
        const item = btn.closest(".crash-bet__item");
        const input = item && item.querySelector(".bet-input");
        const amt = Math.max(1, parseFloat((input && input.value) || "10") || 10);

        // mid-flight collect
        if (state.phase === "flying" && ps.active) {
          cashoutBet(ps.active, state.mult);
          const win = ps.active.win;
          addHistoryUser(state.crashAt, ps.active.bet, win, true);
          resultModal(true, state.mult);
          setBtnMode(idx, "won", state.mult);
          ps.active = null;
          return;
        }
        // cancel pending
        if (ps.mode === "pending") {
          ps.pending = null;
          setBtnMode(idx, "place");
          return;
        }
        // placing
        if (ps.mode === "place") {
          ps.lastBet = amt;
          setBtnMode(idx, "loading");
          setTimeout(() => {
            ps.pending = { amount: amt };
            toast("Bet Placed", "cg-toast--placed", 1200);
            if (state.phase === "flying") {
              // direct collect mode (next round will activate)
              setBtnMode(idx, "pending");
            } else {
              setBtnMode(idx, "pending");
            }
          }, 900);
        }
      });
    });

    $$(".crash-bet-control__btn").forEach(b => {
      b.addEventListener("click", () => {
        const item = b.closest(".crash-bet__item");
        const input = item && item.querySelector(".bet-input");
        if (input) input.value = b.textContent.trim();
      });
    });

    // ---------- round loop ----------
    const state = { phase: "idle", mult: 1, crashAt: 1, t0: 0 };
    let rafId = 0, tickId = 0;

    function runDots() {
      if (!dotsWrap) return;
      const dots = $$(".cg-dot", dotsWrap);
      dots.forEach(d => d.classList.remove("is-jump", "is-gone"));
      let i = 0;
      const total = dots.length;
      const stepMs = (COUNTDOWN_SEC * 1000) / total;
      function step() {
        if (i >= total) return;
        const d = dots[i];
        d.classList.add("is-jump");
        setTimeout(() => {
          d.classList.remove("is-jump");
          d.classList.add("is-gone");
        }, stepMs * 0.6);
        i++;
        if (i < total) setTimeout(step, stepMs);
      }
      step();
    }

    function startCountdown() {
      state.phase = "waiting";
      state.mult = 1;
      hideCrashDot();
      setMountainsRunning(false);
      placePlane(1, "hidden");
      strokeEl.setAttribute("d", `M${X0} ${Y0}`);
      counterEl.textContent = "";
      waitingBox && (waitingBox.style.display = "none");
      if (timerBox) timerBox.style.display = "";

      const startedAt = performance.now();
      const total = COUNTDOWN_SEC * 1000;
      runDots();
      function tick() {
        const left = Math.max(0, total - (performance.now() - startedAt));
        const sec = Math.ceil(left / 1000);
        if (timerCounter) timerCounter.textContent = String(sec);
        if (left <= 0) {
          clearInterval(tickId);
          // hide timer + last dot before flight
          if (timerBox) timerBox.style.display = "none";
          startFlight();
        }
      }
      clearInterval(tickId);
      tickId = setInterval(tick, 100);
      tick();
      seedBots();
    }

    function startFlight() {
      state.phase = "flying";
      state.crashAt = sampleCrashPoint();
      state.t0 = performance.now();
      setMountainsRunning(true);
      placePlane(1, "fly");

      // activate pending user bets
      playerState.forEach((ps, idx) => {
        if (ps.pending) {
          ps.active = addBet("YOU", ps.pending.amount);
          ps.pending = null;
          setBtnMode(idx, "collect", 1);
        }
      });

      function frame(now) {
        const dt = now - state.t0;
        const m = Math.min(state.crashAt, Math.exp(GROWTH * dt));
        state.mult = m;
        counterEl.textContent = fmt(m) + "x ";
        strokeEl.setAttribute("d", buildPath(m));
        placePlane(m, "fly");

        playerState.forEach((ps, idx) => {
          if (ps.active) setBtnMode(idx, "collect", m);
        });
        activeBets.forEach(b => {
          if (!b.cashed && b._botCashoutAt && m >= b._botCashoutAt) {
            cashoutBet(b, b._botCashoutAt);
          }
        });

        if (m >= state.crashAt) { crash(); return; }
        rafId = requestAnimationFrame(frame);
      }
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(frame);
    }

    function crash() {
      state.phase = "crashed";
      setMountainsRunning(false);
      counterEl.textContent = fmt(state.crashAt) + "x";
      placePlane(state.crashAt, "crash");
      showCrashDot(state.crashAt);
      // user lost their active bets
      playerState.forEach((ps, idx) => {
        if (ps.active) {
          addHistoryUser(state.crashAt, ps.active.bet, 0, false);
          resultModal(false, 0);
          ps.active = null;
        }
        setBtnMode(idx, "place");
      });
      lossAllPending();
      setTimeout(startCountdown, CRASH_HOLD_MS);
    }

    // Start after splash finishes
    setTimeout(startCountdown, SPLASH_MS + 200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
