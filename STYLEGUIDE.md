# HOLD PLEASE — Visual Style Guide

## Creative direction

An office-sitcom collision between clean editorial illustration and cheap motivational posters. Every reaction should feel readable in one screenshot. The character always keeps the phone to his ear: that visual rule is the joke.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| Ink | `#172033` | outlines, header, type |
| Paper | `#F2EADB` | warm background |
| Cream | `#FFF6DF` | sticker keyline, cards |
| Safety Orange | `#F36B38` | primary action, impact |
| Acid Lime | `#B7D84B` | success, boost, signal |
| Sage | `#798B5F` | supporting props |
| Dusty Blue | `#6B8BAA` | supporting props |
| Hazard Red | `#DA3A31` | damage only |

## Image rules

- Character and props use thick navy outlines, a narrow cream sticker keyline, flat colors, and restrained screenprint grain.
- Gameplay objects are raster sprites from `assets/character-sheet.png` and `assets/props-sheet.png`.
- Never use emoji, emoticons, font icons, stock UI glyphs, speech bubbles, or decorative logos.
- Keep the phone attached to the character in every pose.
- Silhouettes must stay readable at 60–90 CSS pixels.

## Type and layout

- Use a heavy rounded grotesk in all caps.
- Use a 430 × 932 portrait design coordinate system.
- Reserve the top 105 pixels for the HUD.
- Cards use 18–28 pixel corner radii, 4–6 pixel navy borders, and strong flat shadows.
- In play, show only score, time, signal, combo, and temporary event banners.

## Motion

- Physics should be bouncy, slightly overpowered, and immediately legible.
- Impacts use camera shake, brief palette flash, spinning sprites, and paper-ball debris.
- Round length is 20 seconds. Restart requires one tap.
- Meme-worthy results are short, dry, and screenshot-ready.
