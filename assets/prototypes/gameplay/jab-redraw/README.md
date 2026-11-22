# Redrawn jab and key-pose collision audit

Archived high-resolution redraw, tried in gameplay on 2026-11-22 and subsequently rejected by the author for style drift and excessive arm length. Current jab: [original-texture animation](../jab-reference-animation/README.md). This folder retains that experiment and the current shared contact audit. `pose-01.png` through `pose-08.png` are registered transparent source frames (1254×1254). Frame 08 repeats frame 01 exactly. The original master style reference is `../fight-boxer-source.png`; the spoiled video-derived animation was used only as a movement reference. Prompts: `PROMPTS.md`. No new video extraction is used at runtime.

The archived runtime WebPs were lossless exports after the common affine transform in `registration.json`. It registers the master feet and head against the original idle drawing, then applies exactly the same transform to every frame. All source frames share an identical lower body below source row 610. Render scale 0.5265107913669065 keeps the original body size while downsampling the new drawing.

Timing: startup 80 ms (three drawings), contact 80 ms (full extension), settle 80 ms (two drawings), final recovery 100 ms (two drawings). Total 340 ms before contact hitstop. Hitstop freezes the contact drawing. Confirmed follow-ups can cancel recovery; a miss cannot.

## Collision policy

Hero contact tips lead the visible fist by roughly 18 world pixels (accepted band 12–24). Hurt boxes sit inside the visible arm, and follow each of the eighteen current jab frames and the other attack key poses. Boxes are gameplay approximations, not per-pixel masks. Uppercuts and overhead attacks sweep a vertical arc; their contact rectangle intentionally includes the travel between drawn poses. Worker blades receive a small inset instead of the hero bonus. The shovel never becomes a vulnerable limb. Its sweep has a low body/head profile; overhead follows the forward leaning body.

The table measures opaque pixels (alpha ≥128) in actual runtime textures. `contact-audit.json` contains measurement regions, runtime asset hashes and full vertical bounds. Heights exclude legs/torso when selecting the forward fist. Browser tests independently decode the images and check all thirteen active overlays; model tests check mirrored contacts, exact reach boundaries, recovery and editor reset.

| Attack | Visible forward tip | Hit tip | Margin |
| --- | ---: | ---: | ---: |
| jab | 247.5 | 266 | +18.5 |
| cross | 227.3 | 245 | +17.7 |
| heavy | 227.3 | 245 | +17.7 |
| low | 320.3 | 338 | +17.7 |
| upper | 205.2 | 223 | +17.8 |
| long | 254.7 | 273 | +18.3 |
| overhand | 227.3 | 245 | +17.7 |
| backfist | 227.3 | 245 | +17.7 |
| poke | 295.2 | 255 | -40.2 |
| thrust | 295.2 | 275 | -20.2 |
| sweep | 444.4 | 432 | -12.4 |
| spin | 253.8 | 255 | +1.2 |
| overhead | 368.0 | 356 | -12.0 |

Runtime debug: enable «Хитбоксы» during a fight, or use the training phase editor. Cyan is vulnerable body, red is active contact. Inactive, recoil and shovel spin gaps have no active contact box. Training pose edits update the associated hurt profile; restoring defaults restores audited geometry.

Source-only artwork and registration are kept here for repeatable exports. Runtime: `scene-lab/public/art/fight/jab/` and `manifest.json`. Verification: `combat-boxes.test.ts`, `combat-boxes.spec.ts`, `jab-animation.test.ts`, `jab-animation.spec.ts` and existing fight/input/browser suites.
