// Renders a level's owner grid to a single <canvas>: cell fills and
// territory boundary lines are both drawn from the exact same per-column/
// per-row pixel-edge array, in the same coordinate space, in one paint call.
// Earlier versions split fill (CSS Grid) and boundary lines (SVG overlay,
// or per-cell CSS borders) across two independently-scaled layout systems;
// each rounds pixel widths differently, so the "seam" and the "line" drawn
// on top of it drift apart — worse the smaller the board renders. A single
// canvas has exactly one source of truth for where every edge is, so the
// line is always exactly on the seam, at any size.
const BOARD_GROOVE = "rgba(28,26,22,0.4)";
const BOARD_HIGHLIGHT = "#9c6b1f";
const SELECTION_TRANSITION_MS = 180;

// Canvas fillStyle parses any valid CSS <color>, including oklch() and
// color-mix() — same color engine the DOM already uses for these region
// colors — so region colors can be passed straight through with no RGB
// conversion step.
function effectiveColor(base, isSelected, hasSelection) {
  if (hasSelection && !isSelected) {
    return `color-mix(in oklch, ${base} 88%, black 12%)`;
  }
  return base;
}

// Canvas has no built-in transitions (unlike CSS background-color), so a
// selection change animates by drawing several interpolated frames between
// the old and new colors — using color-mix() itself as the interpolator
// (nesting it is valid CSS; a color-mix() result is itself a <color>), so
// no RGB parsing/conversion is needed.
function mixColors(colorA, colorB, t) {
  if (t <= 0) return colorA;
  if (t >= 1) return colorB;
  const pctB = Math.round(t * 100);
  return `color-mix(in oklch, ${colorA} ${100 - pctB}%, ${colorB} ${pctB}%)`;
}

