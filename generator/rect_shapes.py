import random
import math


class Rect:
    def __init__(self, x, y, w, h):
        self.x = x
        self.y = y
        self.w = w
        self.h = h

    @property
    def area(self):
        return self.w * self.h

    @property
    def x2(self):
        return self.x + self.w

    @property
    def y2(self):
        return self.y + self.h

    def overlaps(self, other, pad=0):
        return not (
            self.x2 + pad <= other.x or other.x2 + pad <= self.x or
            self.y2 + pad <= other.y or other.y2 + pad <= self.y
        )

    def cells(self):
        for xx in range(self.x, self.x2):
            for yy in range(self.y, self.y2):
                yield (xx, yy)


def rects_for_area(area, aspect_jitter, rng, max_w=None, max_h=None):
    side = math.sqrt(area)
    ratio = rng.uniform(1 - aspect_jitter, 1 + aspect_jitter)
    w = max(1, round(side * ratio))
    h = max(1, round(area / w))
    if max_w is not None and w > max_w:
        w = max_w
        h = max(1, round(area / w))
    if max_h is not None and h > max_h:
        h = max_h
        w = max(1, round(area / h))
    return w, h


def guillotine_partition(m, n, k, weights, rng):
    """
    Recursively split a rectangle into k zones with areas proportional to `weights`,
    guaranteeing every region gets a non-overlapping slot to work within.
    Returns a list of Rect zones, same order as weights.
    """
    def split(rect, indices):
        if len(indices) == 1:
            return {indices[0]: rect}
        if rect.w <= 1 and rect.h <= 1:
            # cannot subdivide further; give remaining indices degenerate zones
            return {i: Rect(rect.x, rect.y, 1, 1) for i in indices}

        total_w = sum(weights[i] for i in indices)

        # randomize how indices are grouped into left/right, rather than always
        # taking the exact half-by-cumulative-weight point. This lets layouts
        # vary between "3 columns in a row" and "1 column + 2 stacked" (L/T shapes)
        # even when the target areas are all similar.
        if len(indices) == 3 and rng.random() < 0.5:
            # explicitly try a 1-vs-2 split with a random choice of which single
            # index is isolated, rather than always the weight-ordered one
            shuffled = list(indices)
            rng.shuffle(shuffled)
            split_point = 1
            left_idx = shuffled[:split_point]
            right_idx = shuffled[split_point:]
        else:
            half = total_w / 2
            acc = 0
            split_point = 1
            for i in range(len(indices)):
                acc += weights[indices[i]]
                if acc >= half:
                    split_point = i + 1
                    break
            split_point = max(1, min(len(indices) - 1, split_point))
            left_idx = indices[:split_point]
            right_idx = indices[split_point:]

        left_w = sum(weights[i] for i in left_idx)
        right_w = sum(weights[i] for i in right_idx)
        frac = left_w / (left_w + right_w)

        # clamp frac so neither resulting zone becomes a thin sliver: no zone should
        # end up with an aspect ratio worse than min_aspect * the other axis, roughly
        min_frac = 0.28
        frac = max(min_frac, min(1 - min_frac, frac))

        # randomize split axis: bias toward the longer side (to avoid slivers)
        # but allow real chance of splitting the other way, so layouts vary
        # across seeds instead of always producing the same partition shape
        can_split_w = rect.w > 1
        can_split_h = rect.h > 1
        if can_split_w and can_split_h:
            # weight toward splitting the longer dimension, but not deterministically
            long_is_w = rect.w >= rect.h
            p_split_w = 0.8 if long_is_w else 0.2
            split_w = rng.random() < p_split_w
        elif can_split_w:
            split_w = True
        elif can_split_h:
            split_w = False
        else:
            return {i: Rect(rect.x, rect.y, max(1, rect.w), max(1, rect.h)) for i in indices}

        if split_w:
            cut = max(1, min(rect.w - 1, round(rect.w * frac)))
            left_rect = Rect(rect.x, rect.y, cut, rect.h)
            right_rect = Rect(rect.x + cut, rect.y, rect.w - cut, rect.h)
        else:
            cut = max(1, min(rect.h - 1, round(rect.h * frac)))
            left_rect = Rect(rect.x, rect.y, rect.w, cut)
            right_rect = Rect(rect.x, rect.y + cut, rect.w, rect.h - cut)

        result = {}
        result.update(split(left_rect, left_idx))
        result.update(split(right_rect, right_idx))
        return result

    all_indices = list(range(k))
    rng.shuffle(all_indices)  # randomize spatial layout, not just area assignment
    zones_by_idx = split(Rect(0, 0, m, n), all_indices)
    return [zones_by_idx[i] for i in range(k)]


