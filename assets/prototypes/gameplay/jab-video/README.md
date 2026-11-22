# Experimental video-derived jab

The author supplied `/home/enikey/video/jab.mp4` (24 fps). Eight reference frames were selected: 27, 29, 30, 31, 33, 38, 39, 41, zero-based. The corrected storyboard extends the lead arm farther, removes the long original extension hold and keeps a short deliberate contact pose. The author approved trying it in gameplay on 2026-11-22.

`approved-storyboard.png` is the reviewed v2 board. `transparent-sheet.png` is its background-removal pass through the built-in image generator. Both are original-size inputs. Runtime sprites are lossless alpha WebP in `scene-lab/public/art/fight/jab/`.

The transparent sheet is split into eight 450×436 cells. Each cell is registered from the rear heel and front toe against cell 0; a common affine registration matches the existing `boxer-0.webp` boot anchors and top of the head. `registration.json` records the transform and measured anchors. Rasterized boot anchors match across all eight frames; residual differences against the legacy stance are below 1 world pixel after rasterization; the previous preview's exact alignment cannot be assumed after background removal and matching to a different stance. Frame 7 is a byte-identical copy of frame 0. Transparent gaps and body opacity are checked in the browser.

`jabFrame()` selects the new drawings inside the existing combat cels: three startup poses in 100 ms, full extension during the 90 ms active cel, two recoil poses in the 90 ms settle cel and two return poses in the 90 ms recovery cel. Hitstop freezes the same action clock. Hit-confirm cancels remain immediate after hitstop, so a queued combo can interrupt the return. Edited cel durations retime the sequence; edited poses use the legacy drawings. Airborne jabs, hit reactions and crouching recovery use the existing pose rules.

This experiment changes the jab's art only. Damage, collision rectangles, range and cancel rules retain their existing values; collision is still hand-authored and does not track the new wrist pixel-for-pixel. Other moves retain their artwork. If the longer drawn fist calls for a reach adjustment after playtesting, that needs a separate balance change and corner/AI checks.

Prompt intent: preserve the same character and fixed side camera; extend the near lead arm through shoulder protraction, keep the far hand at the cheek, retain planted feet, show a distinct recoil, remove the neutral background without changing the action. Check face/clothes continuity during play: generated drawings can retain small differences despite registration.

Technical inspiration: https://academy.studioigor.com/guides/fighting-with-deepseek/lessons/d03-sprites.html and https://academy.studioigor.com/guides/fighting-with-deepseek/lessons/d06-smooth.html. The implementation is independent; no code was imported.
