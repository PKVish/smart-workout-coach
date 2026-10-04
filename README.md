# Smart Workout Coach v4

Section 2 circuit behavior:
- `total_circuit_rounds` controls the exact number of rounds.
- When all round definitions are present, each matching definition is used.
- When only one circuit round/subsection is present, it is reused as the template for every requested round.
- Warm-up and cool-down sections continue to run once.

Run locally with `python3 -m http.server 8080`.
