(function () {
  const LEVEL_LABELS = { easy: "Easy", medium: "Medium", hard: "Hard" };

  const els = {
    onboarding: document.getElementById("onboarding"),
    onboardingDismiss: document.getElementById("onboarding-dismiss"),
    helpBtn: document.getElementById("help-btn"),

    landingScreen: document.getElementById("landing-screen"),
    landingDate: document.getElementById("landing-date"),
    startBtn: document.getElementById("start-btn"),

    levelScreen: document.getElementById("level-screen"),
    levelName: document.getElementById("level-name"),
    timerDisplay: document.getElementById("timer-display"),
    timerNumber: document.getElementById("timer-number"),
    timerTrack: document.getElementById("timer-track"),
    timerFill: document.getElementById("timer-fill"),
    scoreReveal: document.getElementById("score-reveal"),
    levelScore: document.getElementById("level-score"),
    scoreBonusLabel: document.getElementById("score-bonus-label"),
    bannerWrap: document.getElementById("banner-wrap"),
    banner: document.getElementById("banner"),
    bannerMark: document.getElementById("banner-mark"),
    bannerText: document.getElementById("banner-text"),
    board: document.getElementById("board"),
    guessBtn: document.getElementById("guess-btn"),
    continueBtn: document.getElementById("continue-btn"),

    resultsScreen: document.getElementById("results-screen"),
    resultsDate: document.getElementById("results-date"),
    resultsList: document.getElementById("results-list"),
    streakNum: document.getElementById("streak-num"),
    scoreNum: document.getElementById("score-num"),
    shareLink: document.getElementById("share-link"),
    copyToast: document.getElementById("copy-toast"),

    loadingScreen: document.getElementById("loading-screen"),
    errorScreen: document.getElementById("error-screen"),
    errorMessage: document.getElementById("error-message"),
  };

  // .banner-wrap stays in the layout at all times via visibility:hidden (see
  // CSS) specifically so its reserved space is real, not an estimated
  // number — but that only holds if it actually HAS content to measure.
  // Left genuinely empty, a flex item collapses to 0×0 (no line-height
  // "strut" the way normal inline text gets), so the very first real
  // confirm — going from empty to actual text — grows .banner-wrap and
  // shrinks the board's available space right under it. After that it
  // never recurs, since the text is only ever overwritten, never cleared.
  // Pre-filling with real (if placeholder) content up front means there's
  // no "first time" special case at all.
  els.bannerMark.textContent = "✓";
  els.bannerText.textContent = "Correct — that's the biggest territory";

  const screens = [els.landingScreen, els.levelScreen, els.resultsScreen, els.loadingScreen, els.errorScreen];
  function showScreen(screen) {
    screens.forEach((s) => {
      s.hidden = s !== screen;
    });
  }

  // A CSS `animation` on an element only plays once, when it first becomes
  // part of the render (or when its animation-name changes) — advancing to
  // the next level keeps the SAME level-screen element visible, so its
  // fadeInUp never naturally replays. Dropping and re-applying the
  // animation (with a forced reflow between) restarts it from 0% each time.
  function restartAnimation(el) {
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  }

  // Forces a real decision instead of a careful count of the grid's cells —
  // at 12x8 a patient player could otherwise just tally squares per region.
  const LEVEL_TIME_LIMIT_S = 20;
  const LEVEL_BASE_SCORE = { easy: 100, medium: 200, hard: 300 };
  const TIME_BONUS_PER_SECOND = 10;
  let timerInterval = null;
  let timerStartedAt = null;

  // The score a confirm should earn: whole seconds still left on the clock,
  // measured from real elapsed time (not the once-a-second tick counter,
  // which lags a click by up to 999ms) — this is also what makes an
  // expired timer naturally score 0, with no separate case to handle.
  function remainingSeconds() {
    if (timerStartedAt === null) return 0;
    const elapsedS = (performance.now() - timerStartedAt) / 1000;
    return Math.max(0, LEVEL_TIME_LIMIT_S - elapsedS);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    // clearInterval only stops the tick; the CSS transition driving the bar
    // toward 0% keeps animating on its own otherwise, so a manual confirm
    // would leave it visibly draining underneath the reveal. Freeze it at
    // its current width instead.
    const currentWidth = getComputedStyle(els.timerFill).width;
    els.timerFill.style.transition = "none";
    els.timerFill.style.width = currentWidth;
  }

  function startTimer(onExpire) {
    stopTimer();
    timerStartedAt = performance.now();
    let remaining = LEVEL_TIME_LIMIT_S;
    els.timerDisplay.classList.remove("urgent");
    els.timerNumber.textContent = String(remaining);
    els.timerFill.style.transition = "none";
    els.timerFill.style.width = "100%";
    void els.timerFill.offsetWidth;
    els.timerFill.style.transition = `width ${LEVEL_TIME_LIMIT_S}s linear`;
    els.timerFill.style.width = "0%";

    timerInterval = setInterval(() => {
      remaining -= 1;
      els.timerNumber.textContent = String(Math.max(0, remaining));
      if (remaining <= 5) els.timerDisplay.classList.add("urgent");
      if (remaining <= 0) {
        stopTimer();
        onExpire();
      }
    }, 1000);
  }

  // Counts els.levelScore from `from` to `to` instead of just setting it,
  // so each stage of the score reveal below reads as something happening
  // in the moment rather than a static number appearing. Calls onDone once
  // the count settles on `to`.
  function animateCountUp(from, to, durationMs, onDone) {
    if (to <= from) {
      els.levelScore.textContent = `+${to}`;
      if (onDone) onDone();
      return;
    }
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / durationMs);
      els.levelScore.textContent = `+${Math.round(from + t * (to - from))}`;
      if (t < 1) {
        requestAnimationFrame(frame);
      } else if (onDone) {
        onDone();
      }
    }
    requestAnimationFrame(frame);
  }

  // Base first, then (if there's anything to show) a "Time Bonus" callout
  // fades in and the same number keeps counting up from base to the full
  // total — a fast, correct guess reads as base score *plus* a reward for
  // speed, not just one flat number appearing.
  function revealScore(base, bonus, onDone) {
    els.scoreBonusLabel.classList.remove("visible", "fade-out");
    animateCountUp(0, base, 450, () => {
      if (bonus <= 0) {
        if (onDone) onDone();
        return;
      }
      els.scoreBonusLabel.classList.add("visible");
      setTimeout(() => {
        animateCountUp(base, base + bonus, 450, () => {
          if (onDone) onDone();
          // Let the final total sit for a beat before the "Time Bonus"
          // label fades — the number itself stays put, only the label
          // (its job now done) goes away.
          setTimeout(() => {
            els.scoreBonusLabel.classList.remove("visible");
            els.scoreBonusLabel.classList.add("fade-out");
          }, 400);
        });
      }, 550);
    });
  }

  function setupOnboarding() {
    if (!hasSeenOnboarding()) {
      els.onboarding.hidden = false;
    }
    els.onboardingDismiss.onclick = () => {
      markOnboardingSeen();
      els.onboarding.classList.add("closing");
      setTimeout(() => {
        els.onboarding.hidden = true;
        els.onboarding.classList.remove("closing");
      }, 250);
    };
    els.helpBtn.onclick = () => {
      els.onboarding.classList.remove("closing");
      els.onboarding.hidden = false;
    };
  }

  async function init() {
    setupOnboarding();

    const date = getISTDateString();
    const dateLabel = formatISTDateDisplay(date);

    let dayData;
    try {
      // Awaited alongside the fetch (not after) so this never adds visible
      // delay beyond whichever was already slower. Without this, level 1
      // can render before "Libre Caslon Display/Text" finish downloading —
      // text briefly sits in a fallback font, then swaps once the custom
      // font loads, changing its metrics and reflowing the space left for
      // the board. By level 2 the fonts are cached, so it never recurs —
      // this is why it looked specific to the first level.
      const [res] = await Promise.all([fetch(`data/levels/${date}.json`, { cache: "no-store" }), document.fonts.ready]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      dayData = await res.json();
    } catch (e) {
      els.errorMessage.textContent = `Couldn't load today's puzzle (${date}). It may not be generated yet.`;
      showScreen(els.errorScreen);
      return;
    }

    const progress = loadProgress(date);

    if (progress.completed) {
      showResults(date, dateLabel, dayData, progress);
      return;
    }

    const notStarted = progress.currentLevel === 0 && progress.levelResults.every((r) => r === null);
    if (notStarted) {
      showLanding(date, dateLabel, dayData, progress);
    } else {
      showLevel(date, dateLabel, dayData, progress);
    }
  }

  function showLanding(date, dateLabel, dayData, progress) {
    showScreen(els.landingScreen);
    els.landingDate.textContent = dateLabel;
    els.startBtn.onclick = () => showLevel(date, dateLabel, dayData, progress);
  }

  function showLevel(date, dateLabel, dayData, progress) {
    showScreen(els.levelScreen);
    restartAnimation(els.levelScreen);
    const i = progress.currentLevel;
    const level = dayData.levels[i];
    const cols = dayData.grid.cols;
    const rows = dayData.grid.rows;

    els.levelName.textContent = `${LEVEL_LABELS[level.difficulty]} · ${i + 1}/${dayData.levels.length}`;
    // Reset the banner to hidden instantly (no transition) — otherwise its
    // own 0.3s "all" transition plays at the same time as, but out of sync
    // with, the level screen's restarted fadeInUp, and the two competing
    // timelines read as a flash. The transition comes back immediately
    // after, for its normal in-level correct/wrong reveal.
    els.bannerWrap.style.transition = "none";
    els.bannerWrap.classList.remove("show");
    void els.bannerWrap.offsetWidth;
    els.bannerWrap.style.transition = "";
    els.banner.className = "banner";
    els.timerDisplay.hidden = false;
    els.timerDisplay.classList.remove("fade-out");
    els.scoreReveal.hidden = true;
    els.guessBtn.hidden = false;
    els.guessBtn.disabled = true;
    els.guessBtn.textContent = "Confirm";
    els.continueBtn.hidden = true;

    const board = renderBoard(els.board, level, cols, rows);

    let selected = null;
    board.onCellClick((regionId) => {
      selected = regionId;
      board.selectRegion(regionId);
      els.guessBtn.disabled = false;
    });

    function confirmGuess() {
      const remaining = remainingSeconds(); // capture the instant of confirm
      stopTimer();
      board.lock();
      els.guessBtn.disabled = true;

      // A timeout with nothing selected counts as wrong, same as picking
      // any other region — running out the clock isn't a way to skip.
      const timedOut = selected === null;
      const correct = !timedOut && selected === level.answerRegionId;
      // Wrong answers score nothing — speed only pays off on a level you
      // actually solved. Base reward scales with difficulty so a correct
      // hard guess is worth more than an equally fast easy one.
      const base = correct ? LEVEL_BASE_SCORE[level.difficulty] : 0;
      const bonus = correct ? Math.round(remaining) * TIME_BONUS_PER_SECOND : 0;
      const scoreThisLevel = base + bonus;

      // The frozen timer bar (left as-is by stopTimer()) stays put through
      // the reveal — the score only replaces it once the reveal is over,
      // so the two don't compete for attention: first *why*, then *what
      // you earned*.
      runReveal(level, {
        onPhaseChange: (phase) => {
          if (phase === "confirmed") {
            els.bannerMark.textContent = correct ? "✓" : "✗";
            els.bannerText.textContent = correct
              ? "Correct — that's the biggest territory"
              : timedOut
                ? "Time's up — here's how it stacked up"
                : "Not quite — here's how it stacked up";
            els.banner.className = "banner " + (correct ? "correct" : "wrong");
            els.bannerWrap.classList.add("show");
            els.guessBtn.textContent = "Locking in…";
          } else if (phase === "revealing") {
            els.guessBtn.textContent = "Revealing…";
          } else if (phase === "done") {
            // Keep guessBtn in place (just relabeled) until the replacement
            // is actually ready — hiding it here and continueBtn later
            // would leave a gap with neither button in the flex column,
            // and board-wrap (flex:1) would visibly grow to fill it and
            // then snap back once continueBtn appeared.
            els.guessBtn.textContent = "Scoring…";
            els.timerDisplay.classList.add("fade-out");
            setTimeout(() => {
              els.timerDisplay.hidden = true;
              els.scoreReveal.hidden = false;
              revealScore(base, bonus, () => {
                els.guessBtn.hidden = true;
                els.continueBtn.hidden = false;
                els.continueBtn.textContent = i + 1 >= dayData.levels.length ? "See results" : "Next";
              });
            }, 250);
          }
        },
        onRevealRegion: (region) => {
          board.markRevealed(region.id, region.area);
        },
      });

      els.continueBtn.onclick = () => advance(date, dateLabel, dayData, progress, i, correct, scoreThisLevel);
    }

    els.guessBtn.onclick = () => {
      if (selected === null) return;
      confirmGuess();
    };

    startTimer(confirmGuess);
  }

  function advance(date, dateLabel, dayData, progress, i, correct, scoreThisLevel) {
    progress.levelResults[i] = correct;
    progress.levelScores[i] = scoreThisLevel;

    if (i === dayData.levels.length - 1) {
      progress.completed = true;
      saveProgress(progress);
      recordDayCompletion(date);
      showResults(date, dateLabel, dayData, progress);
    } else {
      progress.currentLevel = i + 1;
      saveProgress(progress);
      showLevel(date, dateLabel, dayData, progress);
    }
  }

  function showResults(date, dateLabel, dayData, progress) {
    showScreen(els.resultsScreen);
    els.resultsDate.textContent = dateLabel;
    const streak = loadStreak();
    const levelNames = dayData.levels.map((l) => LEVEL_LABELS[l.difficulty]);
    renderResults({ resultsList: els.resultsList, streakNum: els.streakNum, scoreNum: els.scoreNum }, levelNames, progress, streak);

    els.shareLink.onclick = async (e) => {
      e.preventDefault();
      const ok = await copyToClipboard(buildShareText(dateLabel, progress, streak));
      if (ok) {
        els.copyToast.classList.remove("closing");
        els.copyToast.hidden = false;
        setTimeout(() => {
          els.copyToast.classList.add("closing");
          setTimeout(() => {
            els.copyToast.hidden = true;
            els.copyToast.classList.remove("closing");
          }, 200);
        }, 1800);
      }
    };
  }

  init();
})();