def place_core_in_zone(zone, target_core_area, aspect_jitter, rng, placed, margin=1, max_tries=60):
    """Place a core rectangle inside its allocated zone, checked against all
    already-placed rects (since an earlier region's arm may have crossed into
    this zone). Shrinks and retries if no collision-free placement is found."""
    usable_w = max(1, zone.w - margin)
    usable_h = max(1, zone.h - margin)
    cw, ch = rects_for_area(target_core_area, aspect_jitter, rng, max_w=usable_w, max_h=usable_h)
    cw = min(cw, usable_w)
    ch = min(ch, usable_h)

    for shrink_round in range(6):
        max_x_offset = zone.w - cw
        max_y_offset = zone.h - ch
        for _ in range(max_tries):
            ox = rng.randint(0, max(0, max_x_offset))
            oy = rng.randint(0, max(0, max_y_offset))
            cand = Rect(zone.x + ox, zone.y + oy, cw, ch)
            if all(not cand.overlaps(p) for p in placed):
                return cand
        cw = max(1, int(cw * 0.85))
        ch = max(1, int(ch * 0.85))

    # last resort: 1x1 at zone origin, checked against placed; if even that
    # collides the caller will surface it, since the puzzle is infeasible
    fallback = Rect(zone.x, zone.y, 1, 1)
    return fallback


def shrink_arm_to_fit(core, side, arm_w, desired_len, m, n, placed, min_len=2, zone=None):
    """Try decreasing arm length until it fits without collision.
    If zone is given, prefer candidates that stay within the zone bounds first,
    only falling back to allowing the arm to cross zone boundaries if nothing
    inside the zone works."""
    def candidates_for_length(length):
        if side in ("top", "bottom"):
            ax_range = range(0, core.w - arm_w + 1) if core.w >= arm_w else []
        else:
            ax_range = range(0, core.h - arm_w + 1) if core.h >= arm_w else []
        for offset in ax_range:
            if side == "top":
                cand = Rect(core.x + offset, core.y - length, arm_w, length)
            elif side == "bottom":
                cand = Rect(core.x + offset, core.y2, arm_w, length)
            elif side == "left":
                cand = Rect(core.x - length, core.y + offset, length, arm_w)
            else:
                cand = Rect(core.x2, core.y + offset, length, arm_w)
            if cand.x < 0 or cand.y < 0 or cand.x2 > m or cand.y2 > n:
                continue
            if any(cand.overlaps(p) for p in placed if p is not core):
                continue
            yield cand

    def within_zone(cand):
        return (cand.x >= zone.x and cand.x2 <= zone.x2 and
                cand.y >= zone.y and cand.y2 <= zone.y2)

    # first pass: require candidates to stay within the region's own zone
    if zone is not None:
        for length in range(desired_len, min_len - 1, -1):
            for cand in candidates_for_length(length):
                if within_zone(cand):
                    return cand

    # fallback: allow crossing zone boundaries
    for length in range(desired_len, min_len - 1, -1):
        for cand in candidates_for_length(length):
            return cand
    return None


class RegionShape:
    def __init__(self, region_id, rects):
        self.id = region_id
        self.rects = rects

    @property
    def area(self):
        return sum(r.area for r in self.rects)

    def all_cells(self):
        cells = set()
        for r in self.rects:
            cells.update(r.cells())
        return cells


