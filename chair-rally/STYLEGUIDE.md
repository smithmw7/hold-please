# CHAIR RALLY: OVERTIME — Style Guide

## Creative thesis

An office supply closet became an illegal downhill league after everyone left. The game combines graceful hill flow with ridiculous office-chair engineering. It should feel authored, fast, and slightly too serious about performance reviews.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| Navy Ink | `#14233B` | outlines, extrusion, night architecture |
| Warm White | `#FFFDF4` | primary dimensional text |
| Legal Yellow | `#FFD83D` | emphasis, meters, signature `YEAH!` |
| Safety Orange | `#F36B38` | speed and impact |
| Battery Lime | `#B7DB35` | battery pickups and charge |
| Dusty Cyan | `#79B7C9` | air and atmosphere |
| Coffee Brown | `#7B4526` | coffee boost |
| Failure Red | `#D93A31` | crash state only |

## Environment

- Far skyline: luminous blue-hour city and folder-shaped mountains.
- Midground: office campus silhouettes, lamps, shrubs, coffee-cup water tower.
- Near ground: broad, C1-smooth designed hills. Never use collision micro-noise.
- The road texture is a WebGL fragment-shader output using the AI-rendered material atlas. Warp detail visually; keep collision geometry smooth.
- Use at least four motion depths: sky, far city, office campus, near shadow hills, road.

## Character and VFX

- The character, racing chair, battery, wheels, phone, and coffee holder must read as one connected side-view rig.
- Phone stays at the right ear in every pose.
- Use rendered VFX only for meaningful events: pickup, takeoff, landing, huge air, trick, or crash.
- No emoji, stock icons, speech bubbles, or generic neon glows.

## Dimensional type

Draw large text in this order:

1. Navy extrusion at `+6,+8`.
2. Near-black outer stroke at 7–9 px.
3. Warm-white or legal-yellow face.
4. Thin white upper-left highlight.

White and yellow are the only headline face colors. `YEAH!` is yellow, rotated, overscaled, and backed by the rendered radial burst.

## Motion and camera

- Fixed 120 Hz simulation.
- Rider sits around 35–40% of screen width.
- Smooth look-ahead increases with speed.
- Zoom widens for speed and huge air, then returns slowly after landing.
- HUD never shakes.
- Reduced-motion mode removes camera roll and cuts shake/parallax.

## Audio

- Original 152 BPM E-minor-pentatonic synth track.
- Retro pulse lead, saturated modern mid-bass, sine sub, generated drums.
- Music reacts to speed, huge air, critical battery, and coffee overdrive.
- Audio starts only after a user gesture and always has a persistent mute control.
