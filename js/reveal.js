const REVEAL_CONFIRM_DELAY_MS = 650;
const REVEAL_STAGGER_MS = 550;
const REVEAL_DONE_DELAY_MS = 300;

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
