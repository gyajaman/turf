(function () {
  const els = {
    dateLabel: document.getElementById("date-label"),
    levelScreen: document.getElementById("level-screen"),
    resultsScreen: document.getElementById("results-screen"),
    loadingScreen: document.getElementById("loading-screen"),
    errorScreen: document.getElementById("error-screen"),
    errorMessage: document.getElementById("error-message"),
    levelPill: document.getElementById("level-pill"),
    levelProgress: document.getElementById("level-progress"),
    board: document.getElementById("board"),
    guessBtn: document.getElementById("guess-btn"),
    banner: document.getElementById("banner"),
    emojiGrid: document.getElementById("emoji-grid"),
    streakLine: document.getElementById("streak-line"),
    copyBtn: document.getElementById("copy-btn"),
  };

  const screens = [els.levelScreen, els.resultsScreen, els.loadingScreen, els.errorScreen];
  function showScreen(screen) {
    screens.forEach((s) => {
      s.hidden = s !== screen;
    });
  }

  function dateFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return params.get("date");
  }

  async function init() {
    const date = dateFromQuery() || getISTDateString();
    els.dateLabel.textContent = date;

    let dayData;
    try {
      const res = await fetch(`data/levels/${date}.json`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      dayData = await res.json();
    } catch (e) {
      els.errorMessage.textContent = `Couldn't load today's puzzle (${date}). It may not be generated yet.`;
      showScreen(els.errorScreen);
      return;
    }

    const progress = loadProgress(date);

    if (progress.completed) {
      showResults(date, progress);
      return;
    }

    showLevel(date, dayData, progress);
  }

  function showLevel(date, dayData, progress) {
    showScreen(els.levelScreen);
    const i = progress.currentLevel;
    const level = dayData.levels[i];
    const cols = dayData.grid.cols;
    const rows = dayData.grid.rows;

    els.levelPill.textContent = level.difficulty;
    els.levelProgress.textContent = `Level ${i + 1} of ${dayData.levels.length}`;
    els.banner.hidden = true;
    els.banner.removeAttribute("data-result");
    els.guessBtn.disabled = true;
    els.guessBtn.textContent = "Guess";

    const board = renderBoard(els.board, level, cols, rows);

    let selected = null;
    board.onCellClick((regionId) => {
      selected = regionId;
      board.selectRegion(regionId);
      els.guessBtn.disabled = false;
    });

    els.guessBtn.onclick = () => {
      if (selected === null) return;
      els.guessBtn.disabled = true;
      animateReveal(board, els.banner, level, selected, {
        onDone: () => advance(date, dayData, progress, i, selected === level.answerRegionId),
      });
    };
  }

  function advance(date, dayData, progress, i, correct) {
    progress.levelResults[i] = correct;

    if (i === dayData.levels.length - 1) {
      progress.completed = true;
      saveProgress(progress);
      recordDayCompletion(date);
      showResults(date, progress);
    } else {
      progress.currentLevel = i + 1;
      saveProgress(progress);
      showLevel(date, dayData, progress);
    }
  }

  function showResults(date, progress) {
    showScreen(els.resultsScreen);
    const streak = loadStreak();
    renderResults({ emojiGrid: els.emojiGrid, streakLine: els.streakLine }, progress, streak);

    els.copyBtn.onclick = async () => {
      const ok = await copyToClipboard(buildShareText(date, progress, streak));
      els.copyBtn.textContent = ok ? "Copied!" : "Copy failed";
      setTimeout(() => {
        els.copyBtn.textContent = "Copy results";
      }, 1500);
    };
  }

  init();
})();