def generate_rect_puzzle(m, n, target_areas, compactness, seed, aspect_jitter=0.3):
    k = len(target_areas)
    rng = random.Random(seed)

    zones = guillotine_partition(m, n, k, target_areas, rng)

    all_placed_rects = []
    shapes = {}
    order = sorted(range(k), key=lambda i: -target_areas[i])

    core_areas = {}
    cores = {}

    # PASS 1: place every region's core, strictly within its own zone.
    # No arms exist yet, so no zone can be robbed before its own core is placed.
    for idx in order:
        target = target_areas[idx]
        c = compactness[idx]
        zone = zones[idx]

        core_frac = 0.4 + 0.55 * c
        core_area = max(1, round(min(zone.area, target) * core_frac))
        core_areas[idx] = core_area

        zone_margin = 1 if c > 0.5 else 2
        core = place_core_in_zone(zone, core_area, aspect_jitter, rng, all_placed_rects, margin=zone_margin)
        for prev in all_placed_rects:
            if core.overlaps(prev):
                raise AssertionError(f"core for region {idx} overlaps existing rect: "
                                      f"core=({core.x},{core.y},{core.w},{core.h}) "
                                      f"prev=({prev.x},{prev.y},{prev.w},{prev.h})")
        cores[idx] = core
        all_placed_rects.append(core)

    # PASS 2: place arms for every region, preferring to stay within the region's
    # own zone (now that we know exactly what's free there after all cores are down).
    shapes_rects = {idx: [cores[idx]] for idx in order}

    for idx in order:
        target = target_areas[idx]
        c = compactness[idx]
        zone = zones[idx]
        core = cores[idx]
        remaining = target - core_areas[idx]

        num_arms = 0
        if remaining > 0:
            num_arms = 1 if c > 0.35 else 2

        per_arm = remaining / max(1, num_arms) if num_arms else 0

        for arm_i in range(num_arms):
            if per_arm < 1:
                continue
            arm_w = 1 if per_arm < 6 else rng.choice([1, 1, 2])
            arm_len = max(2, round(per_arm / arm_w))

            sides = ["top", "bottom", "left", "right"]
            rng.shuffle(sides)
            arm_rect = None
            for side in sides:
                arm_rect = shrink_arm_to_fit(core, side, arm_w, arm_len, m, n, all_placed_rects, zone=zone)
                if arm_rect is not None:
                    break

            if arm_rect is not None:
                shapes_rects[idx].append(arm_rect)
                all_placed_rects.append(arm_rect)

    shapes = {idx: RegionShape(idx, shapes_rects[idx]) for idx in order}
    return shapes


def fill_gaps(shapes, m, n, targets=None):
    """Guarantee full tiling AND connectivity: fill uncovered cells via per-region
    frontier growth (multi-source BFS), so every added cell is adjacent to that
    region's existing territory. This guarantees the final region stays a single
    connected blob rather than picking up disconnected scraps.

    Region priority at each step favors whichever region is furthest below target,
    but a region can only claim cells reachable from its own current territory.
    """
    owner = {}
    frontiers = {idx: set() for idx in shapes}
    for idx, shape in shapes.items():
        for cell in shape.all_cells():
            owner[cell] = idx

    def neighbors4(p):
        x, y = p
        for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            q = (x + dx, y + dy)
            if 0 <= q[0] < m and 0 <= q[1] < n:
                yield q

    for idx in shapes:
        for cell in shapes[idx].all_cells():
            for q in neighbors4(cell):
                if q not in owner:
                    frontiers[idx].add(q)

    current_area = {idx: len(shapes[idx].all_cells()) for idx in shapes}
    total_cells = m * n
    claimed = len(owner)

    while claimed < total_cells:
        growable = [idx for idx in shapes if frontiers[idx]]
        if not growable:
            break

        if targets:
            growable.sort(key=lambda i: (targets[i] - current_area[i]) / max(targets[i], 1), reverse=True)
        region = growable[0]

        cell = next(iter(frontiers[region]))
        frontiers[region].discard(cell)
        if cell in owner:
            continue

        owner[cell] = region
        current_area[region] += 1
        claimed += 1

        for other in shapes:
            frontiers[other].discard(cell)

        for q in neighbors4(cell):
            if q not in owner:
                frontiers[region].add(q)

    # any fully isolated pockets (unreachable from any region - shouldn't happen given
    # zone-based placement, but guard anyway) get assigned to nearest region by proximity
    if claimed < total_cells:
        remaining = [(x, y) for x in range(m) for y in range(n) if (x, y) not in owner]
        for cell in remaining:
            best_idx, best_dist = 0, float('inf')
            for idx in shapes:
                for oc in shapes[idx].all_cells():
                    d = abs(oc[0] - cell[0]) + abs(oc[1] - cell[1])
                    if d < best_dist:
                        best_dist, best_idx = d, idx
            owner[cell] = best_idx

    return owner


