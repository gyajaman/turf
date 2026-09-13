// Renders a level's owner grid as a CSS grid of divs, one per cell, colored
// by region. Region shapes are irregular cell-sets (not rectangles), so a
// region's tap target is simply the union of its cells — clicking any cell
// selects the whole region via the shared data-region attribute.
function renderBoard(container, level, cols, rows) {
  container.innerHTML = "";
  container.style.setProperty("--board-cols", cols);
  container.style.setProperty("--board-rows", rows);
  container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  container.removeAttribute("data-selected");
  container.removeAttribute("data-locked");

  const colorByRegion = {};
  level.regions.forEach((r) => {
    colorByRegion[r.id] = r.color;
  });

  const cells = [];
  const coordSumByRegion = {}; // regionId -> { sumX, sumY, count }
  let clickHandler = null;

  for (let y = 0; y < rows; y++) {
    const rowStr = level.rows[y];
    for (let x = 0; x < cols; x++) {
      const regionId = Number(rowStr[x]);
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.region = String(regionId);
      cell.style.backgroundColor = colorByRegion[regionId];

      cell.addEventListener("click", () => {
        if (container.dataset.locked === "true") return;
        if (clickHandler) clickHandler(regionId);
      });

      container.appendChild(cell);
      cells.push(cell);

      const sums = coordSumByRegion[regionId] || { sumX: 0, sumY: 0, count: 0 };
      sums.sumX += x;
      sums.sumY += y;
      sums.count += 1;
      coordSumByRegion[regionId] = sums;
    }
  }

  function cellsForRegion(regionId) {
    return cells.filter((c) => Number(c.dataset.region) === regionId);
  }

  function centroidPercent(regionId) {
    const { sumX, sumY, count } = coordSumByRegion[regionId];
    const cx = sumX / count + 0.5;
    const cy = sumY / count + 0.5;
    return { left: (cx / cols) * 100, top: (cy / rows) * 100 };
  }

  return {
    onCellClick(handler) {
      clickHandler = handler;
    },
    selectRegion(regionId) {
      container.dataset.selected = String(regionId);
      cells.forEach((c) => {
        c.dataset.selectedRegion = String(Number(c.dataset.region) === regionId);
      });
    },
    lock() {
      container.dataset.locked = "true";
    },
    markRevealed(regionId, area, { pulse = true } = {}) {
      cellsForRegion(regionId).forEach((c) => {
        c.dataset.revealed = "true";
        if (pulse) c.classList.add("reveal-pulse");
      });

      const { left, top } = centroidPercent(regionId);
      const label = document.createElement("div");
      label.className = "region-label";
      label.style.left = `${left}%`;
      label.style.top = `${top}%`;
      label.textContent = String(area);
      container.appendChild(label);
      requestAnimationFrame(() => label.classList.add("region-label-in"));
    },
  };
}
