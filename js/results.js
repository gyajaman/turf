function renderResults(elements, progress, streak) {
  const { emojiGrid, streakLine } = elements;
  emojiGrid.textContent = progress.levelResults.map((ok) => (ok ? "🟩" : "🟥")).join("");
  const streakWord = streak.count === 1 ? "day" : "days";
  streakLine.textContent = `🔥 ${streak.count} ${streakWord} in a row`;
}

function buildShareText(date, progress, streak) {
  const emojis = progress.levelResults.map((ok) => (ok ? "🟩" : "🟥")).join("");
  return `Guess the Largest Area — ${date}\n${emojis}\n🔥 streak: ${streak.count}`;
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
