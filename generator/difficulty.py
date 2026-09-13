import random


DIFFICULTY_RANGES = {
    "easy": (0.55, 0.95),
    "medium": (0.25, 0.95),
    "hard": (0.05, 0.95),
}

# how strongly we force the two closest-area regions apart in compactness,
# as a fraction of the full [0,1] range. 0 = no forcing, just pure random draw.
DIFFICULTY_CONTRAST = {
    "easy": 0.0,
    "medium": 0.35,
    "hard": 0.75,
}


def make_targets(total, k, max_ratio, seed):
    """Sample k target areas summing to `total`, with the largest-to-smallest
    ratio bounded by max_ratio."""
    rng = random.Random(seed)
    weights = [rng.uniform(1.0, max_ratio) for _ in range(k)]
    scale = total / sum(weights)
    targets = [max(1, round(w * scale)) for w in weights]
    diff = total - sum(targets)
    i = 0
    while diff != 0:
        idx = i % k
        if diff > 0:
            targets[idx] += 1
            diff -= 1
        else:
            if targets[idx] > 1:
                targets[idx] -= 1
                diff += 1
        i += 1
    return targets


def sample_compactness(k, difficulty, targets, rng):
    """
    Sample a compactness value per region, randomized within the difficulty's
    range, then nudge the two closest-in-target-area regions toward opposite
    ends of the range so difficulty is guaranteed to be felt, not just likely.
    """
    lo, hi = DIFFICULTY_RANGES[difficulty]
    contrast = DIFFICULTY_CONTRAST[difficulty]

    compactness = [rng.uniform(lo, hi) for _ in range(k)]

    if k >= 2 and contrast > 0:
        order = sorted(range(k), key=lambda i: targets[i])
        best_gap = None
        best_pair = (order[0], order[1])
        for i in range(len(order) - 1):
            a, b = order[i], order[i + 1]
            gap = abs(targets[a] - targets[b])
            if best_gap is None or gap < best_gap:
                best_gap = gap
                best_pair = (a, b)

        idx_blocky, idx_elongated = best_pair
        # push one toward the high end, the other toward the low end,
        # blended with their original random draw by (1 - contrast)
        compactness[idx_blocky] = (1 - contrast) * compactness[idx_blocky] + contrast * hi
        compactness[idx_elongated] = (1 - contrast) * compactness[idx_elongated] + contrast * lo

    return compactness


def sample_difficulty_puzzle(m, n, k, difficulty, seed, max_ratio=1.3):
    """Convenience wrapper: generates targets and compactness together for a
    given difficulty label, fully randomized but reproducible from `seed`."""
    rng = random.Random(seed)
    targets = make_targets(m * n, k, max_ratio, seed=seed)
    compactness = sample_compactness(k, difficulty, targets, rng)
    return targets, compactness
