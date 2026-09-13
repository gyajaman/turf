const REVEAL_STAGGER_MS = 700;
const REVEAL_FINAL_EXTRA_MS = 400;

// 1. flashes correct/wrong immediately
// 2. reveals every region's area smallest -> largest, one at a time
// 3. calls onDone once the largest (correct) region has been revealed
function animateReveal(board, bannerEl, level, selectedRegionId, { onDone }) {
  board.lock();

  const correct = selectedRegionId === level.answerRegionId;
  bannerEl.hidden = false;
  bannerEl.dataset.result = correct ? "correct" : "wrong";
  bannerEl.textContent = correct ? "Correct!" : "Not quite.";

  const ordered = [...level.regions].sort((a, b) => a.area - b.area);

  ordered.forEach((region, i) => {
    setTimeout(() => {
      const isLast = i === ordered.length - 1;
      board.markRevealed(region.id, region.area, { pulse: true });
      if (isLast && onDone) {
        setTimeout(onDone, REVEAL_FINAL_EXTRA_MS);
      }
    }, i * REVEAL_STAGGER_MS);
  });
}