def owner_grid_to_shapes(owner, k):
    """Rebuild per-region cell sets (not rects) from a finalized owner grid, for
    accurate area accounting and rendering after gap-filling."""
    cells_by_region = {i: set() for i in range(k)}
    for cell, idx in owner.items():
        cells_by_region[idx].add(cell)
    return cells_by_region


def _is_connected_cellset(cells):
    if not cells:
        return True
    cells = set(cells)
    start = next(iter(cells))
    seen = {start}
    stack = [start]
    while stack:
        x, y = stack.pop()
        for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            nb = (x + dx, y + dy)
            if nb in cells and nb not in seen:
                seen.add(nb)
                stack.append(nb)
    return len(seen) == len(cells)


def _boundary_positions_by_row(owner, m, n, region_a, region_b):
    """For each row, find the x-position of the a/b boundary if these two
    regions are horizontally adjacent along that row (a to the left of b).
    Returns dict {y: x} where owner[(x-1,y)]==a and owner[(x,y)]==b, only for
    rows where exactly one such transition exists (clean single boundary)."""
    positions = {}
    for y in range(n):
        transitions = []
        for x in range(1, m):
            left = owner.get((x - 1, y))
            right = owner.get((x, y))
            if left == region_a and right == region_b:
                transitions.append(x)
        if len(transitions) == 1:
            positions[y] = transitions[0]
    return positions


