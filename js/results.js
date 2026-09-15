function totalScore(progress) {
  return progress.levelScores.reduce((sum, s) => sum + (typeof s === "number" ? s : 0), 0);
}

function renderResults(elements, levelNames, progress, streak) {
  const { resultsList, streakNum, scoreNum } = elements;
  resultsList.innerHTML = "";

  progress.levelResults.forEach((ok, i) => {
    const row = document.createElement("div");
    row.className = "result-row " + (ok ? "correct" : "wrong");

    const name = document.createElement("span");
    name.className = "result-name";
    name.textContent = levelNames[i];

    const badge = document.createElement("div");
    badge.className = "result-badge";

    const mark = document.createElement("span");
    mark.className = "result-mark";
    mark.textContent = ok ? "✓" : "✗";

    badge.appendChild(mark);
    badge.appendChild(document.createTextNode(ok ? "Correct" : "Wrong"));

    const score = progress.levelScores[i];
    if (typeof score === "number") {
      const scoreSpan = document.createElement("span");
      scoreSpan.className = "result-score";
      scoreSpan.textContent = `+${score}`;
      badge.appendChild(scoreSpan);
    }

    row.appendChild(name);
    row.appendChild(badge);
    resultsList.appendChild(row);
  });

  streakNum.textContent = String(streak.count);
  scoreNum.textContent = String(totalScore(progress));
}

function buildShareText(dateLabel, progress, streak) {
  const marks = progress.levelResults.map((ok) => (ok ? "✓" : "✗")).join(" ");
  const correctCount = progress.levelResults.filter(Boolean).length;
  const total = progress.levelResults.length;
  return `Turf — ${dateLabel}\n${marks}  ${correctCount}/${total}\n${totalScore(progress)} pts · ${streak.count} day streak\nhttps://gyajaman.github.io/turf/`;
}

async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // fall through to legacy path
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch (e) {
    return false;
  }
}
