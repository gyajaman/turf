import argparse
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

from difficulty import sample_difficulty_puzzle
from rect_shapes import (
    fill_gaps,
    generate_rect_puzzle,
    owner_grid_to_shapes,
    smooth_boundary_wobble,
    smooth_borders,
)

PALETTE = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"]
DIFFICULTIES = ["easy", "medium", "hard"]
K_BY_DIFFICULTY = {"easy": 3, "medium": 4, "hard": 5}
TIE_RETRY_STEP = 104729  # large prime, keeps retried seeds well spread out
MAX_TIE_RETRIES = 20


def ist_today_str():
    ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    return ist_now.strftime("%Y-%m-%d")


def build_owner_grid(m, n, k, difficulty, seed):
    targets, compact = sample_difficulty_puzzle(m, n, k, difficulty, seed=seed)
    shapes = generate_rect_puzzle(m, n, targets, compact, seed=seed + 5000)
    owner = fill_gaps(shapes, m, n, targets=targets)
    owner = smooth_borders(owner, m, n, targets=targets, majority_threshold=5, passes=8)
    for _ in range(6):
        owner, changed = smooth_boundary_wobble(owner, m, n, targets=targets)
        if not changed:
            break
    return owner_grid_to_shapes(owner, k)


def owner_rows(cells_by_region, m, n):
    grid = [["0"] * m for _ in range(n)]
    for region_id, cells in cells_by_region.items():
        for x, y in cells:
            grid[y][x] = str(region_id)
    return ["".join(row) for row in grid]


def build_level(m, n, k, difficulty, seed):
    for attempt in range(MAX_TIE_RETRIES):
        level_seed = seed + attempt * TIE_RETRY_STEP
        cells_by_region = build_owner_grid(m, n, k, difficulty, level_seed)
        areas = {rid: len(cells) for rid, cells in cells_by_region.items()}
        ranked = sorted(areas.items(), key=lambda kv: -kv[1])
        if ranked[0][1] != ranked[1][1]:
            break
    else:
        raise RuntimeError(f"could not resolve an area tie for {difficulty} seed={seed}")

    answer_region_id = ranked[0][0]

    color_rng = random.Random(level_seed)
    colors = PALETTE[:k]
    color_rng.shuffle(colors)

    regions = [
        {"id": rid, "area": areas[rid], "color": colors[rid]}
        for rid in sorted(areas)
    ]

    return {
        "difficulty": difficulty,
        "k": k,
        "regions": regions,
        "answerRegionId": answer_region_id,
        "rows": owner_rows(cells_by_region, m, n),
    }


def build_day(date_str, m=24, n=16):
    seed_base = int(date_str.replace("-", ""))
    levels = [
        build_level(m, n, K_BY_DIFFICULTY[diff], diff, seed=seed_base * 10 + i)
        for i, diff in enumerate(DIFFICULTIES)
    ]
    return {
        "date": date_str,
        "generatorVersion": 1,
        "grid": {"cols": m, "rows": n},
        "levels": levels,
    }


def main():
    parser = argparse.ArgumentParser(description="Generate a day's 3-level puzzle set.")
    parser.add_argument("--date", default=None, help="YYYY-MM-DD (defaults to today in IST)")
    parser.add_argument("--out", default="data/levels", help="output directory")
    parser.add_argument("--m", type=int, default=24, help="grid columns")
    parser.add_argument("--n", type=int, default=16, help="grid rows")
    args = parser.parse_args()

    date_str = args.date or ist_today_str()
    day = build_day(date_str, m=args.m, n=args.n)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{date_str}.json"
    out_path.write_text(json.dumps(day, separators=(",", ":")))
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
