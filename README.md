# Collect & Conquer — Lore Production System

The production app and its research data for the Magic: The Gathering lore series. The current build contains the 371-episode master outline and the regenerated Episode 2 production record.

## Run locally

```bash
npm ci
npm run dev
```

## Production workflow

Episodes are developed on demand in the app. Narration, scene-specific visual selection, illustrative background art, and chapter-level source notes are kept with the selected episode. Episode 2 includes five sustained scenes and its primary-text references.

## Hosting

The GitHub Pages workflow builds the Vite app and deploys it on updates to `main`. The app is a static site; edits and visual selections are saved in the current browser's local storage and do not synchronize between devices.

The full-text novel extraction (`thran_chapters.json`), source EPUBs, backup datasets, local exports, and build dependencies are excluded from the GitHub repository. The app's episode summaries, narration, and production data are included in the hosted build.

## Checks

```bash
npm test
npm run build
```