function renderBoard(container, level, cols, rows) {
  // A prior render's ResizeObserver would otherwise keep firing (redrawing a
  // detached canvas from a stale closure) after this level replaces it.
  if (container._boardResizeObserver) {
    container._boardResizeObserver.disconnect();
  }

  container.innerHTML = "";
  container.removeAttribute("data-locked");
  // .board (container) sits inside .board-card (the chrome: padding/border,
  // hugs the board's own size) inside .board-wrap (the actual available
  // space — flex:1 in .screen-level, no chrome of its own).
  const card = container.parentElement;
  const outerWrap = card.parentElement;

  const owner = new Int8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    const rowStr = level.rows[y];
    for (let x = 0; x < cols; x++) {
      owner[y * cols + x] = Number(rowStr[x]);
    }
  }

  const colorByRegion = {};
  level.regions.forEach((r) => {
    colorByRegion[r.id] = r.color;
  });

  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.cursor = "pointer";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let colX = [];
  let rowY = [];
  let dpr = 1;

  // The board is sized explicitly here, in JS, rather than via a pure-CSS
  // "shrink to fit both width and height" trick: that pattern (width:auto;
  // height:auto; max-width/max-height:100%) only works reliably for
  // elements with their own intrinsic size (like <img>) — a plain div with
  // only aspect-ratio and no intrinsic content collapses instead of filling
  // the available space. Computing the fit directly avoids that entirely.
  function computeGeometry() {
    const outerRect = outerWrap.getBoundingClientRect();
    const cardStyle = getComputedStyle(card);
    const cardExtraX =
      parseFloat(cardStyle.paddingLeft) +
      parseFloat(cardStyle.paddingRight) +
      parseFloat(cardStyle.borderLeftWidth) +
      parseFloat(cardStyle.borderRightWidth);
    const cardExtraY =
      parseFloat(cardStyle.paddingTop) +
      parseFloat(cardStyle.paddingBottom) +
      parseFloat(cardStyle.borderTopWidth) +
      parseFloat(cardStyle.borderBottomWidth);
    const availW = outerRect.width - cardExtraX;
    const availH = outerRect.height - cardExtraY;

    const ratio = cols / rows;
    let cssW = availW;
    let cssH = cssW / ratio;
    if (cssH > availH) {
      cssH = availH;
      cssW = cssH * ratio;
    }
    container.style.width = `${cssW}px`;
    container.style.height = `${cssH}px`;

    dpr = window.devicePixelRatio || 1;
    const pxW = Math.max(1, Math.round(cssW * dpr));
    const pxH = Math.max(1, Math.round(cssH * dpr));
    canvas.width = pxW;
    canvas.height = pxH;
    colX = Array.from({ length: cols + 1 }, (_, i) => Math.round((i * pxW) / cols));
    rowY = Array.from({ length: rows + 1 }, (_, i) => Math.round((i * pxH) / rows));
  }

  // Every internal edge between two differently-owned cells, in grid-unit
  // coordinates (valid indices into colX/rowY). Precomputed once so both
  // the static (final) draw and the animated (interpolated) draw share the
  // same list instead of duplicating the owner-grid scan.
  const edges = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const regionId = owner[i];
      if (x < cols - 1 && owner[i + 1] !== regionId) {
        edges.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1, a: regionId, b: owner[i + 1] });
      }
      if (y < rows - 1 && owner[i + cols] !== regionId) {
        edges.push({ x1: x, y1: y + 1, x2: x + 1, y2: y + 1, a: regionId, b: owner[i + cols] });
      }
    }
  }

  // Renders one frame of a transition from fromSelection to toSelection at
  // progress t (0 = fromSelection exactly, 1 = toSelection exactly). Called
  // with fromSelection === toSelection for a static, non-animating draw,
  // which takes the cheaper batched-stroke path since every edge color is
  // then fixed rather than individually interpolated.
  function drawFrame(fromSelection, toSelection, t) {
    if (!colX.length) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const settled = t >= 1 || fromSelection === toSelection;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const regionId = owner[y * cols + x];
        const toColor = effectiveColor(colorByRegion[regionId], regionId === toSelection, toSelection !== null);
        if (settled) {
          ctx.fillStyle = toColor;
        } else {
          const fromColor = effectiveColor(colorByRegion[regionId], regionId === fromSelection, fromSelection !== null);
          ctx.fillStyle = mixColors(fromColor, toColor, t);
        }
        ctx.fillRect(colX[x], rowY[y], colX[x + 1] - colX[x], rowY[y + 1] - rowY[y]);
      }
    }

    ctx.lineWidth = Math.max(1, 1.5 * dpr);
    ctx.lineCap = "square";

    if (settled) {
      // Two batched strokes (one per fixed color) rather than one draw call
      // per edge — cheaper, and this is the state the board sits in almost
      // all the time (animations are brief).
      [BOARD_GROOVE, BOARD_HIGHLIGHT].forEach((strokeColor) => {
        ctx.strokeStyle = strokeColor;
        ctx.beginPath();
        edges.forEach((e) => {
          const touchesSel = e.a === toSelection || e.b === toSelection;
          if ((touchesSel && strokeColor === BOARD_HIGHLIGHT) || (!touchesSel && strokeColor === BOARD_GROOVE)) {
            ctx.moveTo(colX[e.x1], rowY[e.y1]);
            ctx.lineTo(colX[e.x2], rowY[e.y2]);
          }
        });
        ctx.stroke();
      });
    } else {
      // Mid-transition, edges still get batched by color rather than
      // stroked one at a time — a separate stroke() per short segment can
      // leave a faint seam at shared endpoints between adjacent segments
      // (the same class of artifact individually-bordered cells had).
      // Only edges touching the old or new selection actually change
      // color; everything else keeps a constant color for the whole
      // animation, so there are still just a handful of groups to batch.
      const unchangedGroove = [];
      const unchangedHighlight = [];
      const toHighlight = []; // was groove, animating toward highlight
      const toGroove = []; // was highlight, animating toward groove
      edges.forEach((e) => {
        const fromTouches = e.a === fromSelection || e.b === fromSelection;
        const toTouches = e.a === toSelection || e.b === toSelection;
        if (fromTouches === toTouches) {
          (toTouches ? unchangedHighlight : unchangedGroove).push(e);
        } else if (toTouches) {
          toHighlight.push(e);
        } else {
          toGroove.push(e);
        }
      });

      function strokeGroup(list, color) {
        if (!list.length) return;
        ctx.strokeStyle = color;
        ctx.beginPath();
        list.forEach((e) => {
          ctx.moveTo(colX[e.x1], rowY[e.y1]);
          ctx.lineTo(colX[e.x2], rowY[e.y2]);
        });
        ctx.stroke();
      }

      strokeGroup(unchangedGroove, BOARD_GROOVE);
      strokeGroup(unchangedHighlight, BOARD_HIGHLIGHT);
      strokeGroup(toHighlight, mixColors(BOARD_GROOVE, BOARD_HIGHLIGHT, t));
      strokeGroup(toGroove, mixColors(BOARD_HIGHLIGHT, BOARD_GROOVE, t));
    }
  }

  function draw(selectedRegion) {
    drawFrame(selectedRegion, selectedRegion, 1);
  }

  let currentSelection = null;
  let animHandle = null;

  function animateSelection(fromSelection, toSelection) {
    if (animHandle) cancelAnimationFrame(animHandle);
    if (fromSelection === toSelection) {
      draw(toSelection);
      return;
    }
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / SELECTION_TRANSITION_MS);
      drawFrame(fromSelection, toSelection, t);
      if (t < 1) {
        animHandle = requestAnimationFrame(frame);
      } else {
        animHandle = null;
      }
    }
    animHandle = requestAnimationFrame(frame);
  }

  computeGeometry();
  draw(null);

  // Observe the wrap (the space being fit into), not the board itself —
  // computeGeometry() sets the board's own size, so observing the board
  // would have this fire in response to its own resize.
  const resizeObserver = new ResizeObserver(() => {
    computeGeometry();
    draw(currentSelection);
  });
  resizeObserver.observe(outerWrap);
  container._boardResizeObserver = resizeObserver;

  function regionAtEvent(evt) {
    const rect = canvas.getBoundingClientRect();
    const px = (evt.clientX - rect.left) * dpr;
    const py = (evt.clientY - rect.top) * dpr;
    let x = 0;
    while (x < cols - 1 && px >= colX[x + 1]) x++;
    let y = 0;
    while (y < rows - 1 && py >= rowY[y + 1]) y++;
    return owner[y * cols + x];
  }

  let clickHandler = null;
  canvas.addEventListener("click", (evt) => {
    if (container.dataset.locked === "true") return;
    if (clickHandler) clickHandler(regionAtEvent(evt));
  });

  const coordSumByRegion = {}; // regionId -> { sumX, sumY, count }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const regionId = owner[y * cols + x];
      const s = coordSumByRegion[regionId] || { sumX: 0, sumY: 0, count: 0 };
      s.sumX += x;
      s.sumY += y;
      s.count += 1;
      coordSumByRegion[regionId] = s;
    }
  }

  return {
    onCellClick(handler) {
      clickHandler = handler;
    },
    selectRegion(regionId) {
      const previous = currentSelection;
      currentSelection = regionId;
      animateSelection(previous, regionId);
    },
    lock() {
      container.dataset.locked = "true";
      canvas.style.cursor = "default";
    },
    markRevealed(regionId, area) {
      const { sumX, sumY, count } = coordSumByRegion[regionId];
      const cx = sumX / count + 0.5;
      const cy = sumY / count + 0.5;
      const label = document.createElement("span");
      label.className = "region-label";
      label.style.left = `${(cx / cols) * 100}%`;
      label.style.top = `${(cy / rows) * 100}%`;
      label.textContent = String(area);
      container.appendChild(label);
    },
  };
}
