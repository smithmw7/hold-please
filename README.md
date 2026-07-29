# Hightop Office Arcade

Two fast physics games starring the most committed person on the call.

## Play

- **[Play CHAIR RALLY: OVERTIME](https://smithmw7.github.io/hold-please/chair-rally/)** — a landscape hill racer powered by batteries, coffee, and questionable office-chair engineering.
- **[Play HOLD PLEASE](https://smithmw7.github.io/hold-please/)** — a portrait one-thumb physics game about staying on a serious phone call while the office falls apart.

## CHAIR RALLY controls

- Hold the right side to accelerate and lean forward in the air.
- Hold the left side to brake and lean back.
- Collect batteries to keep moving and coffee for temporary overdrive.
- Arrow keys also work on desktop.

## HOLD PLEASE controls

- Tap anywhere to punt the chair toward that point.
- Hit office props, build combos, avoid staplers, and survive the 20-second call.

## Project

Both games use HTML canvas, vanilla JavaScript physics, and custom raster sprite sheets. CHAIR RALLY also uses WebGL shader-warped terrain and a procedural Web Audio soundtrack. No framework or build step is required.

Run locally:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.
