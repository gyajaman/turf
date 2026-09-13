# Guess the Largest Area

A daily puzzle game: three levels a day (easy, medium, hard), each showing a
grid tiled into colored regions — pick the one with the largest area. Static
site, no backend; a GitHub Actions cron job regenerates the puzzle every
midnight IST and commits it as JSON.

## Local development

Generate a puzzle for a given date (stdlib only, no dependencies):

```bash
cd generator
python build_daily.py --date 2026-09-14 --out ../data/levels
```

Serve the site (plain `file://` won't work because of `fetch()` + CORS):

```bash
python -m http.server 8000
```

Open `http://localhost:8000/`. To preview a specific generated date without
waiting for real IST midnight, use `?date=YYYY-MM-DD`, e.g.
`http://localhost:8000/?date=2026-09-14`.

## How it's generated

`generator/rect_shapes.py` and `generator/difficulty.py` contain the puzzle
generator (guillotine partition → core/arm region placement → gap-filling →
border smoothing). `generator/build_daily.py` drives that pipeline with a
date-derived seed to produce a reproducible 3-level puzzle set as JSON.

## Deploying

Push to `main` with GitHub Pages set to **Settings → Pages → Deploy from a
branch → `main` / `(root)`**. The scheduled workflow in
`.github/workflows/build-daily.yml` commits each day's puzzle automatically;
that push triggers Pages' own rebuild.
