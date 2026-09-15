// Trimmed down from 650/550/300 now that the score reveal plays *after*
// this finishes rather than alongside it — the score needs its own real
// beat, so the reveal itself should feel brisk instead of adding its old
// pacing on top.
const REVEAL_CONFIRM_DELAY_MS = 500;
const REVEAL_STAGGER_MS = 400;
const REVEAL_DONE_DELAY_MS = 150;

// Drives the guess lifecycle: idle -> confirmed -> revealing -> done.
// onPhaseChange(phase) fires on each transition (so the caller can update the
// banner/board lock/button labels); onRevealRegion(region) fires once per
// region, smallest area first, as it's individually revealed.
function runReveal(level, { onPhaseChange, onRevealRegion, onDone }) {
  onPhaseChange("confirmed");

  setTimeout(() => {
    onPhaseChange("revealing");
    const order = [...level.regions].sort((a, b) => a.area - b.area);

    function step(i) {
      if (i >= order.length) {
        setTimeout(() => {
          onPhaseChange("done");
          if (onDone) onDone();
        }, REVEAL_DONE_DELAY_MS);
        return;
      }
      onRevealRegion(order[i]);
      setTimeout(() => step(i + 1), REVEAL_STAGGER_MS);
    }
    step(0);
  }, REVEAL_CONFIRM_DELAY_MS);
}
