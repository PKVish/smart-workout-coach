# Smart Workout Coach

A dependency-free Progressive Web App that parses text workouts, runs timed sets automatically, pauses for human confirmation on rep-counted sets, plays synthesized bells, provides voice coaching, and works offline after first load.

## Run locally on macOS
1. Open Terminal and `cd` into this folder.
2. Run: `python3 -m http.server 8080`
3. Open `http://localhost:8080` in Safari or Chrome.

Do not open index.html directly from Finder because service workers require localhost or HTTPS.

## Free hosting with GitHub Pages
Create a public GitHub repository, upload these files at the repository root, then open Settings > Pages, choose “Deploy from a branch”, branch `main`, folder `/ (root)`, and save.

## Install
- iPhone/iPad: open hosted HTTPS URL in Safari, Share > Add to Home Screen.
- Android/Windows/macOS Chromium: use the browser Install button or the in-app Install app button when offered.

## Input format
- `Plank: 45 sec x 3, rest 20 sec`
- `Push-ups: 12 reps, 3 sets, rest 30 sec`
- `[00:00-00:30] Jumping Jacks: 30 sec`

Limit: timestamps embedded in input are recognized and displayed; the active schedule is calculated from exercise and rest durations.
