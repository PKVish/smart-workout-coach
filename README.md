# Smart Workout Coach JSON edition
Run on Mac: `cd smart-workout-coach-json && python3 -m http.server 8080`, then open `http://localhost:8080`.
Import a JSON file matching the included `sample-workout.json` structure.
Timed exercises advance automatically. Repetition-counted exercises require Set complete.
The final five seconds of every timed exercise and rest are announced. Exercise name is announced at exercise start and rest start. The visual guide begins two seconds after an exercise starts.