def smooth_boundary_wobble(owner, m, n, targets=None, area_tolerance=0.12, max_shift=1):
    """Reduce multi-row staircase wobble along vertical boundaries between pairs
    of regions that are locally consistent (so per-cell majority voting can't
    see them as outliers) but wobble back and forth over several rows. For each
    adjacent region pair, look at the boundary's x-position per row, and pull
    any row whose position deviates from its local neighborhood's median toward
    that median by one column - guarded by the same connectivity and area
    tolerance checks as smooth_borders."""
    cells_by_region = {}
    for cell, idx in owner.items():
        cells_by_region.setdefault(idx, set()).add(cell)
    area = {idx: len(cells) for idx, cells in cells_by_region.items()}
    region_ids = list(cells_by_region.keys())

    def flip_is_acceptable(idx, delta):
        if not targets:
            return True
        old_diff = abs(area[idx] - targets[idx])
        new_diff = abs(area[idx] + delta - targets[idx])
        # allow if within tolerance, OR if it doesn't make an already-off-target
        # region worse (so a pre-existing imbalance doesn't block cosmetic fixes)
        within_band = new_diff <= area_tolerance * targets[idx] + 1
        not_worse = new_diff <= old_diff
        return within_band or not_worse

    changed_any = False
    for a in region_ids:
        for b in region_ids:
            if a == b:
                continue
            positions = _boundary_positions_by_row(owner, m, n, a, b)
            rows = sorted(positions.keys())
            if len(rows) < 5:
                continue

            for i, y in enumerate(rows):
                window = [positions[rows[j]] for j in range(max(0, i - 2), min(len(rows), i + 3))]
                window_sorted = sorted(window)
                median = window_sorted[len(window_sorted) // 2]
                current_x = positions[y]

                # decide target position: prefer the local median UNLESS doing so
                # would take area from whichever region (a or b) is more deficient
                # relative to its own target - in that case, bias toward giving
                # the deficient region more room instead of blindly following
                # local consensus, so straightening never fights area correction
                a_deficit = (targets[a] - area[a]) if targets else 0
                b_deficit = (targets[b] - area[b]) if targets else 0

                target_x = median
                if targets and abs(a_deficit - b_deficit) > 2:
                    # a is to the left of the boundary, b to the right;
                    # increasing x gives more columns to a, decreasing gives more to b
                    if a_deficit > b_deficit:
                        target_x = max(median, current_x + 1)
                    else:
                        target_x = min(median, current_x - 1)

                if target_x == current_x:
                    continue

                step = 1 if target_x > current_x else -1
                new_x = current_x + step * min(max_shift, abs(target_x - current_x))

                # moving the boundary right (new_x > current_x) means cells
                # [current_x, new_x) on row y flip from b to a; moving left
                # means cells [new_x, current_x) flip from a to b
                if new_x > current_x:
                    cells_to_flip = [(x, y) for x in range(current_x, new_x)]
                    losing, gaining = b, a
                else:
                    cells_to_flip = [(x, y) for x in range(new_x, current_x)]
                    losing, gaining = a, b

                if not cells_to_flip:
                    continue
                if not flip_is_acceptable(losing, -len(cells_to_flip)) or \
                   not flip_is_acceptable(gaining, len(cells_to_flip)):
                    continue

                for cell in cells_to_flip:
                    cells_by_region[losing].discard(cell)
                    cells_by_region[gaining].add(cell)

                if _is_connected_cellset(cells_by_region[losing]) and \
                   _is_connected_cellset(cells_by_region[gaining]):
                    for cell in cells_to_flip:
                        owner[cell] = gaining
                    area[losing] -= len(cells_to_flip)
                    area[gaining] += len(cells_to_flip)
                    positions[y] = new_x
                    changed_any = True
                else:
                    for cell in cells_to_flip:
                        cells_by_region[gaining].discard(cell)
                        cells_by_region[losing].add(cell)

    return owner, changed_any


def smooth_borders(owner, m, n, targets=None, area_tolerance=0.12, passes=8, majority_threshold=5):
    """Reduce single-cell sawtoothing on region borders. For each cell, if a
    strong majority of its 8-neighbors belong to a different region, flip it
    to that region - but only if doing so keeps both the losing and gaining
    region connected, and keeps areas within tolerance of target (when given).
    This only ever nudges boundaries; it cannot restructure the puzzle."""

    def neighbors8(p):
        x, y = p
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                q = (x + dx, y + dy)
                if 0 <= q[0] < m and 0 <= q[1] < n:
                    yield q

    cells_by_region = {}
    for cell, idx in owner.items():
        cells_by_region.setdefault(idx, set()).add(cell)
    area = {idx: len(cells) for idx, cells in cells_by_region.items()}

    def within_tolerance(idx, delta):
        if not targets:
            return True
        new_area = area[idx] + delta
        return abs(new_area - targets[idx]) <= area_tolerance * targets[idx] + 1

    for _ in range(passes):
        changed = False
        for cell in list(owner.keys()):
            current = owner[cell]
            counts = {}
            for q in neighbors8(cell):
                counts[owner[q]] = counts.get(owner[q], 0) + 1
            if not counts:
                continue
            best_region, best_count = max(counts.items(), key=lambda kv: kv[1])
            if best_region == current:
                continue
            # only flip if the majority is strong (looks like a notch/spike,
            # not a legitimate straight border running past this cell)
            if best_count < majority_threshold:
                continue
            if not within_tolerance(current, -1) or not within_tolerance(best_region, +1):
                continue

            cells_by_region[current].discard(cell)
            cells_by_region[best_region].add(cell)
            if _is_connected_cellset(cells_by_region[current]) and \
               _is_connected_cellset(cells_by_region[best_region]):
                owner[cell] = best_region
                area[current] -= 1
                area[best_region] += 1
                changed = True
            else:
                cells_by_region[current].add(cell)
                cells_by_region[best_region].discard(cell)
        if not changed:
            break

    return owner
