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

    els.guessBtn.onclick = () => {
      if (selected === null) return;
      board.lock();
      els.guessBtn.disabled = true;

      const correct = selected === level.answerRegionId;

      runReveal(level, {
        onPhaseChange: (phase) => {
          if (phase === "confirmed") {
            els.bannerMark.textContent = correct ? "✓" : "✗";
            els.bannerText.textContent = correct
              ? "Correct — that's the biggest territory"
              : "Not quite — here's how it stacked up";
            els.banner.className = "banner " + (correct ? "correct" : "wrong");
            els.bannerWrap.classList.add("show");
            els.guessBtn.textContent = "Locking in…";
          } else if (phase === "revealing") {
            els.guessBtn.textContent = "Revealing…";
          } else if (phase === "done") {
            els.guessBtn.hidden = true;
            els.continueBtn.hidden = false;
            els.continueBtn.textContent = i + 1 >= dayData.levels.length ? "See results" : "Next";
          }
        },
        onRevealRegion: (region) => {
          board.markRevealed(region.id, region.area);
        },
      });

      els.continueBtn.onclick = () => advance(date, dateLabel, dayData, progress, i, correct);
    };
  }

  function advance(date, dateLabel, dayData, progress, i, correct) {
    progress.levelResults[i] = correct;

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
    renderResults({ resultsList: els.resultsList, streakNum: els.streakNum }, levelNames, progress, streak);

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
