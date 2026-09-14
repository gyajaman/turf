# Turf

A daily puzzle game: three levels a day (easy, medium, hard), each showing a
board tiled into a few territories — tap the one you think covers the most
ground, confirm, and watch the areas reveal smallest to largest. Static
site, no backend; a GitHub Actions cron job regenerates the puzzle every
midnight IST and commits it as JSON.

## Local development

The site always loads today's puzzle by the real IST calendar date (no date
override) — so to preview it locally, generate today's date specifically
(stdlib only, no dependencies):

```bash
cd generator
python build_daily.py --out ../data/levels
```

`--date YYYY-MM-DD` is still available for generating other dates (e.g. for
CI backfills), it's just not selectable from the page itself.

Serve the site (plain `file://` won't work because of `fetch()` + CORS):

```bash
python -m http.server 8000
```

Open `http://localhost:8000/`.

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
